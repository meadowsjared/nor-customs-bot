import {
  PLAYER_STATS_VIEW_SCHEMA_SQL,
  PlayerAggregatedStats,
  PlayerStatsFilter,
  ReplayPlayerStatRow,
} from '../types/player'
import { sql } from './db'

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

