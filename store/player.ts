import { writeFile, rename } from 'fs/promises'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js'
import { sql } from './db'
import {
  AccountSubstitution,
  AccountSubstitutionRow,
  DiscordUserNames,
  FlatPlayer,
  FormatPlayerDisplayOptions,
  HotsAccount,
  HotSAccountMatch,
  HotsAccountRow,
  PLAYER_STATS_VIEW_SCHEMA_SQL,
  Player,
  PlayerAggregatedStats,
  PlayerIdPrefix,
  PLAYERS_TABLES_SCHEMA_SQL,
  PlayerStatsFilter,
  RegisteredPlayerAccount,
  ReplayPlayerStatRow,
  ResolvedHotsAccount,
} from '../types/player'
import { updateLobbyMessage } from '../commands'
import { CommandIds, roleMap } from '../constants'
import { getHeroesProfileData } from './heroesProfile'
import { requireGuildId, safeReply, safeDeferUpdate } from '../utils/interaction'
import { validateBattleTag } from '../utils/heroesOfTheStorm'

export {
  PlayerIdPrefix,
  type FormatPlayerDisplayOptions,
  type HotSAccountMatch,
  type RegisteredPlayerAccount,
  type ResolvedHotsAccount,
}

export const interactionStore = new Map<string, ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>>()
const playerDisplayNameCache = new Map<string, string>()

function cachePlayerDisplayName(
  discordId: string | null | undefined,
  displayName?: string | null,
  globalName?: string | null,
  name?: string | null
): void {
  if (!discordId) return
  const resolved = displayName || globalName || name
  if (resolved) {
    playerDisplayNameCache.set(discordId, resolved)
  }
}

/**
 * Initializes the Discord player, HotS account, lobby, and account substitution tables in PostgreSQL.
 */
export async function initPlayersTables(): Promise<void> {
  await sql.unsafe(PLAYERS_TABLES_SCHEMA_SQL)
}

/**
 * Initializes the `mv_replay_player_stats` materialized view and its indexes in PostgreSQL.
 */
export async function initPlayerStatsView(): Promise<void> {
  const viewExists = await sql<Array<{ oid: number }>>`
    SELECT oid FROM pg_class WHERE relname = 'mv_replay_player_stats' AND relkind = 'm'
  `
  if (viewExists.length > 0) {
    const existingCols = await sql<Array<{ attname: string }>>`
      SELECT a.attname
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      WHERE c.relname = 'mv_replay_player_stats'
        AND a.attname = 'hots_battle_tag'
        AND a.attnum > 0
        AND NOT a.attisdropped
    `
    if (existingCols.length === 0) {
      await sql`DROP MATERIALIZED VIEW IF EXISTS mv_replay_player_stats`
    }
  }
  await sql.unsafe(PLAYER_STATS_VIEW_SCHEMA_SQL)
}

initPlayersTables().catch(err => {
  console.error('Error initializing players tables in PostgreSQL:', err)
})

/**
 * Refreshes the `mv_replay_player_stats` materialized view concurrently so reads are never blocked.
 */
export async function refreshPlayerStatsView(): Promise<void> {
  await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY mv_replay_player_stats`
}

/**
 * Quickly aggregates stats per player from the indexed `mv_replay_player_stats` materialized view,
 * using a CTE + Window Function (`ROW_NUMBER() OVER (...)`) to include both all-time stats
 * and recent 10-game rolling form in a single query.
 */
export async function getPlayerAggregatedStats(filter: PlayerStatsFilter = {}): Promise<PlayerAggregatedStats[]> {
  const toonHandle = filter.toonHandle ?? null
  const playerName = filter.playerName ?? null
  const hero = filter.hero ?? null
  const map = filter.map ?? null

  return await sql<PlayerAggregatedStats[]>`
    WITH ranked_games AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY toon_handle
          ORDER BY date DESC
        ) AS recency_rank,
        FIRST_VALUE(player_name) OVER (
          PARTITION BY toon_handle
          ORDER BY date DESC
        ) AS latest_player_name
      FROM mv_replay_player_stats
      WHERE (${toonHandle}::text IS NULL OR toon_handle = ${toonHandle})
        AND (${playerName}::text IS NULL OR player_name ILIKE ${playerName})
        AND (${hero}::text IS NULL OR hero = ${hero})
        AND (${map}::text IS NULL OR map = ${map})
    )
    SELECT
      toon_handle,
      MAX(latest_player_name) AS player_name,
      COUNT(*)::int AS games_played,
      COUNT(*) FILTER (WHERE win)::int AS wins,
      COUNT(*) FILTER (WHERE NOT win)::int AS losses,
      ROUND(100.0 * AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END)::numeric, 2)::double precision AS win_rate_pct,
      SUM(takedowns)::int AS total_takedowns,
      SUM(solo_kills)::int AS total_solo_kills,
      SUM(assists)::int AS total_assists,
      SUM(deaths)::int AS total_deaths,
      ROUND((SUM(takedowns)::numeric / GREATEST(SUM(deaths), 1)), 2)::double precision AS overall_kda,
      ROUND(AVG(takedowns)::numeric, 2)::double precision AS avg_takedowns,
      ROUND(AVG(deaths)::numeric, 2)::double precision AS avg_deaths,
      ROUND(AVG(assists)::numeric, 2)::double precision AS avg_assists,
      ROUND(AVG(hero_damage)::numeric, 1)::double precision AS avg_hero_damage,
      ROUND(AVG(siege_damage)::numeric, 1)::double precision AS avg_siege_damage,
      ROUND(AVG(healing)::numeric, 1)::double precision AS avg_healing,
      ROUND(AVG(damage_taken)::numeric, 1)::double precision AS avg_damage_taken,
      ROUND(AVG(damage_soaked)::numeric, 1)::double precision AS avg_damage_soaked,
      ROUND(AVG(xp_contribution)::numeric, 1)::double precision AS avg_xp_contribution,
      ROUND(AVG(dpm)::numeric, 1)::double precision AS avg_dpm,
      ROUND(AVG(hpm)::numeric, 1)::double precision AS avg_hpm,
      ROUND(AVG(xpm)::numeric, 1)::double precision AS avg_xpm,
      ROUND(100.0 * AVG(kill_participation)::numeric, 1)::double precision AS avg_kill_participation_pct,
      ROUND(AVG(time_spent_dead)::numeric, 1)::double precision AS avg_time_spent_dead,
      SUM(votes)::int AS total_votes,
      SUM(bsteps_count)::int AS total_bsteps,
      SUM(sprays_count)::int AS total_sprays,
      SUM(taunts_count)::int AS total_taunts,
      SUM(dances_count)::int AS total_dances,
      SUM(voice_lines_count)::int AS total_voice_lines,
      ROUND(
        100.0 * (AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END) FILTER (WHERE recency_rank <= 10))::numeric,
        2
      )::double precision AS recent_10_win_rate_pct,
      ROUND(
        (AVG(dpm) FILTER (WHERE recency_rank <= 10))::numeric,
        1
      )::double precision AS recent_10_avg_dpm
    FROM ranked_games
    GROUP BY toon_handle
    ORDER BY games_played DESC, win_rate_pct DESC
  `
}

/**
 * Retrieves individual per-match player stat rows from `mv_replay_player_stats`.
 */
export async function getPlayerMatchHistory(toonHandle: string, limit = 50): Promise<ReplayPlayerStatRow[]> {
  return await sql<ReplayPlayerStatRow[]>`
    SELECT *
    FROM mv_replay_player_stats
    WHERE toon_handle = ${toonHandle}
    ORDER BY date DESC
    LIMIT ${limit}
  `
}

/**
 * Stores an interaction in the interaction store.
 */
export function storeInteraction(
  messageId: string,
  channelId: string,
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
): void {
  const key = getInteractionKey(messageId, channelId)
  interactionStore.set(key, interaction)
}

/**
 * Removes a stored interaction from the interaction store.
 */
export function removeInteraction(messageId: string, channelId: string): void {
  const key = getInteractionKey(messageId, channelId)
  interactionStore.delete(key)
}

/**
 * Retrieves a stored interaction from the interaction store.
 */
export function getStoredInteraction(
  messageId: string,
  channelId: string
): ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined {
  const key = getInteractionKey(messageId, channelId)
  return interactionStore.get(key)
}

function getInteractionKey(messageId: string, channelId: string): string {
  return `${channelId}-${messageId}`
}

/**
 * Saves a player to PostgreSQL.
 * If the player already exists, updates their information.
 */
export async function savePlayer(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  player: Player,
  hotsBattleTag?: string
): Promise<void> {
  cachePlayerDisplayName(
    discordId,
    player.usernames.discordDisplayName,
    player.usernames.discordGlobalName,
    player.usernames.discordName
  )
  await sql`
    INSERT INTO players (discord_id, discord_name, discord_global_name, discord_display_name, role)
    VALUES (
      ${discordId},
      ${player.usernames.discordName},
      ${player.usernames.discordGlobalName},
      ${player.usernames.discordDisplayName},
      ${player.role ?? null}
    )
    ON CONFLICT (discord_id) DO UPDATE SET
      discord_name = EXCLUDED.discord_name,
      discord_global_name = EXCLUDED.discord_global_name,
      discord_display_name = EXCLUDED.discord_display_name,
      role = EXCLUDED.role,
      last_active = NOW()
  `
  if (!hotsBattleTag) {
    return
  }
  await handleAddHotsAccount(interaction, discordId, hotsBattleTag)
}

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2)
    await writeFile('./store/players.tmp.json', data)
    await rename('./store/players.tmp.json', './store/players.json')
  } catch (error) {
    console.error('Error saving player data:', error)
  }
}

function getPlayerFromRow(flatPlayer: FlatPlayer, hotsAccountsRow: HotsAccountRow[]): Player {
  cachePlayerDisplayName(
    flatPlayer.discord_id,
    flatPlayer.discord_display_name,
    flatPlayer.discord_global_name,
    flatPlayer.discord_name
  )

  const accountsNew = hotsAccountsRow
    .filter(account => {
      if (flatPlayer.discord_id) {
        return account.discord_id === flatPlayer.discord_id
      }
      if (flatPlayer.hots_battle_tag) {
        return account.hots_battle_tag.toLowerCase() === flatPlayer.hots_battle_tag.toLowerCase()
      }
      return false
    })
    .map(account => getAccountFromAccountRow(account))

  const isActive = typeof flatPlayer.active === 'boolean' ? flatPlayer.active : flatPlayer.active === 1

  return {
    discordId: flatPlayer.discord_id,
    usernames: {
      accounts: accountsNew,
      discordName: flatPlayer.discord_name,
      discordGlobalName: flatPlayer.discord_global_name,
      discordDisplayName: flatPlayer.discord_display_name,
    },
    role: flatPlayer.role,
    active: isActive,
    team: flatPlayer.team ?? null,
    lobbyRank: flatPlayer.lobby_rank ?? NaN,
    draftOrder: flatPlayer.draft_order ?? NaN,
    adjustment: flatPlayer.adjustment,
    mmr:
      (accountsNew.reduce(
        (max: number | null, account) =>
          Math.max(max ?? 0, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0, account.hpArMMR ?? 0),
        0
      ) ?? 0) + (flatPlayer.adjustment ?? 0),
    lastActive: flatPlayer.last_active instanceof Date ? flatPlayer.last_active : new Date(flatPlayer.last_active),
  }
}

function getAccountFromAccountRow(account: HotsAccountRow): HotsAccount {
  return {
    id: account.id,
    hotsBattleTag: account.hots_battle_tag,
    isPrimary: Boolean(account.is_primary),
    realIdName: account.real_id_name ?? null,
    ownerDiscordId: account.owner_discord_id ?? null,
    hpQmMMR: account.hp_qm_mmr ?? account.HP_QM_MMR ?? null,
    hpSlMMR: account.hp_sl_mmr ?? account.HP_SL_MMR ?? null,
    hpArMMR: account.hp_ar_mmr ?? account.HP_AR_MMR ?? null,
    hpQmGames: account.hp_qm_games ?? account.HP_QM_Games ?? null,
    hpSlGames: account.hp_sl_games ?? account.HP_SL_Games ?? null,
    hpArGames: account.hp_ar_games ?? account.HP_AR_Games ?? null,
  }
}

/**
 * Retrieves all active players from the database, with their HotS accounts.
 */
export async function getActivePlayers(guildId: string): Promise<Player[]> {
  const rows = await sql<FlatPlayer[]>`
    SELECT
      lp.discord_id,
      COALESCE(ha.hots_battle_tag, '') AS hots_battle_tag,
      COALESCE(p.discord_name, ha.hots_battle_tag, 'Guest') AS discord_name,
      COALESCE(p.discord_global_name, ha.hots_battle_tag, 'Guest') AS discord_global_name,
      COALESCE(p.discord_display_name, ha.hots_battle_tag, 'Guest') AS discord_display_name,
      COALESCE(lp.role, p.role) AS role,
      lp.active,
      lp.team,
      p.adjustment,
      lp.lobby_rank,
      lp.draft_order,
      COALESCE(p.last_active, NOW()) AS last_active
    FROM lobby_players lp
    LEFT JOIN players p ON lp.discord_id = p.discord_id
    LEFT JOIN hots_accounts ha ON ha.id = COALESCE(
      lp.hots_account_id,
      (SELECT id FROM hots_accounts WHERE discord_id = lp.discord_id ORDER BY is_primary DESC, id ASC LIMIT 1)
    )
    WHERE lp.guild_id = ${guildId} AND lp.active = TRUE
    ORDER BY lp.lobby_rank, lp.active, lp.team
  `

  const allAccounts = await sql<
    Array<
      HotsAccountRow & {
        owner_display_name?: string | null
        owner_global_name?: string | null
        owner_name?: string | null
      }
    >
  >`
    SELECT
      ha.id,
      ha.discord_id,
      ha.hots_battle_tag,
      ha.is_primary,
      ha.hp_qm_mmr,
      ha.hp_sl_mmr,
      ha.hp_ar_mmr,
      ha.hp_qm_games,
      ha.hp_sl_games,
      ha.hp_ar_games,
      ha.real_id_name,
      ha.owner_discord_id,
      op.discord_display_name AS owner_display_name,
      op.discord_global_name AS owner_global_name,
      op.discord_name AS owner_name
    FROM hots_accounts ha
    LEFT JOIN players op ON ha.owner_discord_id = op.discord_id
  `

  for (const acc of allAccounts) {
    if (acc.owner_discord_id) {
      cachePlayerDisplayName(acc.owner_discord_id, acc.owner_display_name, acc.owner_global_name, acc.owner_name)
    }
  }

  const validAccounts = await filterActiveSubstitutedAccounts(allAccounts, guildId)
  const seenPlayerKeys = new Set<string>()
  const uniquePlayers: Player[] = []
  for (const row of rows) {
    const key =
      row.discord_id ??
      (row.hots_battle_tag ? `tag:${row.hots_battle_tag.toLowerCase()}` : `guest:${uniquePlayers.length}`)
    if (seenPlayerKeys.has(key)) {
      continue
    }
    seenPlayerKeys.add(key)
    uniquePlayers.push(getPlayerFromRow(row, validAccounts))
  }
  return uniquePlayers
}

/**
 * Retrieves autocomplete choices for clearing active account substitutions in a guild.
 */
export async function getAssignAccountClearChoices(
  guildId: string,
  query: string
): Promise<Array<{ name: string; value: string }>> {
  type ClearRow = {
    hots_battle_tag: string
    lender_name: string
    borrower_name: string
  }

  const trimmed = query.trim()
  const pattern = `%${trimmed}%`
  const rows = await sql<ClearRow[]>`
    SELECT
      s.hots_battle_tag,
      COALESCE(p1.discord_display_name, p1.discord_global_name, p1.discord_name, 'owner') AS lender_name,
      COALESCE(p2.discord_display_name, p2.discord_global_name, p2.discord_name, 'borrower') AS borrower_name
    FROM account_substitutions s
    LEFT JOIN players p1 ON s.original_discord_id = p1.discord_id
    LEFT JOIN players p2 ON s.substitute_discord_id = p2.discord_id
    WHERE s.guild_id = ${guildId} AND s.is_active = TRUE
      AND (${trimmed} = '' OR s.hots_battle_tag ILIKE ${pattern})
    ORDER BY s.date DESC
    LIMIT 25
  `

  return rows.map(r => ({
    name: `${r.hots_battle_tag} (loaned from ${r.lender_name} to ${r.borrower_name})`.slice(0, 100),
    value: r.hots_battle_tag,
  }))
}

/**
 * Retrieves autocomplete choices for assigning HotS accounts, prioritizing players active in the lobby.
 */
export async function getAssignAccountChoices(
  guildId: string,
  query: string
): Promise<Array<{ name: string; value: string }>> {
  type AssignRow = {
    hots_battle_tag: string
    display_name: string
    in_lobby: number
  }

  const trimmed = query.trim()
  const pattern = `%${trimmed}%`
  const rows = await sql<AssignRow[]>`
    SELECT
      ha.hots_battle_tag,
      COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, 'Unknown') AS display_name,
      CASE WHEN lp.discord_id IS NOT NULL THEN 1 ELSE 0 END AS in_lobby
    FROM hots_accounts ha
    JOIN players p ON ha.discord_id = p.discord_id
    LEFT JOIN lobby_players lp ON lp.discord_id = ha.discord_id AND lp.guild_id = ${guildId} AND lp.active = TRUE
    WHERE ha.owner_discord_id IS NULL
      AND (
        ${trimmed} = ''
        OR ha.hots_battle_tag ILIKE ${pattern}
        OR COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, '') ILIKE ${pattern}
        OR COALESCE(ha.real_id_name, '') ILIKE ${pattern}
      )
    ORDER BY in_lobby DESC, LOWER(ha.hots_battle_tag) ASC
    LIMIT 25
  `

  return rows.map(r => {
    const prefix = r.in_lobby ? '🎮 ' : ''
    return {
      name: `${prefix}${r.hots_battle_tag} (@${r.display_name})`.slice(0, 100),
      value: r.hots_battle_tag,
    }
  })
}

export async function getAllRegisteredHotSAccounts(guildId: string): Promise<RegisteredPlayerAccount[]> {
  type QueryRow = {
    id: number
    discord_id: string | null
    hots_battle_tag: string
    discord_display_name: string | null
    discord_name: string | null
    discord_global_name: string | null
    real_id_name: string | null
    owner_discord_id: string | null
  }

  const rows = await sql<QueryRow[]>`
    SELECT
      ha.id,
      ha.discord_id,
      ha.hots_battle_tag,
      ha.real_id_name,
      ha.owner_discord_id,
      COALESCE(p.discord_display_name, ha.hots_battle_tag) AS discord_display_name,
      COALESCE(p.discord_name, ha.hots_battle_tag) AS discord_name,
      COALESCE(p.discord_global_name, ha.hots_battle_tag) AS discord_global_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
  `

  for (const r of rows) {
    cachePlayerDisplayName(r.discord_id, r.discord_display_name, r.discord_global_name, r.discord_name)
  }

  const activeSubs = guildId ? await getActiveSubstitutions(guildId) : []
  const subMap = new Map<string, string>()
  for (const s of activeSubs) {
    subMap.set(s.hotsBattleTag.toLowerCase(), s.substituteDiscordId)
    const prefix = s.hotsBattleTag.split('#')[0].toLowerCase()
    subMap.set(prefix, s.substituteDiscordId)
  }

  const result: RegisteredPlayerAccount[] = []
  for (const r of rows) {
    const lowerTag = r.hots_battle_tag.toLowerCase()
    const prefix = lowerTag.split('#')[0]
    const subDiscordId = subMap.get(lowerTag) || subMap.get(prefix)

    const shouldInclude = subDiscordId ? r.discord_id === subDiscordId : !r.owner_discord_id
    if (shouldInclude) {
      result.push({
        id: r.id,
        discordId: r.discord_id,
        hotsBattleTag: r.hots_battle_tag,
        discordDisplayName: r.discord_display_name ?? r.hots_battle_tag,
        discordName: r.discord_name ?? r.hots_battle_tag,
        discordGlobalName: r.discord_global_name ?? r.hots_battle_tag,
        realIdName: r.real_id_name ?? null,
        ownerDiscordId: r.owner_discord_id ?? null,
      })
    }
  }

  return result
}

export async function findPlayersByHotSAccount(query: string, guildId: string): Promise<HotSAccountMatch[]> {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  let accounts: HotsAccountRow[] = []
  const prefixPattern = `${trimmed}%`
  const hashPrefixPattern = `${trimmed}#%`
  const substringPattern = `%${trimmed}%`

  if (trimmed.includes('#')) {
    accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${trimmed})
    `

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${prefixPattern}
      `
    }
  } else {
    accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE hots_battle_tag ILIKE ${hashPrefixPattern}
         OR LOWER(hots_battle_tag) = LOWER(${trimmed})
         OR LOWER(real_id_name) = LOWER(${trimmed})
    `

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${prefixPattern}
           OR real_id_name ILIKE ${prefixPattern}
      `
    }

    if (accounts.length === 0) {
      accounts = await sql<HotsAccountRow[]>`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${substringPattern}
           OR real_id_name ILIKE ${substringPattern}
      `
    }
  }

  accounts = await filterActiveSubstitutedAccounts(accounts, guildId)

  const results: HotSAccountMatch[] = []
  const seenDiscordIds = new Set<string>()
  const seenAccountIds = new Set<number>()
  const qLower = trimmed.toLowerCase()

  for (const accRow of accounts) {
    if (accRow.discord_id) {
      if (seenDiscordIds.has(accRow.discord_id)) continue
      seenDiscordIds.add(accRow.discord_id)

      const player = await getPlayerByDiscordId(accRow.discord_id, guildId)
      if (!player) continue

      const matchedAccounts = (player.usernames.accounts || []).filter(acc => {
        const tagLower = acc.hotsBattleTag.toLowerCase()
        const realLower = acc.realIdName?.toLowerCase()
        if (trimmed.includes('#')) {
          return tagLower === qLower || tagLower.startsWith(qLower)
        }
        const tagPrefix = tagLower.split('#')[0]
        return (
          tagPrefix === qLower ||
          tagLower === qLower ||
          realLower === qLower ||
          tagLower.includes(qLower) ||
          (realLower !== undefined && realLower !== null && realLower.includes(qLower))
        )
      })

      if (matchedAccounts.length === 0) continue

      results.push({
        player,
        matchedAccounts,
      })
    } else {
      if (seenAccountIds.has(accRow.id)) continue
      seenAccountIds.add(accRow.id)

      const hotsAcc = getAccountFromAccountRow(accRow)
      const guestPlayer = await getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${accRow.id}`, guildId)
      if (guestPlayer) {
        results.push({
          player: guestPlayer,
          matchedAccounts: [hotsAcc],
        })
      }
    }
  }

  return results
}

export async function getAllPlayers(
  page: number,
  sort: 'mmr' | 'alphabetical',
  ascending: boolean
): Promise<Player[]> {
  const offset = (page ?? 0) * 20
  let rows: FlatPlayer[]
  if (sort === 'mmr') {
    if (ascending) {
      rows = await sql<FlatPlayer[]>`
        SELECT
          p.*,
          '' AS hots_battle_tag,
          FALSE AS active,
          NULL::int AS team,
          NULL::int AS lobby_rank,
          NULL::int AS draft_order
        FROM players p
        LEFT JOIN (
          SELECT
            discord_id,
            MAX(GREATEST(COALESCE(hp_qm_mmr, 0), COALESCE(hp_sl_mmr, 0), COALESCE(hp_ar_mmr, 0))) AS mmr
          FROM hots_accounts
          GROUP BY discord_id
        ) h ON p.discord_id = h.discord_id
        ORDER BY (COALESCE(h.mmr, 0) + COALESCE(p.adjustment, 0)) DESC, p.discord_display_name ASC
        LIMIT 20 OFFSET ${offset}
      `
    } else {
      rows = await sql<FlatPlayer[]>`
        SELECT
          p.*,
          '' AS hots_battle_tag,
          FALSE AS active,
          NULL::int AS team,
          NULL::int AS lobby_rank,
          NULL::int AS draft_order
        FROM players p
        LEFT JOIN (
          SELECT
            discord_id,
            MAX(GREATEST(COALESCE(hp_qm_mmr, 0), COALESCE(hp_sl_mmr, 0), COALESCE(hp_ar_mmr, 0))) AS mmr
          FROM hots_accounts
          GROUP BY discord_id
        ) h ON p.discord_id = h.discord_id
        ORDER BY (COALESCE(h.mmr, 0) + COALESCE(p.adjustment, 0)) ASC, p.discord_display_name ASC
        LIMIT 20 OFFSET ${offset}
      `
    }
  } else {
    if (ascending) {
      rows = await sql<FlatPlayer[]>`
        SELECT
          p.*,
          '' AS hots_battle_tag,
          FALSE AS active,
          NULL::int AS team,
          NULL::int AS lobby_rank,
          NULL::int AS draft_order
        FROM players p
        ORDER BY p.discord_display_name ASC
        LIMIT 20 OFFSET ${offset}
      `
    } else {
      rows = await sql<FlatPlayer[]>`
        SELECT
          p.*,
          '' AS hots_battle_tag,
          FALSE AS active,
          NULL::int AS team,
          NULL::int AS lobby_rank,
          NULL::int AS draft_order
        FROM players p
        ORDER BY p.discord_display_name DESC
        LIMIT 20 OFFSET ${offset}
      `
    }
  }

  const accounts = await sql<HotsAccountRow[]>`
    SELECT
      id,
      discord_id,
      hots_battle_tag,
      is_primary,
      hp_qm_mmr,
      hp_sl_mmr,
      hp_ar_mmr,
      hp_qm_games,
      hp_sl_games,
      hp_ar_games,
      real_id_name,
      owner_discord_id
    FROM hots_accounts
  `
  return rows.map<Player>(row => getPlayerFromRow(row, accounts))
}

const activeMmrLoadingTags = new Set<string>()

/**
 * Checks if MMR is currently being fetched in the background for a BattleTag.
 */
export function isFetchingMmr(battleTag: string): boolean {
  return activeMmrLoadingTags.has(battleTag.toLowerCase())
}

/**
 * Triggers a background MMR fetch from Heroes Profile for an account (guest or registered).
 * Updates the database and refreshes the lobby message when finished.
 */
export async function triggerAccountMmrFetch(battleTag: string, guildId?: string): Promise<void> {
  const lowerTag = battleTag.toLowerCase()
  if (activeMmrLoadingTags.has(lowerTag)) return
  activeMmrLoadingTags.add(lowerTag)

  try {
    const profileData = await getHeroesProfileData(battleTag)
    if (profileData && !(profileData.qmGames === -1 && profileData.slGames === -1 && profileData.arGames === -1)) {
      await sql`
        UPDATE hots_accounts SET
          hp_region = ${profileData.region},
          hp_blizz_id = ${String(profileData.blizz_id)},
          hp_qm_mmr = ${Number.isNaN(profileData.qmMmr) ? null : profileData.qmMmr},
          hp_sl_mmr = ${Number.isNaN(profileData.slMmr) ? null : profileData.slMmr},
          hp_ar_mmr = ${Number.isNaN(profileData.arMmr) ? null : profileData.arMmr},
          hp_qm_games = ${profileData.qmGames},
          hp_sl_games = ${profileData.slGames},
          hp_ar_games = ${profileData.arGames},
          updated_at = NOW()
        WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
      `
    } else {
      await sql`
        UPDATE hots_accounts SET
          hp_qm_games = -1,
          hp_sl_games = -1,
          hp_ar_games = -1,
          updated_at = NOW()
        WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
      `
    }
  } catch (err) {
    console.error(`Error fetching HP MMR for ${battleTag}:`, err)
    await sql`
      UPDATE hots_accounts SET
        hp_qm_games = -1,
        hp_sl_games = -1,
        hp_ar_games = -1,
        updated_at = NOW()
      WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
    `
  } finally {
    activeMmrLoadingTags.delete(lowerTag)
    if (guildId) {
      try {
        clearActivePlayersCache(guildId)
        await updateLobbyMessage(guildId)
      } catch (e) {
        console.error('Error updating lobby message after MMR fetch:', e)
      }
    }
  }
}

export async function handleAddHotsAccount(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  let hotsAccountAlreadyExists = false
  let userIsSelf = false
  const validationResult = validateBattleTag(hotsBattleTag)
  if (!validationResult.isValid) {
    await safeReply(interaction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\`
${validationResult.errors.join('\n')}
${validationResult.rules}
      `,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  const existingAccounts = await sql<Array<{ discord_id: string; hots_battle_tag: string }>>`
    SELECT discord_id, hots_battle_tag
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})
      AND discord_id IS NOT NULL
      AND discord_id != ${discordId}
    LIMIT 1
  `
  const existingAccount = existingAccounts[0]
  if (existingAccount) {
    await safeReply(interaction, {
      content: `This HotS account is already in use by another player: <@${
        existingAccount.discord_id
      }>\nare you sure this is ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"} account...`,
      files: [
        {
          attachment: 'https://i.giphy.com/media/hPkJ9Q7dh6itMoMIMC/giphy.gif',
          name: 'is it.gif',
        },
      ],
      flags: MessageFlags.Ephemeral,
    })
    return false
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return false

  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in database',
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  try {
    await interaction?.deferReply({
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    })
  } catch (error) {
    if (!error) {
      console.error('Error deferring reply:', error)
    }
  }

  activeMmrLoadingTags.add(hotsBattleTag.toLowerCase())
  let profileData
  try {
    profileData = await getHeroesProfileData(hotsBattleTag)
  } finally {
    activeMmrLoadingTags.delete(hotsBattleTag.toLowerCase())
  }

  if (!profileData) {
    await safeReply(interaction, {
      content: `Failed to retrieve Heroes profile data for \`${hotsBattleTag}\`.\nAre you sure you typed it right?`,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  if (profileData.qmGames === -1 && profileData.slGames === -1 && profileData.arGames === -1) {
    await handleAccountNotFound(interaction, discordId, hotsBattleTag)
    return false
  }

  userIsSelf = discordId === interaction?.user.id

  type ExistingAccountRow = {
    id: number
    discord_id: string | null
    is_primary: boolean
  }

  const currentAccounts = await sql<ExistingAccountRow[]>`
    SELECT id, discord_id, is_primary
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  const currentAccount = currentAccounts[0]

  if (currentAccount && currentAccount.discord_id === discordId) {
    hotsAccountAlreadyExists = true
  }

  try {
    const isPrimary =
      currentAccount && currentAccount.discord_id === discordId
        ? Boolean(currentAccount.is_primary)
        : !player.usernames.accounts || player.usernames.accounts.length <= 1

    const qmMmr = Number.isNaN(profileData.qmMmr) ? null : profileData.qmMmr
    const slMmr = Number.isNaN(profileData.slMmr) ? null : profileData.slMmr
    const arMmr = Number.isNaN(profileData.arMmr) ? null : profileData.arMmr

    await sql.begin(async tx => {
      let accountId: number

      if (currentAccount) {
        await tx`
          UPDATE hots_accounts SET
            discord_id = ${discordId},
            hots_battle_tag = ${hotsBattleTag},
            is_primary = ${isPrimary},
            hp_region = ${profileData.region},
            hp_blizz_id = ${String(profileData.blizz_id)},
            hp_qm_mmr = ${qmMmr},
            hp_sl_mmr = ${slMmr},
            hp_ar_mmr = ${arMmr},
            hp_qm_games = ${profileData.qmGames},
            hp_sl_games = ${profileData.slGames},
            hp_ar_games = ${profileData.arGames},
            updated_at = NOW()
          WHERE id = ${currentAccount.id}
        `
        accountId = currentAccount.id
      } else {
        const inserted = await tx<Array<{ id: number }>>`
          INSERT INTO hots_accounts (
            discord_id, hots_battle_tag, is_primary, hp_region, hp_blizz_id,
            hp_qm_mmr, hp_sl_mmr, hp_ar_mmr, hp_qm_games, hp_sl_games, hp_ar_games
          ) VALUES (
            ${discordId}, ${hotsBattleTag}, ${isPrimary}, ${profileData.region}, ${String(profileData.blizz_id)},
            ${qmMmr}, ${slMmr}, ${arMmr}, ${profileData.qmGames}, ${profileData.slGames}, ${profileData.arGames}
          )
          RETURNING id
        `
        accountId = inserted[0].id
      }

      await tx`
        UPDATE lobby_players
        SET hots_account_id = ${accountId}
        WHERE discord_id = ${discordId} AND (hots_account_id IS NULL OR hots_account_id = ${accountId})
      `

      await tx`
        DELETE FROM lobby_players
        WHERE hots_account_id = ${accountId} AND discord_id IS NULL
          AND guild_id IN (SELECT guild_id FROM lobby_players WHERE discord_id = ${discordId})
      `

      await tx`
        UPDATE lobby_players
        SET discord_id = ${discordId}
        WHERE hots_account_id = ${accountId} AND discord_id IS NULL
      `
    })

    if (profileData.detectedRoles && !player.role) {
      await setPlayerRole(discordId, guildId, profileData.detectedRoles)
      player.role = profileData.detectedRoles
    }
    clearActivePlayersCache(guildId)
    if (interaction) {
      await updateLobbyMessage(guildId, interaction)
    }
    if (hotsAccountAlreadyExists) {
      const reasonText = profileData.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      const content = `${userIsSelf ? 'You' : '<@' + discordId + '>'} already ${
        userIsSelf ? 'have' : 'has'
      } this HotS account linked: \`${hotsBattleTag}\`\n\nHowever, ${
        userIsSelf ? 'your' : '<@' + discordId + '>' + "'s"
      } Heroes profile data and BattleTag formatting have been updated.${roleText}`
      try {
        await interaction?.editReply({
          content,
        })
      } catch {
        await safeReply(interaction, {
          content,
          flags: MessageFlags.Ephemeral,
        })
      }
    } else {
      const reasonText = profileData.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      await safeReply(interaction, {
        content: `${
          discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
        } HotS account has been added: \`${hotsBattleTag}\`${roleText}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  } catch (error) {
    console.error('Error adding HotS account:', error)
    await safeReply(interaction, {
      content: `Failed to add HotS account \`${hotsBattleTag}\`.\nPlease try again later.`,
      flags: MessageFlags.Ephemeral,
    })
    await safeReply(interaction, {
      content: `<@${discordId}> Failed to add HotS account \`${hotsBattleTag}\``,
    })
    return false
  }
  return player
}

export async function handleDeleteHotsAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null
): Promise<void> {
  if (!hotsBattleTag) {
    await deletePlayerHotsAccounts(discordId)
    await safeReply(interaction, {
      content: `ALL Heroes of the Storm accounts associated with <@${discordId}> have been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const deleted = await deleteHotsAccount(hotsBattleTag)
  if (deleted > 0) {
    await safeReply(interaction, {
      content: `Heroes of the Storm account \`${hotsBattleTag}\` has been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
  } else {
    await safeReply(interaction, {
      content: `Failed to delete Heroes of the Storm account \`${hotsBattleTag}\`. It may not exist.`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleAccountNotFound(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
): Promise<void> {
  const guildId = interaction ? await requireGuildId(interaction) : null
  if (!guildId) return
  await deletePlayerHotsAccounts(discordId)
  if (interaction) {
    await updateLobbyMessage(guildId, interaction)
  }
  const joinBtn = new ButtonBuilder()
    .setCustomId(`${CommandIds.JOIN_WITH_BATTLE_TAG}_${hotsBattleTag}`)
    .setLabel('Try Again')
    .setStyle(ButtonStyle.Primary)
  await safeReply(interaction, {
    content: `heroesprofile could not find data for \`${hotsBattleTag}\`\nare you sure this is the right battle tag for ${
      discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"
    } account?`,
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
  })
}

export async function deletePlayer(
  discordId: string
): Promise<{ playersDeleted: number; hotsAccountsDeleted: number }> {
  let deletedPlayer = 0
  let deletedAccounts = 0

  await sql.begin(async tx => {
    const accResult = await tx`DELETE FROM hots_accounts WHERE discord_id = ${discordId}`
    deletedAccounts = accResult.count
    const playerResult = await tx`DELETE FROM players WHERE discord_id = ${discordId}`
    deletedPlayer = playerResult.count
  })

  return {
    playersDeleted: deletedPlayer,
    hotsAccountsDeleted: deletedAccounts,
  }
}

export async function deletePlayerHotsAccounts(discordId: string): Promise<number> {
  const result = await sql`DELETE FROM hots_accounts WHERE discord_id = ${discordId}`
  return result.count
}

export async function deleteHotsAccount(hotsBattleTag: string): Promise<number> {
  const result = await sql`DELETE FROM hots_accounts WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})`
  return result.count
}

export async function setHotsAccountRealIdName(hotsBattleTag: string, realIdName: string | null): Promise<boolean> {
  const result = await sql`
    UPDATE hots_accounts
    SET real_id_name = ${realIdName}
    WHERE LOWER(hots_battle_tag) = LOWER(${hotsBattleTag})
  `
  return result.count > 0
}

export async function getHotsAccountByBattleTag(
  hotsBattleTag: string
): Promise<(HotsAccountRow & { discord_display_name?: string }) | undefined> {
  const rows = await sql<Array<HotsAccountRow & { discord_display_name?: string }>>`
    SELECT ha.*, p.discord_display_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
    WHERE LOWER(ha.hots_battle_tag) = LOWER(${hotsBattleTag})
    LIMIT 1
  `
  return rows[0]
}

export async function setPrimaryAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string,
  messageId: string,
  channelId: string
): Promise<boolean> {
  const { success, message, player } = await updatePrimaryAccountInDb(guildId, discordId, hotsBattleTag)
  if (!success || !player?.usernames.accounts) {
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: `${
        discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
      } primary HotS account has been set to \`${hotsBattleTag}\`.`,
      flags: MessageFlags.Ephemeral,
    })
    return true
  }
  const buttonUpdateSuccess = await updateButtonInterface(interaction, player, discordId, messageId, channelId)
  if (!buttonUpdateSuccess.success) {
    await safeReply(interaction, {
      ...buttonUpdateSuccess.messageOptions,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  return true
}

async function updateButtonInterface(
  interaction: ButtonInteraction<CacheType>,
  player: Player,
  discordId: string,
  messageId: string,
  channelId: string
): Promise<{ success: boolean; messageOptions: InteractionReplyOptions }> {
  const accounts = player.usernames.accounts
  if (!accounts?.length) {
    return {
      success: false,
      messageOptions: { content: 'No accounts to update' },
    }
  }
  try {
    const prevInteraction = getStoredInteraction(messageId, channelId)
    if (!prevInteraction) {
      throw new Error('Previous interaction not found')
    }
    await prevInteraction.editReply({
      components: getAccountButtons(accounts, discordId, messageId, channelId),
    })
    await safeDeferUpdate(interaction)
    return { success: true, messageOptions: { content: '' } }
  } catch (error: unknown) {
    removeInteraction(messageId, channelId)
    console.error('Error updating button interface:', error)
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        const message = await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        })
        storeInteraction(message.id, interaction.channelId, interaction)
      }
      await safeReply(interaction, {
        content:
          'Previous interaction not found to update buttons\nPlease select the account to set as primary using the buttons below.',
        components: getAccountButtons(accounts, discordId, messageId, channelId),
      })
    } catch (fallbackError) {
      console.error('Failed fallback deferReply/safeReply:', fallbackError)
    }
    return { success: true, messageOptions: { content: '' } }
  }
}

export function getAccountButtons(
  accounts: HotsAccount[],
  discordId: string,
  messageId: string,
  channelId: string
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = accounts.map(account => {
    return new ButtonBuilder()
      .setCustomId(
        `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${messageId}_${channelId}`
      )
      .setLabel(account.hotsBattleTag)
      .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary)
  })
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
}

async function updatePrimaryAccountInDb(
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): Promise<{ success: boolean; message?: string; player?: Player }> {
  const result = await sql`
    UPDATE hots_accounts
    SET is_primary = CASE WHEN LOWER(hots_battle_tag) = LOWER(${hotsBattleTag}) THEN TRUE ELSE FALSE END
    WHERE discord_id = ${discordId}
  `
  if (result.count === 0) {
    return {
      success: false,
      message: `The specified Heroes of the Storm account \`${hotsBattleTag}\` was not found for this player.`,
    }
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return {
      success: false,
      message: 'Player not found in database',
    }
  }
  if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    return {
      success: false,
      message: 'This player has no Heroes of the Storm accounts linked.',
    }
  }
  return { success: true, player }
}

/**
 * Marks all players as inactive in the database for a guild.
 */
export async function markAllPlayersInactive(guildId: string): Promise<void> {
  await sql`DELETE FROM lobby_players WHERE guild_id = ${guildId}`
  clearActivePlayersCache(guildId)
}

/**
 * Gets a player by their Discord ID, optionally joining lobby state for a guild.
 */
export async function getPlayerByDiscordId(
  discordId: string | null | undefined,
  guildId: string
): Promise<Player | undefined> {
  if (!discordId) return undefined
  const rows = await sql<FlatPlayer[]>`
    SELECT
      p.*,
      '' AS hots_battle_tag,
      COALESCE(lp.active, FALSE) AS active,
      lp.team,
      lp.lobby_rank,
      lp.draft_order
    FROM players p
    LEFT JOIN lobby_players lp ON p.discord_id = lp.discord_id AND lp.guild_id = ${guildId}
    WHERE p.discord_id = ${discordId}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) {
    return undefined
  }
  const accounts = await sql<
    Array<
      HotsAccountRow & {
        owner_display_name?: string | null
        owner_global_name?: string | null
        owner_name?: string | null
      }
    >
  >`
    SELECT
      ha.*,
      op.discord_display_name AS owner_display_name,
      op.discord_global_name AS owner_global_name,
      op.discord_name AS owner_name
    FROM hots_accounts ha
    LEFT JOIN players op ON ha.owner_discord_id = op.discord_id
    WHERE ha.discord_id = ${discordId}
  `

  for (const acc of accounts) {
    if (acc.owner_discord_id) {
      cachePlayerDisplayName(acc.owner_discord_id, acc.owner_display_name, acc.owner_global_name, acc.owner_name)
    }
  }

  const validAccounts = await filterActiveSubstitutedAccounts(accounts, guildId)
  return getPlayerFromRow(row, validAccounts)
}

/**
 * Extracts numeric account ID from an identifier if it's 'hotsRowId:<id>' or 'tag:<tag>'.
 */
async function getAccountRowIdFromIdentifier(identifier: string): Promise<number | null> {
  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const id = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    return isNaN(id) ? null : id
  }
  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    const cleanTag = identifier.slice(PlayerIdPrefix.TAG.length)
    const rows = await sql<Array<{ id: number }>>`
      SELECT id
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${cleanTag}) AND owner_discord_id IS NULL
      LIMIT 1
    `
    return rows[0]?.id ?? null
  }
  return null
}

/**
 * Returns a unique string identifier for a Player (discordId, 'hotsRowId:<id>', or 'tag:<tag>').
 */
export function getPlayerIdentifier(player: Player): string {
  if (player.discordId) return player.discordId
  const accId = player.usernames?.accounts?.[0]?.id
  if (accId) return `${PlayerIdPrefix.HOTS_ROW_ID}${accId}`
  const tag = player.usernames?.accounts?.[0]?.hotsBattleTag
  return tag ? `${PlayerIdPrefix.TAG}${tag}` : ''
}

type GuestLobbyInfo = {
  role: string | null
  active: boolean
  team: number | null
  lobby_rank: number | null
  draft_order: number | null
}

async function buildGuestPlayer(account: HotsAccountRow, guildId: string): Promise<Player> {
  const rows = await sql<GuestLobbyInfo[]>`
    SELECT role, active, team, lobby_rank, draft_order
    FROM lobby_players
    WHERE guild_id = ${guildId} AND hots_account_id = ${account.id}
    LIMIT 1
  `
  const lp = rows[0]

  const hotsAcc: HotsAccount = getAccountFromAccountRow(account)
  const mmr = Math.max(hotsAcc.hpQmMMR ?? 0, hotsAcc.hpSlMMR ?? 0, hotsAcc.hpArMMR ?? 0)

  return {
    discordId: null,
    usernames: {
      accounts: [hotsAcc],
      discordName: account.hots_battle_tag,
      discordDisplayName: account.hots_battle_tag,
      discordGlobalName: account.hots_battle_tag,
    },
    role: lp?.role ?? undefined,
    active: Boolean(lp?.active),
    team: lp?.team ?? null,
    lobbyRank: lp?.lobby_rank ?? NaN,
    draftOrder: lp?.draft_order ?? NaN,
    adjustment: null,
    mmr,
    lastActive: new Date(),
  }
}

/**
 * Gets a player by either hotsRowId ('hotsRowId:<id>'), BattleTag ('tag:<tag>'), or Discord ID.
 */
export async function getPlayerByIdentifier(identifier: string, guildId: string): Promise<Player | undefined> {
  if (!identifier) return undefined

  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const rowId = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    if (isNaN(rowId)) return undefined

    const accounts = await sql<HotsAccountRow[]>`
      SELECT *
      FROM hots_accounts
      WHERE id = ${rowId}
      LIMIT 1
    `
    const account = accounts[0]
    if (!account) return undefined
    return account.discord_id
      ? await getPlayerByDiscordId(account.discord_id, guildId)
      : await buildGuestPlayer(account, guildId)
  }

  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    return await getPlayerByBattleTag(identifier.slice(PlayerIdPrefix.TAG.length), guildId)
  }

  return await getPlayerByDiscordId(identifier, guildId)
}

async function getPlayerByBattleTag(battleTag: string, guildId: string): Promise<Player | undefined> {
  const accounts = await sql<Array<{ id: number; discord_id: string | null }>>`
    SELECT id, discord_id
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${battleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  const account = accounts[0]
  if (!account) return undefined
  return account.discord_id
    ? await getPlayerByDiscordId(account.discord_id, guildId)
    : await getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${account.id}`, guildId)
}

/**
 * Sets the player role in the database.
 */
export async function setPlayerRole(
  identifier: string,
  guildId: string,
  role: string | null | undefined
): Promise<false | Player> {
  const roleToSet = role && role.trim() !== '' ? role : null
  const accId = await getAccountRowIdFromIdentifier(identifier)
  if (accId !== null) {
    await sql`
      UPDATE lobby_players
      SET role = ${roleToSet}
      WHERE guild_id = ${guildId} AND hots_account_id = ${accId}
    `
    const player = await getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${accId}`, guildId)
    if (player) {
      player.role = roleToSet ?? undefined
      return player
    }
    return false
  }

  const player = await getPlayerByDiscordId(identifier, guildId)
  if (!player) {
    return false
  }
  await sql`UPDATE players SET role = ${roleToSet} WHERE discord_id = ${identifier}`
  await sql`
    UPDATE lobby_players
    SET role = ${roleToSet}
    WHERE guild_id = ${guildId} AND discord_id = ${identifier}
  `
  player.role = roleToSet ?? undefined
  return player
}

/**
 * Changes the player's HotS name in the database.
 */
export async function setPlayerName(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | ModalSubmitInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  if (!hotsBattleTag) {
    return false
  }
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false
  }
  await savePlayer(interaction, discordId, player, hotsBattleTag)
  return player
}

/**
 * Sets the Discord user names for a player in the database.
 */
export async function setPlayerDiscordNames(
  discordId: string,
  guildId: string,
  discordData: DiscordUserNames
): Promise<boolean> {
  const { discordName, discordGlobalName, discordDisplayName } = discordData
  const player = await getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false
  }
  cachePlayerDisplayName(discordId, discordDisplayName, discordGlobalName, discordName)
  await sql`
    UPDATE players
    SET discord_name = ${discordName},
        discord_global_name = ${discordGlobalName},
        discord_display_name = ${discordDisplayName}
    WHERE discord_id = ${discordId}
  `
  return true
}

/**
 * Sets the MMR adjustment for a player in the database.
 */
export async function setPlayerAdjustment(
  discordId: string,
  guildId: string,
  adjustment: number
): Promise<false | { previousAdjustment: number | null; updatedPlayer: Player }> {
  const existingPlayer = await getPlayerByDiscordId(discordId, guildId)
  if (!existingPlayer) {
    return false
  }
  const previousAdjustment = existingPlayer.adjustment
  const valueToStore = adjustment === 0 ? null : adjustment
  await sql`UPDATE players SET adjustment = ${valueToStore} WHERE discord_id = ${discordId}`
  activePlayersCache.delete(guildId)
  const updatedPlayer = await getPlayerByDiscordId(discordId, guildId)
  if (!updatedPlayer) {
    return false
  }
  return { previousAdjustment, updatedPlayer }
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
  activePlayersCache.set(guildId, { data: allPlayers, timestamp: Date.now() })
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
  activePlayersCache.delete(guildId)
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
  activePlayersCache.delete(guildId)
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
  activePlayersCache.delete(guildId)
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
  activePlayersCache.delete(guildId)
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

const activePlayersCache = new Map<string, { data: Player[]; timestamp: number }>()

export function clearActivePlayersCache(guildId?: string): void {
  if (guildId) {
    activePlayersCache.delete(guildId)
  } else {
    activePlayersCache.clear()
  }
}

/**
 * Retrieves sorted active players for a specific guild, with per-guild caching.
 */
export async function getSortedActivePlayers(guildId: string, forceRefresh = false): Promise<Player[]> {
  const cacheEntry = activePlayersCache.get(guildId)
  if (forceRefresh || !cacheEntry || Date.now() - cacheEntry.timestamp >= 5000) {
    const active = await getActivePlayers(guildId)
    const data = active.sort((a, b) => getPlayerMMR(b) - getPlayerMMR(a))
    data.forEach((p, index) => {
      p.lobbyRank = index
    })
    activePlayersCache.set(guildId, { data, timestamp: Date.now() })
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

/**
 * Calculates the MMR for a player (including any adjustments).
 */
export function getPlayerMMR(player: Player): number {
  return (
    (player.usernames.accounts?.reduce(
      (bestMMR, account) => Math.max(bestMMR, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0, account.hpArMMR ?? 0),
      0
    ) ?? 0) + (player.adjustment ?? 0)
  )
}

/**
 * Gets the roles of the player as a pretty string.
 */
export function getPlayerRolesFormatted(role?: string): string {
  if (!role) {
    return 'role not set'
  }
  return role
    .split('')
    .map(r => roleMap[r])
    .join(', ')
}

/**
 * Formats a player's display representation (e.g. `1: 3167` <@123456789> Battletag `Assassin, Flex`).
 */
export function formatPlayerDisplay(
  player: Player,
  guildId: string,
  options: FormatPlayerDisplayOptions = {}
): string {
  const mmr = player.mmr ?? getPlayerMMR(player)
  const rank =
    player.lobbyRank !== undefined && !Number.isNaN(player.lobbyRank) ? `${player.lobbyRank + 1}: ${mmr}` : `${mmr}`

  let result = `\`${rank}\` <@${player.discordId}>`

  if (options.includeBattleTag) {
    const subAccount = player.usernames.accounts?.find(account => account.ownerDiscordId)
    const primaryAccount = subAccount ?? player.usernames.accounts?.find(account => account.isPrimary)
    if (primaryAccount) {
      result += ` ${primaryAccount.hotsBattleTag.replace(/#.*$/, '')}`
      if (primaryAccount.ownerDiscordId) {
        result += getSubstitutedAccountOwnerTag(primaryAccount.ownerDiscordId, guildId)
      }
    }
  }

  if (options.includeRole) {
    result += ` \`${getPlayerRolesFormatted(player.role)}\``
  }

  return result
}

/**
 * Retrieves all currently active account substitutions for a specific guild.
 */
export async function getActiveSubstitutions(guildId: string): Promise<AccountSubstitution[]> {
  const rows = await sql<AccountSubstitutionRow[]>`
    SELECT *
    FROM account_substitutions
    WHERE guild_id = ${guildId} AND is_active = TRUE
    ORDER BY date DESC
  `

  return rows.map<AccountSubstitution>(r => ({
    id: r.id,
    guildId: r.guild_id,
    hotsBattleTag: r.hots_battle_tag,
    originalDiscordId: r.original_discord_id,
    substituteDiscordId: r.substitute_discord_id,
    replayId: r.replay_id,
    date: r.date instanceof Date ? r.date.toISOString() : r.date,
    isActive: Boolean(r.is_active),
  }))
}

/**
 * Filters out substituted/loaned accounts unless their substitution is currently active in the guild.
 */
export async function filterActiveSubstitutedAccounts(
  accounts: HotsAccountRow[],
  guildId: string
): Promise<HotsAccountRow[]> {
  const activeSubs = await getActiveSubstitutions(guildId)
  if (activeSubs.length === 0) {
    return accounts.filter(acc => !acc.owner_discord_id)
  }
  const activeSubKeys = new Set(activeSubs.map(s => `${s.substituteDiscordId}:${s.hotsBattleTag.toLowerCase()}`))
  const activeSubTagPrefixes = new Set(
    activeSubs.map(s => `${s.substituteDiscordId}:${s.hotsBattleTag.split('#')[0].toLowerCase()}`)
  )
  return accounts.filter(acc => {
    if (!acc.owner_discord_id) return true
    const prefix = acc.hots_battle_tag.split('#')[0].toLowerCase()
    return (
      activeSubKeys.has(`${acc.discord_id}:${acc.hots_battle_tag.toLowerCase()}`) ||
      activeSubTagPrefixes.has(`${acc.discord_id}:${prefix}`)
    )
  })
}

/**
 * Formats the owner tag for a substituted/loaned account (e.g. " [not @OwnerName]").
 */
export function getSubstitutedAccountOwnerTag(ownerDiscordId: string, _guildId?: string): string {
  const ownerName = playerDisplayNameCache.get(ownerDiscordId) ?? 'unknown'
  return ` [not @${ownerName}]`
}

/**
 * Formats a label describing the loan status of an account (e.g. " (owned by @Owner)" or " (loaned to @Borrower)").
 */
export function getAccountLoanStatusTag(
  account: HotsAccount,
  _guildId: string,
  playerDiscordId?: string | null,
  activeSubs: AccountSubstitution[] = []
): string {
  if (account.ownerDiscordId) {
    return ` (owned by <@${account.ownerDiscordId}>)`
  }

  if (playerDiscordId) {
    const activeSub = activeSubs.find(
      s =>
        s.originalDiscordId === playerDiscordId &&
        s.hotsBattleTag.toLowerCase() === account.hotsBattleTag.toLowerCase()
    )
    if (activeSub) {
      return ` (loaned to <@${activeSub.substituteDiscordId}>)`
    }
  }

  return ''
}

/**
 * Retrieves a substitution for a specific battle tag (either historical for a replay or active).
 */
export async function getSubstitutionForAccount(
  battleTag: string,
  guildId?: string,
  replayId?: number
): Promise<AccountSubstitution | undefined> {
  let row: AccountSubstitutionRow | undefined
  const hashPrefixPattern = `${battleTag}#%`

  if (replayId !== undefined) {
    const rows = await sql<AccountSubstitutionRow[]>`
      SELECT *
      FROM account_substitutions
      WHERE replay_id = ${replayId} AND (
        LOWER(hots_battle_tag) = LOWER(${battleTag})
        OR LOWER(${battleTag}) LIKE LOWER(hots_battle_tag || '#%')
        OR hots_battle_tag ILIKE ${hashPrefixPattern}
      )
      LIMIT 1
    `
    row = rows[0]
  }

  if (!row) {
    if (guildId) {
      const rows = await sql<AccountSubstitutionRow[]>`
        SELECT *
        FROM account_substitutions
        WHERE guild_id = ${guildId} AND is_active = TRUE AND (
          LOWER(hots_battle_tag) = LOWER(${battleTag})
          OR LOWER(${battleTag}) LIKE LOWER(hots_battle_tag || '#%')
          OR hots_battle_tag ILIKE ${hashPrefixPattern}
        )
        ORDER BY date DESC
        LIMIT 1
      `
      row = rows[0]
    } else {
      const rows = await sql<AccountSubstitutionRow[]>`
        SELECT *
        FROM account_substitutions
        WHERE is_active = TRUE AND (
          LOWER(hots_battle_tag) = LOWER(${battleTag})
          OR LOWER(${battleTag}) LIKE LOWER(hots_battle_tag || '#%')
          OR hots_battle_tag ILIKE ${hashPrefixPattern}
        )
        ORDER BY date DESC
        LIMIT 1
      `
      row = rows[0]
    }
  }

  if (!row) return undefined
  return {
    id: row.id,
    guildId: row.guild_id,
    hotsBattleTag: row.hots_battle_tag,
    originalDiscordId: row.original_discord_id,
    substituteDiscordId: row.substitute_discord_id,
    replayId: row.replay_id,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    isActive: Boolean(row.is_active),
  }
}

/**
 * Sets a temporary account substitution: assigns an account normally owned by originalDiscordId to substituteDiscordId.
 * Creates a duplicate row in hots_accounts for the substitute user with owner_discord_id set.
 */
export async function setAccountSubstitution(
  guildId: string,
  battleTag: string,
  substituteDiscordId: string,
  originalDiscordId?: string
): Promise<{ success: boolean; accountId: number; originalDiscordId: string; hotsBattleTag: string }> {
  let ownerId = originalDiscordId
  let fullBattleTag = battleTag
  const hashPrefixPattern = `${battleTag}#%`

  if (!ownerId) {
    const existingRows = await sql<Array<{ discord_id: string; hots_battle_tag: string }>>`
      SELECT discord_id, hots_battle_tag
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${battleTag})
        AND owner_discord_id IS NULL
        AND discord_id IS NOT NULL
      LIMIT 1
    `
    const existing = existingRows[0]

    if (existing) {
      ownerId = existing.discord_id
      fullBattleTag = existing.hots_battle_tag
    } else {
      const prefixRows = await sql<Array<{ discord_id: string; hots_battle_tag: string }>>`
        SELECT discord_id, hots_battle_tag
        FROM hots_accounts
        WHERE hots_battle_tag ILIKE ${hashPrefixPattern}
          AND owner_discord_id IS NULL
          AND discord_id IS NOT NULL
        LIMIT 1
      `
      const prefixExisting = prefixRows[0]
      if (prefixExisting) {
        ownerId = prefixExisting.discord_id
        fullBattleTag = prefixExisting.hots_battle_tag
      }
    }
  }

  if (!ownerId) {
    return { success: false, accountId: 0, originalDiscordId: '', hotsBattleTag: '' }
  }

  const ownerPlayerRows = await sql<
    Array<{ discord_display_name: string; discord_global_name: string; discord_name: string }>
  >`
    SELECT discord_display_name, discord_global_name, discord_name
    FROM players
    WHERE discord_id = ${ownerId}
    LIMIT 1
  `
  if (ownerPlayerRows[0]) {
    cachePlayerDisplayName(
      ownerId,
      ownerPlayerRows[0].discord_display_name,
      ownerPlayerRows[0].discord_global_name,
      ownerPlayerRows[0].discord_name
    )
  }

  await sql`
    UPDATE account_substitutions
    SET is_active = FALSE
    WHERE guild_id = ${guildId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
      AND is_active = TRUE
  `

  await sql`
    INSERT INTO account_substitutions (guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, is_active)
    VALUES (${guildId}, ${fullBattleTag}, ${ownerId}, ${substituteDiscordId}, TRUE)
  `

  const accountId = await getOrCreateSubstituteAccount(substituteDiscordId, fullBattleTag, ownerId)

  activePlayersCache.delete(guildId)

  return {
    success: true,
    accountId,
    originalDiscordId: ownerId,
    hotsBattleTag: fullBattleTag,
  }
}

/**
 * Retrieves existing or creates a new duplicate hots_accounts row for a substitute player.
 */
export async function getOrCreateSubstituteAccount(
  substituteDiscordId: string,
  fullBattleTag: string,
  ownerId: string
): Promise<number> {
  const existingRows = await sql<Array<{ id: number }>>`
    SELECT id
    FROM hots_accounts
    WHERE discord_id = ${substituteDiscordId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
    LIMIT 1
  `
  const checkSubAccount = existingRows[0]

  if (checkSubAccount) {
    await sql`UPDATE hots_accounts SET owner_discord_id = ${ownerId} WHERE id = ${checkSubAccount.id}`
    return checkSubAccount.id
  }

  const origRows = await sql<HotsAccountRow[]>`
    SELECT *
    FROM hots_accounts
    WHERE discord_id = ${ownerId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
    LIMIT 1
  `
  const origAccount = origRows[0]

  const inserted = await sql<Array<{ id: number }>>`
    INSERT INTO hots_accounts (
      discord_id, hots_battle_tag, is_primary, owner_discord_id,
      hp_region, hp_blizz_id, hp_qm_mmr, hp_sl_mmr, hp_ar_mmr, hp_qm_games, hp_sl_games, hp_ar_games
    ) VALUES (
      ${substituteDiscordId},
      ${fullBattleTag},
      FALSE,
      ${ownerId},
      ${origAccount?.hp_region ?? origAccount?.HP_Region ?? null},
      ${origAccount?.hp_blizz_id !== undefined && origAccount?.hp_blizz_id !== null ? String(origAccount.hp_blizz_id) : origAccount?.HP_Blizz_ID !== undefined && origAccount?.HP_Blizz_ID !== null ? String(origAccount.HP_Blizz_ID) : null},
      ${origAccount?.hp_qm_mmr ?? origAccount?.HP_QM_MMR ?? null},
      ${origAccount?.hp_sl_mmr ?? origAccount?.HP_SL_MMR ?? null},
      ${origAccount?.hp_ar_mmr ?? origAccount?.HP_AR_MMR ?? null},
      ${origAccount?.hp_qm_games ?? origAccount?.HP_QM_Games ?? null},
      ${origAccount?.hp_sl_games ?? origAccount?.HP_SL_Games ?? null},
      ${origAccount?.hp_ar_games ?? origAccount?.HP_AR_Games ?? null}
    )
    RETURNING id
  `
  return inserted[0].id
}

/**
 * Retrieves the effective HotS account information for a BattleTag, taking any active
 * or historical substitution (for a specific replay) into account.
 */
export async function getAccountWithSubstitution(
  battleTag: string,
  guildId: string,
  replayId?: number
): Promise<ResolvedHotsAccount> {
  const sub = await getSubstitutionForAccount(battleTag, guildId, replayId)
  if (sub) {
    const hotsAccountId = await getOrCreateSubstituteAccount(sub.substituteDiscordId, battleTag, sub.originalDiscordId)
    return {
      hotsAccountId,
      discordId: sub.substituteDiscordId,
      ownerDiscordId: sub.originalDiscordId,
      battleTag,
    }
  }

  const accountRows = await sql<Array<{ id: number; discord_id: string | null }>>`
    SELECT id, discord_id
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${battleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  let accountRow = accountRows[0]

  if (!accountRow) {
    const inserted = await sql<Array<{ id: number; discord_id: string | null }>>`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (NULL, ${battleTag}, TRUE)
      ON CONFLICT (LOWER(hots_battle_tag)) WHERE owner_discord_id IS NULL DO UPDATE SET
        hots_battle_tag = EXCLUDED.hots_battle_tag
      RETURNING id, discord_id
    `
    accountRow = inserted[0]
  }

  return {
    hotsAccountId: accountRow.id,
    discordId: accountRow.discord_id,
    ownerDiscordId: null,
    battleTag,
  }
}

/**
 * Clears active substitutions in a guild, either for a specific account or for all accounts.
 */
export async function clearAccountSubstitutions(guildId: string, battleTag?: string): Promise<number> {
  activePlayersCache.delete(guildId)
  if (battleTag) {
    const hashPrefixPattern = `${battleTag}#%`
    const result = await sql`
      UPDATE account_substitutions
      SET is_active = FALSE
      WHERE guild_id = ${guildId}
        AND is_active = TRUE
        AND (LOWER(hots_battle_tag) = LOWER(${battleTag}) OR hots_battle_tag ILIKE ${hashPrefixPattern})
    `
    return result.count
  }

  const result = await sql`
    UPDATE account_substitutions
    SET is_active = FALSE
    WHERE guild_id = ${guildId} AND is_active = TRUE
  `
  return result.count
}

export async function loadPlayerDataIntoSqlite(): Promise<void> {
  // Legacy no-op retained for compatibility
}
