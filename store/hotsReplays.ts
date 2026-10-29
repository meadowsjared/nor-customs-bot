import { createRequire } from 'module'
import path from 'path'
import type { HotSReplayObject, ReplayData } from '../types/replay'
import { parseReplay, parseReplaySync } from '../utils/replayParser'
import { sql } from './db'
import {
  clearActivePlayersCache,
  getAccountWithSubstitution,
  getOrCreateSubstituteAccount,
  refreshPlayerStatsView,
  relinkAccountSubstitutions,
  ResolvedHotsAccount,
} from './player'
import { initReplaysTable, insertReplays } from './replays'

export { parseReplay, parseReplaySync, relinkAccountSubstitutions }

const require = createRequire(import.meta.url)

// Initialize replays table and materialized view on startup
initReplaysTable().catch(error => {
  console.error('Error initializing replays schema in PostgreSQL:', error)
})

export type ParsedReplay = ReplayData

/**
 * Loads all imported replay filenames and full paths into a Set of basename strings
 * for instant O(1) in-memory skip checks.
 */
export async function getImportedReplayFilenames(): Promise<Set<string>> {
  const rows = await sql<Array<{ file: string | null; filename: string | null }>>`
    SELECT file, filename FROM replays
  `
  const set = new Set<string>()
  for (const row of rows) {
    if (row.filename) {
      set.add(path.basename(row.filename))
    }
    if (row.file) {
      set.add(path.basename(row.file))
    }
  }
  return set
}

export interface SaveReplayOptions {
  refreshStats?: boolean
  linkSubstitutions?: boolean
}

/**
 * Saves a parsed custom match into the PostgreSQL `replays` table, optionally refreshes `mv_replay_player_stats`,
 * records any active account substitutions for the replay, and returns its assigned replay ID.
 */
export async function saveReplayToDb(
  parsedReplay: ParsedReplay,
  guildId: string,
  options?: SaveReplayOptions
): Promise<number> {
  const inserted = await insertReplays([parsedReplay], options)
  const replayRow = inserted[0]
  if (!replayRow) {
    throw new Error('Failed to insert or retrieve replay match record')
  }
  const replayId = replayRow.id

  if (options?.linkSubstitutions !== false) {
    const players = Object.values(parsedReplay.replayObj.players || {})
    for (const player of players) {
      const battleTag = `${player.name}#${player.tag}`
      const resolvedAccount = await getAccountWithSubstitution(battleTag, guildId, replayId)

      // If an active substitution applied to this player, record a historical substitution entry for this replayId
      if (resolvedAccount.ownerDiscordId && resolvedAccount.discordId) {
        const existingSub = await sql<Array<{ id: number }>>`
          SELECT id
          FROM account_substitutions
          WHERE replay_id = ${replayId}
            AND LOWER(hots_battle_tag) = LOWER(${battleTag})
          LIMIT 1
        `
        if (existingSub[0]) {
          await sql`
            UPDATE account_substitutions
            SET substitute_discord_id = ${resolvedAccount.discordId},
                original_discord_id = ${resolvedAccount.ownerDiscordId}
            WHERE id = ${existingSub[0].id}
          `
        } else {
          await sql`
            INSERT INTO account_substitutions (
              guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, replay_id, is_active
            ) VALUES (
              ${guildId}, ${battleTag}, ${resolvedAccount.ownerDiscordId}, ${resolvedAccount.discordId}, ${replayId}, FALSE
            )
          `
        }
      }
    }
  }

  return replayId
}

/**
 * Links any currently active substitutions in the guild to newly imported replays in one batch.
 */
export async function linkActiveSubstitutionsForReplays(
  guildId: string,
  replayIds: number[]
): Promise<number> {
  if (replayIds.length === 0) return 0

  const activeSubs = await sql<Array<{
    id: number
    hots_battle_tag: string
    original_discord_id: string
    substitute_discord_id: string
  }>>`
    SELECT id, hots_battle_tag, original_discord_id, substitute_discord_id
    FROM account_substitutions
    WHERE guild_id = ${guildId} AND is_active = TRUE
  `

  if (activeSubs.length === 0) return 0

  let linkedCount = 0
  for (const sub of activeSubs) {
    const pattern = `%"name": "${sub.hots_battle_tag.split('#')[0]}"%`
    const matchedReplays = await sql<Array<{ id: number }>>`
      SELECT id
      FROM replays
      WHERE id = ANY(${replayIds})
        AND players::text ILIKE ${pattern}
    `
    for (const r of matchedReplays) {
      const existing = await sql<Array<{ id: number }>>`
        SELECT id FROM account_substitutions
        WHERE replay_id = ${r.id}
          AND LOWER(hots_battle_tag) = LOWER(${sub.hots_battle_tag})
        LIMIT 1
      `
      if (!existing[0]) {
        await sql`
          INSERT INTO account_substitutions (
            guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, replay_id, is_active
          ) VALUES (
            ${guildId}, ${sub.hots_battle_tag}, ${sub.original_discord_id}, ${sub.substitute_discord_id}, ${r.id}, FALSE
          )
        `
        linkedCount++
      }
    }
  }

  return linkedCount
}

/**
 * Checks if a replay file (full path or filename) has already been imported into the database.
 */
export async function isReplayImported(file: string): Promise<boolean> {
  const baseName = path.basename(file)
  const suffixPattern = `%${baseName}`
  const rows = await sql<Array<{ id: number }>>`
    SELECT id
    FROM replays
    WHERE file = ${file}
       OR filename = ${file}
       OR file LIKE ${suffixPattern}
       OR filename LIKE ${suffixPattern}
    LIMIT 1
  `
  return rows.length > 0
}

export type PlayerMatchStats = {
  totalGames: number
  wins: number
  losses: number
  winRate: number
  recentMatches: Array<{
    replayId?: number
    date: string
    map: string
    hero: string
    battleTag?: string
    isSubstitute?: boolean
    win: boolean
    kills: number
    assists: number
    deaths: number
  }>
  topHeroes: Array<{
    hero: string
    games: number
    wins: number
    winRate: number
  }>
  bestHeroes: Array<{
    hero: string
    games: number
    wins: number
    winRate: number
  }>
  bmStats: {
    bsteps: number
    bstepTd: number
    bstepDeaths: number
    taunts: number
    tauntTd: number
    tauntDeaths: number
    sprays: number
    sprayTd: number
    sprayDeaths: number
    dances: number
    danceTd: number
    danceDeaths: number
  }
}

export async function getPlayerMatchStats(
  discordId: string,
  limit: number = 13,
  minBestHeroGames: number = 5,
  numHeroesLimit: number = 3
): Promise<PlayerMatchStats> {
  type OverallAndBmRow = {
    total_games: number
    wins: number
    win_rate: number
    bsteps: number
    bstep_td: number
    bstep_deaths: number
    taunts: number
    taunt_td: number
    taunt_deaths: number
    sprays: number
    spray_td: number
    spray_deaths: number
    dances: number
    dance_td: number
    dance_deaths: number
  }

  const overallRows = await sql<OverallAndBmRow[]>`
    WITH player_matches AS (
      SELECT
        s.*,
        COALESCE(sub.substitute_discord_id, owner_ha.discord_id) AS effective_discord_id,
        COALESCE(sub.original_discord_id, owner_ha.discord_id) AS owner_discord_id
      FROM mv_replay_player_stats s
      LEFT JOIN LATERAL (
        SELECT original_discord_id, substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        LIMIT 1
      ) sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT discord_id
        FROM hots_accounts ha
        WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
          AND ha.owner_discord_id IS NULL
        LIMIT 1
      ) owner_ha ON TRUE
    )
    SELECT
      COUNT(*)::int AS total_games,
      COALESCE(SUM(CASE WHEN win THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(ROUND(AVG(CASE WHEN win THEN 100.0 ELSE 0.0 END)::numeric, 1)::double precision, 0) AS win_rate,
      COALESCE(SUM(bsteps_count), 0)::int AS bsteps,
      COALESCE(SUM(bstep_td), 0)::int AS bstep_td,
      COALESCE(SUM(bstep_deaths), 0)::int AS bstep_deaths,
      COALESCE(SUM(taunts_count), 0)::int AS taunts,
      COALESCE(SUM(taunt_td), 0)::int AS taunt_td,
      COALESCE(SUM(taunt_deaths), 0)::int AS taunt_deaths,
      COALESCE(SUM(sprays_count), 0)::int AS sprays,
      COALESCE(SUM(spray_td), 0)::int AS spray_td,
      COALESCE(SUM(spray_deaths), 0)::int AS spray_deaths,
      COALESCE(SUM(dances_count), 0)::int AS dances,
      COALESCE(SUM(dance_td), 0)::int AS dance_td,
      COALESCE(SUM(dance_deaths), 0)::int AS dance_deaths
    FROM player_matches
    WHERE effective_discord_id = ${discordId}
  `

  const summary = overallRows[0]
  const totalGames = summary?.total_games ?? 0
  const wins = summary?.wins ?? 0
  const losses = totalGames - wins
  const winRate = totalGames > 0 ? (summary?.win_rate ?? 0) : 0

  const bmStats = {
    bsteps: summary?.bsteps ?? 0,
    bstepTd: summary?.bstep_td ?? 0,
    bstepDeaths: summary?.bstep_deaths ?? 0,
    taunts: summary?.taunts ?? 0,
    tauntTd: summary?.taunt_td ?? 0,
    tauntDeaths: summary?.taunt_deaths ?? 0,
    sprays: summary?.sprays ?? 0,
    sprayTd: summary?.spray_td ?? 0,
    sprayDeaths: summary?.spray_deaths ?? 0,
    dances: summary?.dances ?? 0,
    danceTd: summary?.dance_td ?? 0,
    danceDeaths: summary?.dance_deaths ?? 0,
  }

  if (totalGames === 0) {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      recentMatches: [],
      topHeroes: [],
      bestHeroes: [],
      bmStats,
    }
  }

  type RecentMatchRow = {
    replay_id: number
    date: Date | string
    map: string
    hero: string
    hots_battle_tag: string
    owner_discord_id: string | null
    effective_discord_id: string | null
    win: boolean
    kills: number
    assists: number
    deaths: number
  }

  const recentMatchesRaw = await sql<RecentMatchRow[]>`
    WITH player_matches AS (
      SELECT
        s.replay_id,
        s.date,
        s.map,
        s.hero,
        s.hots_battle_tag,
        s.win,
        s.solo_kills AS kills,
        s.assists,
        s.deaths,
        COALESCE(sub.substitute_discord_id, owner_ha.discord_id) AS effective_discord_id,
        COALESCE(sub.original_discord_id, owner_ha.discord_id) AS owner_discord_id
      FROM mv_replay_player_stats s
      LEFT JOIN LATERAL (
        SELECT original_discord_id, substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        LIMIT 1
      ) sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT discord_id
        FROM hots_accounts ha
        WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
          AND ha.owner_discord_id IS NULL
        LIMIT 1
      ) owner_ha ON TRUE
    )
    SELECT *
    FROM player_matches
    WHERE effective_discord_id = ${discordId}
    ORDER BY date DESC
    LIMIT ${limit}
  `

  const recentMatches = recentMatchesRaw.map(m => ({
    replayId: m.replay_id,
    date: m.date instanceof Date ? m.date.toISOString() : m.date,
    map: m.map,
    hero: m.hero,
    battleTag: m.hots_battle_tag,
    isSubstitute: Boolean(m.owner_discord_id && m.owner_discord_id !== m.effective_discord_id),
    win: Boolean(m.win),
    kills: m.kills,
    assists: m.assists,
    deaths: m.deaths,
  }))

  type HeroStatRow = {
    hero: string
    games: number
    wins: number
    winRate: number
  }

  const topHeroes = await sql<HeroStatRow[]>`
    WITH player_matches AS (
      SELECT
        s.hero,
        s.win,
        COALESCE(sub.substitute_discord_id, owner_ha.discord_id) AS effective_discord_id
      FROM mv_replay_player_stats s
      LEFT JOIN LATERAL (
        SELECT substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        LIMIT 1
      ) sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT discord_id
        FROM hots_accounts ha
        WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
          AND ha.owner_discord_id IS NULL
        LIMIT 1
      ) owner_ha ON TRUE
    )
    SELECT
      hero,
      COUNT(*)::int AS games,
      SUM(CASE WHEN win THEN 1 ELSE 0 END)::int AS wins,
      ROUND(AVG(CASE WHEN win THEN 100.0 ELSE 0.0 END)::numeric, 1)::double precision AS "winRate"
    FROM player_matches
    WHERE effective_discord_id = ${discordId}
    GROUP BY hero
    ORDER BY games DESC
    LIMIT ${numHeroesLimit}
  `

  const bestHeroes = await sql<HeroStatRow[]>`
    WITH player_matches AS (
      SELECT
        s.hero,
        s.win,
        COALESCE(sub.substitute_discord_id, owner_ha.discord_id) AS effective_discord_id
      FROM mv_replay_player_stats s
      LEFT JOIN LATERAL (
        SELECT substitute_discord_id
        FROM account_substitutions a
        WHERE a.replay_id = s.replay_id
          AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
        LIMIT 1
      ) sub ON TRUE
      LEFT JOIN LATERAL (
        SELECT discord_id
        FROM hots_accounts ha
        WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
          AND ha.owner_discord_id IS NULL
        LIMIT 1
      ) owner_ha ON TRUE
    )
    SELECT
      hero,
      COUNT(*)::int AS games,
      SUM(CASE WHEN win THEN 1 ELSE 0 END)::int AS wins,
      ROUND(AVG(CASE WHEN win THEN 100.0 ELSE 0.0 END)::numeric, 1)::double precision AS "winRate"
    FROM player_matches
    WHERE effective_discord_id = ${discordId}
    GROUP BY hero
    HAVING COUNT(*) >= ${minBestHeroGames}
    ORDER BY AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END) DESC, COUNT(*) DESC
    LIMIT ${numHeroesLimit}
  `

  return {
    totalGames,
    wins,
    losses,
    winRate,
    recentMatches,
    topHeroes,
    bestHeroes,
    bmStats,
  }
}

export async function optimizeDb(): Promise<void> {
  try {
    console.log('Re-linking any orphaned account substitutions...')
    await relinkAccountSubstitutions()
    console.log('Refreshing mv_replay_player_stats and analyzing replays table...')
    await refreshPlayerStatsView()
    await sql`ANALYZE replays`
    console.log('Database optimization complete!')
  } catch (error) {
    console.error('Error optimizing database:', error)
  }
}

export type UnlinkedReplayAccount = {
  hotsBattleTag: string
  name: string
  tag: number
  gameCount: number
  lastSeenDate: string
  heroesPlayed: string
}

export type GetUnlinkedAccountsOptions = {
  search?: string
  minGames?: number
  sortBy?: 'recent' | 'games'
  limit?: number
  offset?: number
}

function unlinkedReplayWhereClause(clean: string, searchPattern: string) {
  return sql`
    s.hots_battle_tag IS NOT NULL
    AND s.hots_battle_tag != ''
    AND (${clean} = '' OR s.hots_battle_tag ILIKE ${searchPattern} OR s.player_name ILIKE ${searchPattern})
    AND NOT EXISTS (
      SELECT 1
      FROM hots_accounts ha
      WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
        AND ha.discord_id IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM account_substitutions sub
      WHERE sub.replay_id = s.replay_id
        AND LOWER(sub.hots_battle_tag) = LOWER(s.hots_battle_tag)
    )
  `
}

export async function getUnlinkedReplayAccounts(
  options: GetUnlinkedAccountsOptions = {}
): Promise<{ accounts: UnlinkedReplayAccount[]; totalCount: number }> {
  const clean = options.search?.trim() ?? ''
  const searchPattern = `%${clean}%`
  const minGames = Math.max(1, options.minGames ?? 1)
  const sortBy = options.sortBy ?? 'recent'
  const limit = Math.max(1, options.limit ?? 10)
  const offset = Math.max(0, options.offset ?? 0)

  type DataRow = {
    hots_battle_tag: string
    name: string
    tag: number
    game_count: number
    last_seen_date: Date | string
    heroes_played: string | null
    total_count: number
  }

  const rows = await sql<DataRow[]>`
    SELECT
      s.hots_battle_tag,
      MAX(s.player_name) AS name,
      MAX(s.tag)::int AS tag,
      COUNT(DISTINCT s.replay_id)::int AS game_count,
      MAX(s.date) AS last_seen_date,
      STRING_AGG(DISTINCT s.hero, ',') AS heroes_played,
      COUNT(*) OVER ()::int AS total_count
    FROM mv_replay_player_stats s
    WHERE ${unlinkedReplayWhereClause(clean, searchPattern)}
    GROUP BY s.hots_battle_tag
    HAVING COUNT(DISTINCT s.replay_id) >= ${minGames}
    ORDER BY
      CASE WHEN ${sortBy} = 'games' THEN COUNT(DISTINCT s.replay_id) END DESC,
      MAX(s.date) DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  const totalCount = rows[0]?.total_count ?? 0
  const accounts: UnlinkedReplayAccount[] = rows.map(r => ({
    hotsBattleTag: r.hots_battle_tag,
    name: r.name,
    tag: r.tag,
    gameCount: r.game_count,
    lastSeenDate: r.last_seen_date instanceof Date ? r.last_seen_date.toISOString() : r.last_seen_date,
    heroesPlayed: r.heroes_played ?? '',
  }))

  return { accounts, totalCount }
}

export async function getUnlinkedReplayAccountsForAutocomplete(
  query: string,
  limit = 10
): Promise<Array<{ hotsBattleTag: string; gameCount: number }>> {
  const clean = query.trim()
  const searchPattern = `%${clean}%`

  type AutoRow = {
    hots_battle_tag: string
    game_count: number
  }

  const rows = await sql<AutoRow[]>`
    SELECT
      s.hots_battle_tag,
      COUNT(DISTINCT s.replay_id)::int AS game_count
    FROM mv_replay_player_stats s
    WHERE ${unlinkedReplayWhereClause(clean, searchPattern)}
    GROUP BY s.hots_battle_tag
    ORDER BY game_count DESC, MAX(s.replay_id) DESC
    LIMIT ${limit}
  `

  return rows.map(r => ({
    hotsBattleTag: r.hots_battle_tag,
    gameCount: r.game_count,
  }))
}

export type RecentReplaySummary = {
  id: number
  map: string
  date: string
  length: number | null
  winner: number | null
  team0Takedowns: number | null
  team1Takedowns: number | null
}

export type ReplayPlayerInfo = {
  id: number
  replay_id: number
  hots_battle_tag: string
  hero: string
  team: number
  win: number
  discord_id: string | null
  owner_discord_id: string | null
  hots_account_id: number
  substitute_display_name?: string | null
  owner_display_name?: string | null
}

export type ReassignReplayResult = {
  success: boolean
  message: string
  replayId?: number
  map?: string
  date?: string
  battleTag?: string
  hero?: string
  originalDiscordId?: string | null
  substituteDiscordId?: string
}

type RawReplaySummaryRow = {
  id: number
  map: string
  date: Date | string
  length: number | null
  winner: number | null
  team0Takedowns: number | null
  team1Takedowns: number | null
}

function normalizeReplaySummary(row: RawReplaySummaryRow): RecentReplaySummary {
  return {
    id: row.id,
    map: row.map,
    date: row.date instanceof Date ? row.date.toISOString() : row.date,
    length: row.length,
    winner: row.winner,
    team0Takedowns: row.team0Takedowns,
    team1Takedowns: row.team1Takedowns,
  }
}

/**
 * Returns the most recent imported replays, ordered by newest ID first.
 */
export async function getRecentReplays(limit = 20): Promise<RecentReplaySummary[]> {
  const rows = await sql<RawReplaySummaryRow[]>`
    SELECT
      id,
      map,
      date,
      length,
      winner,
      team0_takedowns AS "team0Takedowns",
      team1_takedowns AS "team1Takedowns"
    FROM replays
    ORDER BY id DESC
    LIMIT ${limit}
  `
  return rows.map(normalizeReplaySummary)
}

/**
 * Returns a single replay summary by its ID.
 */
export async function getReplaySummary(replayId: number): Promise<RecentReplaySummary | undefined> {
  const rows = await sql<RawReplaySummaryRow[]>`
    SELECT
      id,
      map,
      date,
      length,
      winner,
      team0_takedowns AS "team0Takedowns",
      team1_takedowns AS "team1Takedowns"
    FROM replays
    WHERE id = ${replayId}
    LIMIT 1
  `
  return rows[0] ? normalizeReplaySummary(rows[0]) : undefined
}

/**
 * Returns the player roster and stats for a given replay ID.
 */
export async function getReplayPlayers(replayId: number): Promise<ReplayPlayerInfo[]> {
  type RawReplayPlayerRow = {
    id: number
    replay_id: number
    hots_battle_tag: string
    hero: string
    team: number
    win: number
    discord_id: string | null
    owner_discord_id: string | null
    hots_account_id: number
    substitute_display_name: string | null
    owner_display_name: string | null
  }

  return await sql<RawReplayPlayerRow[]>`
    SELECT
      ROW_NUMBER() OVER (ORDER BY s.team ASC, s.hero ASC)::int AS id,
      s.replay_id,
      s.hots_battle_tag,
      s.hero,
      s.team,
      (CASE WHEN s.win THEN 1 ELSE 0 END)::int AS win,
      COALESCE(sub.substitute_discord_id, owner_ha.discord_id) AS discord_id,
      CASE
        WHEN sub.substitute_discord_id IS NOT NULL THEN COALESCE(sub.original_discord_id, owner_ha.discord_id)
        ELSE NULL
      END AS owner_discord_id,
      COALESCE(sub_ha.id, owner_ha.id, 0)::int AS hots_account_id,
      sub_p.discord_display_name AS substitute_display_name,
      owner_p.discord_display_name AS owner_display_name
    FROM mv_replay_player_stats s
    LEFT JOIN LATERAL (
      SELECT original_discord_id, substitute_discord_id
      FROM account_substitutions a
      WHERE a.replay_id = s.replay_id
        AND LOWER(a.hots_battle_tag) = LOWER(s.hots_battle_tag)
      LIMIT 1
    ) sub ON TRUE
    LEFT JOIN LATERAL (
      SELECT id, discord_id
      FROM hots_accounts ha
      WHERE LOWER(ha.hots_battle_tag) = LOWER(s.hots_battle_tag)
        AND ha.owner_discord_id IS NULL
      LIMIT 1
    ) owner_ha ON TRUE
    LEFT JOIN LATERAL (
      SELECT id
      FROM hots_accounts ha2
      WHERE sub.substitute_discord_id IS NOT NULL
        AND ha2.discord_id = sub.substitute_discord_id
        AND LOWER(ha2.hots_battle_tag) = LOWER(s.hots_battle_tag)
      LIMIT 1
    ) sub_ha ON TRUE
    LEFT JOIN players sub_p ON COALESCE(sub.substitute_discord_id, owner_ha.discord_id) = sub_p.discord_id
    LEFT JOIN players owner_p ON COALESCE(sub.original_discord_id, owner_ha.discord_id) = owner_p.discord_id
    WHERE s.replay_id = ${replayId}
    ORDER BY s.team ASC, s.hero ASC
  `
}

/**
 * Reassigns a player in a historical replay match to a substitute user.
 * Stores the historical substitution in `account_substitutions` and ensures the substitute account row exists.
 */
export async function reassignReplayPlayer(
  guildId: string,
  replayId: number,
  battleTagInput: string,
  substituteDiscordId: string
): Promise<ReassignReplayResult> {
  const replay = await getReplaySummary(replayId)
  if (!replay) {
    return { success: false, message: `Replay ID ${replayId} was not found in the database.` }
  }

  const players = await getReplayPlayers(replayId)
  const lowerInput = battleTagInput.toLowerCase()
  const playerStat = players.find(
    p =>
      p.hots_battle_tag.toLowerCase() === lowerInput ||
      p.hots_battle_tag.toLowerCase().startsWith(`${lowerInput}#`)
  )

  if (!playerStat) {
    return {
      success: false,
      message: `Could not find player matching "${battleTagInput}" in replay ID ${replayId}.`,
    }
  }

  let originalDiscordId: string | null = playerStat.owner_discord_id ?? playerStat.discord_id

  if (!originalDiscordId) {
    const origRows = await sql<Array<{ discord_id: string | null }>>`
      SELECT discord_id
      FROM hots_accounts
      WHERE LOWER(hots_battle_tag) = LOWER(${playerStat.hots_battle_tag})
        AND owner_discord_id IS NULL
      LIMIT 1
    `
    if (origRows[0]?.discord_id) {
      originalDiscordId = origRows[0].discord_id
    }
  }

  const effectiveOwnerId = originalDiscordId ?? substituteDiscordId

  await getOrCreateSubstituteAccount(substituteDiscordId, playerStat.hots_battle_tag, effectiveOwnerId)

  const existingSubRows = await sql<Array<{ id: number }>>`
    SELECT id
    FROM account_substitutions
    WHERE replay_id = ${replayId}
      AND LOWER(hots_battle_tag) = LOWER(${playerStat.hots_battle_tag})
    LIMIT 1
  `
  const existingSub = existingSubRows[0]

  if (existingSub) {
    await sql`
      UPDATE account_substitutions
      SET substitute_discord_id = ${substituteDiscordId},
          original_discord_id = ${effectiveOwnerId}
      WHERE id = ${existingSub.id}
    `
  } else {
    await sql`
      INSERT INTO account_substitutions (
        guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, replay_id, is_active
      ) VALUES (
        ${guildId}, ${playerStat.hots_battle_tag}, ${effectiveOwnerId}, ${substituteDiscordId}, ${replayId}, FALSE
      )
    `
  }

  clearActivePlayersCache(guildId)

  return {
    success: true,
    message: 'Success',
    replayId: replay.id,
    map: replay.map,
    date: replay.date,
    battleTag: playerStat.hots_battle_tag,
    hero: playerStat.hero,
    originalDiscordId,
    substituteDiscordId,
  }
}
