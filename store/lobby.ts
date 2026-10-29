import { Player, PlayerIdPrefix } from '../types/player'
import { validateBattleTag } from '../utils/heroesOfTheStorm'
import { sql } from './db'
import {
  getAccountRowIdFromIdentifier,
  getActivePlayers,
  getPlayerByIdentifier,
  getPlayerMMR,
  triggerAccountMmrFetch,
} from './player'
import {
  clearActivePlayersCache,
  getActivePlayersCacheEntry,
  setActivePlayersCacheEntry,
} from './playerCache'

/**
 * Marks all players as inactive in the database for a guild.
 */
export async function markAllPlayersInactive(guildId: string): Promise<void> {
  await sql`DELETE FROM lobby_players WHERE guild_id = ${guildId}`
  clearActivePlayersCache(guildId)
}

async function resolvePlayerForActive(
  identifier: string,
  guildId: string,
  active: boolean,
  hotsBattleTag?: string
): Promise<Player | undefined> {
  let player = await getPlayerByIdentifier(identifier, guildId)
  if (player) return player

  const tag =
    hotsBattleTag ??
    (identifier.startsWith(PlayerIdPrefix.TAG) ? identifier.slice(PlayerIdPrefix.TAG.length) : undefined)
  if (!tag) return undefined

  player = await getPlayerByIdentifier(`${PlayerIdPrefix.TAG}${tag}`, guildId)
  if (player || !active) return player

  if (validateBattleTag(tag).isValid) {
    const inserted = await sql<Array<{ id: number }>>`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (NULL, ${tag}, TRUE)
      ON CONFLICT (LOWER(hots_battle_tag)) WHERE owner_discord_id IS NULL DO UPDATE SET
        hots_battle_tag = EXCLUDED.hots_battle_tag
      RETURNING id
    `
    const newAccId = inserted[0].id
    triggerAccountMmrFetch(tag, guildId).catch(err => {
      console.error(`Error in background MMR fetch for ${tag}:`, err)
    })
    return await getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${newAccId}`, guildId)
  }

  return undefined
}

async function activatePlayerInLobby(guildId: string, player: Player, accId: number | null): Promise<void> {
  if (player.discordId) {
    await sql`
      INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, lobby_rank, team, draft_order, role)
      VALUES (${guildId}, ${player.discordId}, ${accId}, TRUE, NULL, NULL, NULL, ${player.role ?? null})
      ON CONFLICT (guild_id, discord_id) DO UPDATE SET
        active = TRUE,
        hots_account_id = COALESCE(EXCLUDED.hots_account_id, lobby_players.hots_account_id),
        role = COALESCE(EXCLUDED.role, lobby_players.role),
        lobby_rank = NULL,
        team = NULL,
        draft_order = NULL
    `
  } else if (accId) {
    await sql`
      INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, lobby_rank, team, draft_order, role)
      VALUES (${guildId}, NULL, ${accId}, TRUE, NULL, NULL, NULL, ${player.role ?? null})
      ON CONFLICT (guild_id, hots_account_id) DO UPDATE SET
        active = TRUE,
        role = COALESCE(EXCLUDED.role, lobby_players.role),
        lobby_rank = NULL,
        team = NULL,
        draft_order = NULL
    `
  }
}

async function deactivatePlayerInLobby(guildId: string, player: Player, accId: number | null): Promise<void> {
  if (player.lobbyRank > 0) {
    await sql`
      UPDATE lobby_players
      SET lobby_rank = lobby_rank - 1
      WHERE guild_id = ${guildId} AND lobby_rank > ${player.lobbyRank}
    `
  }
  if (player.discordId) {
    await sql`DELETE FROM lobby_players WHERE guild_id = ${guildId} AND discord_id = ${player.discordId}`
  } else if (accId) {
    await sql`DELETE FROM lobby_players WHERE guild_id = ${guildId} AND hots_account_id = ${accId}`
  }
}

async function addDummyHotsAccount(discordId: string, hotsBattleTag: string): Promise<void> {
  const existing = await sql<Array<{ id: number }>>`
    SELECT id
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  if (existing.length > 0) {
    await sql`
      UPDATE hots_accounts
      SET discord_id = ${discordId}, is_primary = TRUE
      WHERE id = ${existing[0].id}
    `
  } else {
    await sql`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (${discordId}, ${hotsBattleTag}, TRUE)
      ON CONFLICT (LOWER(hots_battle_tag)) WHERE owner_discord_id IS NULL DO UPDATE SET
        discord_id = EXCLUDED.discord_id,
        is_primary = TRUE
    `
  }
}

/**
 * Sets the active status of a player in the database.
 */
export async function setPlayerActive(
  identifier: string,
  active: boolean,
  guildId: string,
  hotsBattleTag?: string
): Promise<{ updated: boolean; player?: Player }> {
  const player = await resolvePlayerForActive(identifier, guildId, active, hotsBattleTag)
  if (!player) {
    return { updated: false, player }
  }

  if (player.discordId && player.usernames.accounts?.length === 0 && hotsBattleTag) {
    await addDummyHotsAccount(player.discordId, hotsBattleTag)
  }

  if (player.active === active) {
    return { updated: false, player }
  }

  const matchedAcc = hotsBattleTag
    ? player.usernames.accounts?.find(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
    : undefined
  const accId =
    matchedAcc?.id ??
    player.usernames.accounts?.find(a => a.isPrimary)?.id ??
    player.usernames.accounts?.[0]?.id ??
    null

  if (active) {
    await activatePlayerInLobby(guildId, player, accId)
  } else {
    await deactivatePlayerInLobby(guildId, player, accId)
  }

  if (player.discordId) {
    await sql`UPDATE players SET last_active = NOW() WHERE discord_id = ${player.discordId}`
  }

  await recalculateLobbyRanks(guildId)

  player.active = active
  return { updated: true, player }
}

/**
 * Recalculates the lobby ranks for all players in a guild.
 */
export async function recalculateLobbyRanks(guildId: string): Promise<void> {
  const activePlayers = await getActivePlayers(guildId)
  const allPlayers = activePlayers.sort((a, b) => getPlayerMMR(b) - getPlayerMMR(a))

  let currentRank = 1
  for (let i = 0; i < allPlayers.length; i++) {
    const player = allPlayers[i]
    if (player.active) {
      const lobbyRank = currentRank++
      if (player.lobbyRank !== lobbyRank) {
        const accId = player.usernames.accounts?.[0]?.id
        if (player.discordId) {
          await sql`
            UPDATE lobby_players
            SET lobby_rank = ${lobbyRank}
            WHERE guild_id = ${guildId} AND discord_id = ${player.discordId}
          `
        } else if (accId) {
          await sql`
            UPDATE lobby_players
            SET lobby_rank = ${lobbyRank}
            WHERE guild_id = ${guildId} AND hots_account_id = ${accId}
          `
        }
      }
      player.lobbyRank = i
    }
  }
  setActivePlayersCacheEntry(guildId, allPlayers)
}

/**
 * Clears the team assignments for all players in a specific guild.
 */
export async function clearTeams(guildId: string): Promise<void> {
  await sql`UPDATE lobby_players SET team = NULL, lobby_rank = NULL WHERE guild_id = ${guildId}`
  clearActivePlayersCache(guildId)
}

/**
 * Sets the teams for the players in a specific guild.
 */
export async function setTeamsFromPlayers(
  guildId: string,
  team1: Player[],
  team2: Player[],
  spectators: Player[]
): Promise<void> {
  await sql.begin(async tx => {
    await tx`
      UPDATE lobby_players
      SET team = NULL, lobby_rank = NULL, draft_order = NULL
      WHERE guild_id = ${guildId}
    `

    const insertOrUpdatePlayer = async (p: Player, teamVal: number | null) => {
      const lRank = Number.isNaN(p.lobbyRank) || p.lobbyRank === undefined ? null : p.lobbyRank
      const dOrder = Number.isNaN(p.draftOrder) || p.draftOrder === undefined ? null : p.draftOrder
      const accId = p.usernames.accounts?.find(a => a.isPrimary)?.id ?? p.usernames.accounts?.[0]?.id ?? null
      if (p.discordId) {
        await tx`
          INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, team, lobby_rank, draft_order, role)
          VALUES (${guildId}, ${p.discordId}, ${accId}, TRUE, ${teamVal}, ${lRank}, ${dOrder}, ${p.role ?? null})
          ON CONFLICT (guild_id, discord_id) DO UPDATE SET
            active = TRUE,
            team = EXCLUDED.team,
            lobby_rank = EXCLUDED.lobby_rank,
            draft_order = EXCLUDED.draft_order,
            role = COALESCE(EXCLUDED.role, lobby_players.role)
        `
      } else if (accId) {
        await tx`
          INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, team, lobby_rank, draft_order, role)
          VALUES (${guildId}, NULL, ${accId}, TRUE, ${teamVal}, ${lRank}, ${dOrder}, ${p.role ?? null})
          ON CONFLICT (guild_id, hots_account_id) DO UPDATE SET
            active = TRUE,
            team = EXCLUDED.team,
            lobby_rank = EXCLUDED.lobby_rank,
            draft_order = EXCLUDED.draft_order,
            role = COALESCE(EXCLUDED.role, lobby_players.role)
        `
      }
    }

    for (const p of team1) {
      await insertOrUpdatePlayer(p, 1)
    }
    for (const p of team2) {
      await insertOrUpdatePlayer(p, 2)
    }
    for (const p of spectators) {
      await insertOrUpdatePlayer(p, null)
    }
  })
  clearActivePlayersCache(guildId)
}

export async function changeTeams(
  guildId: string,
  playerChanges: { discordId: string; newTeam: number | null }[]
): Promise<boolean> {
  for (const { discordId, newTeam } of playerChanges) {
    const accId = await getAccountRowIdFromIdentifier(discordId)
    if (accId !== null) {
      await sql`
        UPDATE lobby_players
        SET team = ${newTeam}
        WHERE guild_id = ${guildId} AND hots_account_id = ${accId}
      `
    } else {
      await sql`
        INSERT INTO lobby_players (guild_id, discord_id, active, team)
        VALUES (${guildId}, ${discordId}, TRUE, ${newTeam})
        ON CONFLICT (guild_id, discord_id) DO UPDATE SET team = EXCLUDED.team
      `
    }
  }
  clearActivePlayersCache(guildId)
  return true
}

/**
 * Assigns a specific player to a team (1, 2, or null) and draft_order in a specific guild.
 */
export async function assignPlayerToTeam(
  guildId: string,
  identifier: string,
  team: number | null,
  draftOrder: number | null = null
): Promise<void> {
  const accId = await getAccountRowIdFromIdentifier(identifier)

  if (draftOrder !== null) {
    const existingRows = await sql<Array<{ discord_id: string | null; hots_account_id: number | null }>>`
      SELECT discord_id, hots_account_id
      FROM lobby_players
      WHERE guild_id = ${guildId} AND active = TRUE AND draft_order = ${draftOrder}
      LIMIT 1
    `
    const existingPlayer = existingRows[0]
    if (
      existingPlayer &&
      ((existingPlayer.discord_id && existingPlayer.discord_id !== identifier) ||
        (existingPlayer.hots_account_id && (accId === null || existingPlayer.hots_account_id !== accId)))
    ) {
      const nextRank = await getNextDraftOrder(guildId)
      if (existingPlayer.discord_id) {
        await sql`
          UPDATE lobby_players
          SET draft_order = ${nextRank}
          WHERE guild_id = ${guildId} AND discord_id = ${existingPlayer.discord_id}
        `
      } else if (existingPlayer.hots_account_id) {
        await sql`
          UPDATE lobby_players
          SET draft_order = ${nextRank}
          WHERE guild_id = ${guildId} AND hots_account_id = ${existingPlayer.hots_account_id}
        `
      }
    }
  }

  if (accId !== null) {
    await sql`
      UPDATE lobby_players
      SET team = ${team}, draft_order = ${draftOrder}
      WHERE guild_id = ${guildId} AND hots_account_id = ${accId}
    `
  } else {
    await sql`
      INSERT INTO lobby_players (guild_id, discord_id, active, team, draft_order)
      VALUES (${guildId}, ${identifier}, TRUE, ${team}, ${draftOrder})
      ON CONFLICT (guild_id, discord_id) DO UPDATE SET
        team = EXCLUDED.team,
        draft_order = EXCLUDED.draft_order
    `
  }
  clearActivePlayersCache(guildId)
}

/**
 * Resets team and draft_order for all active players in a specific guild.
 */
export async function resetActivePlayerTeams(guildId: string): Promise<void> {
  await sql`
    UPDATE lobby_players
    SET team = NULL, draft_order = NULL
    WHERE guild_id = ${guildId} AND active = TRUE
  `
  clearActivePlayersCache(guildId)
}

/**
 * Calculates the next available draft order number for a specific guild draft.
 */
export async function getNextDraftOrder(guildId: string): Promise<number> {
  const rows = await sql<Array<{ max_order: number | null }>>`
    SELECT MAX(draft_order)::int AS max_order
    FROM lobby_players
    WHERE guild_id = ${guildId} AND active = TRUE AND draft_order IS NOT NULL
  `
  const maxOrder = rows[0]?.max_order ?? 0
  return Math.max(2, maxOrder) + 1
}

/**
 * Returns the count of non-captain picked players on Team 1 or Team 2 for a specific guild.
 */
export async function getDraftPickedCount(
  guildId: string,
  t1CaptainId?: string,
  t2CaptainId?: string
): Promise<number> {
  if (t1CaptainId && t2CaptainId) {
    const rows = await sql<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM lobby_players
      WHERE guild_id = ${guildId}
        AND active = TRUE
        AND (team = 1 OR team = 2)
        AND (discord_id IS NULL OR discord_id NOT IN (${t1CaptainId}, ${t2CaptainId}))
    `
    return rows[0]?.count ?? 0
  }
  const rows = await sql<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM lobby_players
    WHERE guild_id = ${guildId}
      AND active = TRUE
      AND (team = 1 OR team = 2)
      AND (draft_order > 2 OR draft_order IS NULL)
  `
  return rows[0]?.count ?? 0
}

/**
 * Retrieves sorted active players for a specific guild, with per-guild caching.
 */
export async function getSortedActivePlayers(guildId: string, forceRefresh = false): Promise<Player[]> {
  const cacheEntry = getActivePlayersCacheEntry(guildId)
  if (forceRefresh || !cacheEntry || Date.now() - cacheEntry.timestamp >= 5000) {
    const active = await getActivePlayers(guildId)
    const data = active.sort((a, b) => getPlayerMMR(b) - getPlayerMMR(a))
    data.forEach((p, index) => {
      p.lobbyRank = index
    })
    setActivePlayersCacheEntry(guildId, data)
    return data
  }
  return cacheEntry.data
}

/**
 * Gets the teams from the active players for a specific guild.
 */
export async function getTeams(
  guildId: string,
  activePlayers?: Player[]
): Promise<{
  team1: Player[]
  team2: Player[]
  spectators: Player[]
  t1Captain: Player
  t2Captain: Player
}> {
  const resolvedPlayers = activePlayers ?? (await getSortedActivePlayers(guildId))
  const team1 = resolvedPlayers.filter(p => p.team === 1)
  const team2 = resolvedPlayers.filter(p => p.team === 2)
  const spectators = resolvedPlayers.filter(p => p.team !== 1 && p.team !== 2)
  const t1Captain = team1.find(p => p.draftOrder === 1) ?? team1[0] ?? resolvedPlayers[0]
  const t2Captain =
    team2.find(p => p.draftOrder === 2) ??
    team2[0] ??
    (t1Captain === resolvedPlayers[0] ? resolvedPlayers[1] : resolvedPlayers[0])
  return { team1, team2, spectators, t1Captain, t2Captain }
}

