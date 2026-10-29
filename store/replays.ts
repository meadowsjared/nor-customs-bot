import {
  fromReplayRow,
  REPLAYS_TABLE_SCHEMA_SQL,
  ReplayData,
  ReplayDataFile,
  ReplayRow,
  toReplayRow,
} from '../types/replay'
import { sql } from './db'
import { initPlayerStatsView, refreshPlayerStatsView } from './player'

function isReplayDataFile(item: ReplayData | ReplayDataFile): item is ReplayDataFile {
  return 'replayData' in item
}

/**
 * Initializes the `replays` table, the `mv_replay_player_stats` materialized view,
 * and all indexes in PostgreSQL.
 */
export async function initReplaysTable(): Promise<void> {
  await sql.unsafe(REPLAYS_TABLE_SCHEMA_SQL)
  await initPlayerStatsView()
}

export interface InsertReplaysOptions {
  refreshStats?: boolean
}

/**
 * Inserts an array of `ReplayData` or `ReplayDataFile` objects into the `replays` table
 * and optionally refreshes the `mv_replay_player_stats` materialized view (defaults to true).
 */
export async function insertReplays(
  items: readonly (ReplayData | ReplayDataFile)[],
  options?: InsertReplaysOptions
): Promise<ReplayRow[]> {
  const refreshStats = options?.refreshStats ?? true
  if (items.length === 0) {
    return []
  }

  const rows = items.map(item => toReplayRow(isReplayDataFile(item) ? item.replayData : item))

  const inserted = await sql<ReplayRow[]>`
    INSERT INTO replays ${sql(rows)}
    ON CONFLICT (map, date, loop_length) DO UPDATE SET
      raw_date = EXCLUDED.raw_date,
      type = EXCLUDED.type,
      mode = EXCLUDED.mode,
      length = EXCLUDED.length,
      loop_game_start = EXCLUDED.loop_game_start,
      region = EXCLUDED.region,
      winner = EXCLUDED.winner,
      team0_takedowns = EXCLUDED.team0_takedowns,
      team1_takedowns = EXCLUDED.team1_takedowns,
      team0_players = EXCLUDED.team0_players,
      team1_players = EXCLUDED.team1_players,
      file = EXCLUDED.file,
      filename = EXCLUDED.filename,
      status = EXCLUDED.status,
      first_pick_win = EXCLUDED.first_pick_win,
      first_objective = EXCLUDED.first_objective,
      first_objective_win = EXCLUDED.first_objective_win,
      first_fort = EXCLUDED.first_fort,
      first_keep = EXCLUDED.first_keep,
      first_fort_win = EXCLUDED.first_fort_win,
      first_keep_win = EXCLUDED.first_keep_win,
      version = EXCLUDED.version,
      player_ids = EXCLUDED.player_ids,
      heroes = EXCLUDED.heroes,
      winning_players = EXCLUDED.winning_players,
      level_times = EXCLUDED.level_times,
      bans = EXCLUDED.bans,
      picks = EXCLUDED.picks,
      xp_breakdown = EXCLUDED.xp_breakdown,
      takedowns = EXCLUDED.takedowns,
      mercs = EXCLUDED.mercs,
      structures = EXCLUDED.structures,
      objective = EXCLUDED.objective,
      teams = EXCLUDED.teams,
      messages = EXCLUDED.messages,
      level_adv_timeline = EXCLUDED.level_adv_timeline,
      players = EXCLUDED.players
    RETURNING *
  `

  if (refreshStats) {
    await refreshPlayerStatsView()
  }
  return inserted
}

/**
 * Retrieves all replays from the `replays` table and reconstructs full `ReplayData` objects.
 */
export async function getReplays(): Promise<ReplayData[]> {
  const rows = await sql<ReplayRow[]>`
    SELECT *
    FROM replays
    ORDER BY date DESC
  `
  return rows.map(fromReplayRow)
}
