/**
 * Complete TypeScript definitions for Heroes of the Storm parsed replay data
 * matching `store/replayData.debug.json`, and the PostgreSQL `replays` table schema.
 */

import type { ReplayPlayer } from './player'

export type {
  PlayerAggregatedStats,
  PlayerStatsFilter,
  ReplayBStepEvent,
  ReplayGlobeEvent,
  ReplayLootEmoteEvent,
  ReplayPlayer,
  ReplayPlayerGameStats,
  ReplayPlayerGlobes,
  ReplayPlayerStatRow,
  ReplayPlayerTalents,
  ReplayPlayerUnit,
  ReplayTauntDanceEvent,
  ReplayUnitLife,
} from './player'

export type ReplayVersion = {
  m_flags: number
  m_major: number
  m_minor: number
  m_revision: number
  m_build: number
  m_baseBuild: number
}

export type ReplayPoint = {
  x: number
  y: number
}

export type ReplayTimedLocation = {
  x: number
  y: number
  time: number
}

export type ReplayLevelTime = {
  loop: number
  level: number
  team: string | number
  time: number
}

export type ReplayBanEntry = {
  hero: string
  order: number
  absolute: number
}

export type ReplayBans = {
  '0': ReplayBanEntry[]
  '1': ReplayBanEntry[]
}

export type ReplayPicks = {
  '0': string[]
  '1': string[]
  first?: number
}

export type ReplayXPBreakdownValues = {
  GameTime?: number
  PreviousGameTime?: number
  MinionXP: number
  CreepXP: number
  StructureXP: number
  HeroXP: number
  TrickleXP: number
}

export type ReplayXPBreakdownEntry = {
  loop: number
  time: number
  team: number
  teamLevel?: number
  breakdown: ReplayXPBreakdownValues
  theoreticalMinionXP: number
}

export type ReplayTakedownParticipant = {
  player: string
  hero: string
}

export type ReplayTakedown = {
  loop: number
  time: number
  x: number
  y: number
  killers: ReplayTakedownParticipant[]
  victim: ReplayTakedownParticipant
}

export type ReplayMercCapture = {
  loop: number
  type: string
  team: number
  time: number
}

export type ReplayMercUnit = {
  loop: number
  team: number
  type: string
  locations: ReplayPoint[]
  time: number
  duration?: number
}

export type ReplayMercs = {
  captures: ReplayMercCapture[]
  units: Record<string, ReplayMercUnit>
}

export type ReplayStructure = {
  type: string
  name: string
  tag: number
  rtag: number
  x: number
  y: number
  team: number
  destroyedLoop?: number
  destroyed?: number
}

export type ReplayObjectiveEvent = {
  team: number
  loop: number
  time: number
  loopDuration?: number
  duration?: number
  player?: string
  damage?: number
  owned?: number
  type?: string
  siegeDamage?: number
  heroDamage?: number
  score?: number
  teamScore?: number
  otherScore?: number
  active?: boolean
  eventIdx?: number
  unitIdx?: number
  tag?: number
  rtag?: number
  x?: number
  y?: number
  died?: number
  success?: boolean
}

export type ReplayTeamObjective = {
  count?: number
  damage?: number
  success?: number
  events: ReplayObjectiveEvent[]
  units?: ReplayObjectiveEvent[]
}

export type ReplayShrineCaptureEvent = {
  loop: number
  team: number
  time: number
  team0Score?: number
  team1Score?: number
}

export type ReplayDragonShireShrines = {
  moon: ReplayShrineCaptureEvent[]
  sun: ReplayShrineCaptureEvent[]
}

export type ReplayImmortalResult = {
  winner: number
  loop: number
  duration: number
  time: number
  power: number
  immortalDuration?: number
}

export type ReplayTributeSpawn = {
  loop: number
  x: number
  y: number
  time: number
}

export type ReplaySixTowerEvent = {
  loop: number
  team: number
  kind: 'capture' | 'end'
  time: number
}

export type ReplayTowersFortCapture = {
  loop: number
  ownedBy: number
  time: number
}

export type ReplayBraxisWave = {
  initLoop?: number
  initTime?: number
  startLoop?: number
  startTime?: number
  startScore?: Record<'0' | '1', number>
  endLoop?: number
  endTime?: number
}

export type ReplayObjective = {
  type?: string
  '0'?: ReplayTeamObjective | ReplayObjectiveEvent[]
  '1'?: ReplayTeamObjective | ReplayObjectiveEvent[]
  shrines?: ReplayDragonShireShrines | ReplayShrineCaptureEvent[]
  results?: ReplayImmortalResult[]
  tributes?: ReplayTributeSpawn[]
  sixTowerEvents?: ReplaySixTowerEvent[]
  structures?: ReplayTowersFortCapture[]
  warheads?: ReplayObjectiveEvent[]
  beacons?: ReplayShrineCaptureEvent[]
  waves?: ReplayBraxisWave[]
  events?: ReplayObjectiveEvent[]
}

export type ReplayTeamStructureSummary = {
  lost: number
  destroyed: number
  first: number
}

export type ReplayTeamTotals = {
  DamageTaken: number
  CreepDamage: number
  Healing: number
  HeroDamage: number
  MinionDamage: number
  SelfHealing: number
  SiegeDamage: number
  ProtectionGivenToAllies: number
  TeamfightDamageTaken: number
  TeamfightHealingDone: number
  TeamfightHeroDamage: number
  TimeCCdEnemyHeroes: number
  TimeRootingEnemyHeroes: number
  TimeSpentDead: number
  TimeStunningEnemyHeroes: number
  TimeSilencingEnemyHeroes: number
  avgTimeSpentDead: number
  timeDeadPct: number
}

export type ReplayTeamUptimeEntry = {
  time: number
  heroes: number
}

export type ReplayTeamStats = {
  mercCaptures: number
  mercUptime: number
  mercUptimePercent: number
  structures: Record<string, ReplayTeamStructureSummary>
  KDA: number
  PPK: number
  timeTo10?: number
  timeTo20?: number
  totals: ReplayTeamTotals
  levelAdvTime: number
  maxLevelAdv: number
  avgLevelAdv: number
  levelAdvPct: number
  uptime: ReplayTeamUptimeEntry[]
  uptimeHistogram: Record<string, number>
  wipes: number
  avgHeroesAlive: number
  aces: number
  timeWithHeroAdv: number
  pctWithHeroAdv: number
  passiveXPRate: number
  passiveXPDiff: number
  passiveXPGain: number
}

export type ReplayTeam = {
  ids: string[]
  names: string[]
  heroes: string[]
  tags: number[]
  takedowns: number
  level: number
  stats: ReplayTeamStats
}

export type ReplayMessageAnnouncement = {
  m_abilityLink?: number
  m_announceLink?: number
  m_otherUnitTag?: number
  m_unitTag?: number
  [key: string]: string | number | boolean | null | undefined
}

export type ReplayMessage = {
  type: number
  player: string
  team: number
  recipient: number
  loop: number
  time: number
  text?: string
  point?: ReplayPoint
  announcement?: ReplayMessageAnnouncement
}

export type ReplayLevelAdvInterval = {
  start: number
  end: number
  levelDiff: number
  length: number
}

export type ReplayMatch = {
  version: ReplayVersion
  type: number
  loopLength: number
  filename: string
  mode: number
  map: string
  date: string | Date
  rawDate: number
  playerIDs: string[]
  heroes: string[]
  levelTimes: Record<'0' | '1', Record<string, ReplayLevelTime>>
  region: number
  loopGameStart: number
  length: number
  bans?: ReplayBans
  picks?: ReplayPicks
  XPBreakdown: ReplayXPBreakdownEntry[]
  takedowns: ReplayTakedown[]
  mercs: ReplayMercs
  team0Takedowns: number
  team1Takedowns: number
  structures: Record<string, ReplayStructure>
  objective: ReplayObjective
  teams: Record<'0' | '1', ReplayTeam>
  winner: number
  winningPlayers: string[]
  messages: ReplayMessage[]
  levelAdvTimeline: ReplayLevelAdvInterval[]
  firstPickWin: boolean
  firstObjective: number | null
  firstObjectiveWin: boolean
  firstFort: number | null
  firstKeep: number | null
  firstFortWin: boolean
  firstKeepWin: boolean
}

export type HotSReplayObject = {
  match: ReplayMatch
  players: Record<string, ReplayPlayer>
  status: number
}

/**
 * Complete `ReplayData` type representing a single replay entry
 * (matching `replayData` in `store/replayData.debug.json`).
 */
export type ReplayData = {
  replayObj: HotSReplayObject
  date: string | Date
  type: number
  mode: number
  map: string
  length: number
  winner: number
  team0Takedowns: number
  team1Takedowns: number
  team0Players: string
  team1Players: string
  file: string
}

export type Replay = ReplayData

/**
 * Root wrapper matching `store/replayData.debug.json`.
 */
export type ReplayDataFile = {
  replayData: ReplayData
}

export type ReplayFile = ReplayDataFile

/**
 * Row representation of a replay stored in the PostgreSQL `replays` table.
 * An array of `ReplayData` (or `ReplayDataFile`) maps directly into rows of this table.
 */
export type ReplayRow = {
  id: number
  date: Date | string
  raw_date: string | number
  type: number
  mode: number
  map: string
  length: number
  loop_length: number
  loop_game_start: number
  region: number
  winner: number
  team0_takedowns: number
  team1_takedowns: number
  team0_players: string
  team1_players: string
  file: string
  filename: string
  status: number
  first_pick_win: boolean
  first_objective: number | null
  first_objective_win: boolean
  first_fort: number | null
  first_keep: number | null
  first_fort_win: boolean
  first_keep_win: boolean
  version: ReplayVersion
  player_ids: string[]
  heroes: string[]
  winning_players: string[]
  level_times: Record<'0' | '1', Record<string, ReplayLevelTime>>
  bans: ReplayBans | null
  picks: ReplayPicks | null
  xp_breakdown: ReplayXPBreakdownEntry[]
  takedowns: ReplayTakedown[]
  mercs: ReplayMercs
  structures: Record<string, ReplayStructure>
  objective: ReplayObjective
  teams: Record<'0' | '1', ReplayTeam>
  messages: ReplayMessage[]
  level_adv_timeline: ReplayLevelAdvInterval[]
  players: Record<string, ReplayPlayer>
  created_at: Date | string
}

export type ReplayRowInsert = Omit<ReplayRow, 'id' | 'created_at'>

/**
 * PostgreSQL DDL for the `replays` table and the `mv_replay_player_stats` materialized view.
 * Uses native Postgres scalar types for fast filtering/sorting, `TEXT[]` for array lookups,
 * `JSONB` with GIN indexes for full nested replay data, and an indexed Materialized View
 * for instant player stat aggregations.
 */
export const REPLAYS_TABLE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS replays (
    id SERIAL PRIMARY KEY,
    date TIMESTAMPTZ NOT NULL,
    raw_date BIGINT NOT NULL,
    type INTEGER NOT NULL,
    mode INTEGER NOT NULL,
    map TEXT NOT NULL,
    length DOUBLE PRECISION NOT NULL,
    loop_length INTEGER NOT NULL,
    loop_game_start INTEGER NOT NULL,
    region INTEGER NOT NULL,
    winner INTEGER NOT NULL,
    team0_takedowns INTEGER NOT NULL DEFAULT 0,
    team1_takedowns INTEGER NOT NULL DEFAULT 0,
    team0_players TEXT NOT NULL,
    team1_players TEXT NOT NULL,
    file TEXT NOT NULL,
    filename TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 1,
    first_pick_win BOOLEAN NOT NULL DEFAULT FALSE,
    first_objective INTEGER,
    first_objective_win BOOLEAN NOT NULL DEFAULT FALSE,
    first_fort INTEGER,
    first_keep INTEGER,
    first_fort_win BOOLEAN NOT NULL DEFAULT FALSE,
    first_keep_win BOOLEAN NOT NULL DEFAULT FALSE,
    version JSONB NOT NULL,
    player_ids TEXT[] NOT NULL DEFAULT '{}',
    heroes TEXT[] NOT NULL DEFAULT '{}',
    winning_players TEXT[] NOT NULL DEFAULT '{}',
    level_times JSONB NOT NULL,
    bans JSONB,
    picks JSONB,
    xp_breakdown JSONB NOT NULL DEFAULT '[]'::jsonb,
    takedowns JSONB NOT NULL DEFAULT '[]'::jsonb,
    mercs JSONB NOT NULL,
    structures JSONB NOT NULL DEFAULT '{}'::jsonb,
    objective JSONB NOT NULL,
    teams JSONB NOT NULL,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    level_adv_timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    players JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_replays_map_date_loop UNIQUE (map, date, loop_length)
  );

  CREATE INDEX IF NOT EXISTS idx_replays_date
    ON replays (date DESC);

  CREATE INDEX IF NOT EXISTS idx_replays_map_date_type
    ON replays (map, date DESC, type);

  CREATE INDEX IF NOT EXISTS idx_replays_file
    ON replays (file);

  CREATE INDEX IF NOT EXISTS idx_replays_player_ids_gin
    ON replays USING GIN (player_ids);

  CREATE INDEX IF NOT EXISTS idx_replays_heroes_gin
    ON replays USING GIN (heroes);

  CREATE INDEX IF NOT EXISTS idx_replays_players_gin
    ON replays USING GIN (players);
`

/**
 * Converts a `ReplayData` object into a `replays` table row payload.
 */
export function toReplayRow(replayData: ReplayData): ReplayRowInsert {
  const { replayObj } = replayData
  const { match, players, status } = replayObj

  return {
    date: replayData.date,
    raw_date: match.rawDate,
    type: replayData.type,
    mode: replayData.mode,
    map: replayData.map,
    length: replayData.length,
    loop_length: match.loopLength,
    loop_game_start: match.loopGameStart,
    region: match.region,
    winner: replayData.winner,
    team0_takedowns: replayData.team0Takedowns,
    team1_takedowns: replayData.team1Takedowns,
    team0_players: replayData.team0Players,
    team1_players: replayData.team1Players,
    file: replayData.file,
    filename: match.filename,
    status,
    first_pick_win: match.firstPickWin,
    first_objective: match.firstObjective,
    first_objective_win: match.firstObjectiveWin,
    first_fort: match.firstFort,
    first_keep: match.firstKeep,
    first_fort_win: match.firstFortWin,
    first_keep_win: match.firstKeepWin,
    version: match.version,
    player_ids: match.playerIDs,
    heroes: match.heroes,
    winning_players: match.winningPlayers,
    level_times: match.levelTimes,
    bans: match.bans ?? null,
    picks: match.picks ?? null,
    xp_breakdown: match.XPBreakdown,
    takedowns: match.takedowns,
    mercs: match.mercs,
    structures: match.structures,
    objective: match.objective,
    teams: match.teams,
    messages: match.messages,
    level_adv_timeline: match.levelAdvTimeline,
    players,
  }
}

/**
 * Reconstructs the complete `ReplayData` object from a `ReplayRow` database record.
 */
export function fromReplayRow(row: ReplayRow): ReplayData {
  const dateStr = row.date instanceof Date ? row.date.toISOString() : row.date
  const rawDateNum = typeof row.raw_date === 'string' ? Number(row.raw_date) : row.raw_date

  return {
    replayObj: {
      match: {
        version: row.version,
        type: row.type,
        loopLength: row.loop_length,
        filename: row.filename,
        mode: row.mode,
        map: row.map,
        date: dateStr,
        rawDate: rawDateNum,
        playerIDs: row.player_ids,
        heroes: row.heroes,
        levelTimes: row.level_times,
        region: row.region,
        loopGameStart: row.loop_game_start,
        length: row.length,
        ...(row.bans ? { bans: row.bans } : {}),
        ...(row.picks ? { picks: row.picks } : {}),
        XPBreakdown: row.xp_breakdown,
        takedowns: row.takedowns,
        mercs: row.mercs,
        team0Takedowns: row.team0_takedowns,
        team1Takedowns: row.team1_takedowns,
        structures: row.structures,
        objective: row.objective,
        teams: row.teams,
        winner: row.winner,
        winningPlayers: row.winning_players,
        messages: row.messages,
        levelAdvTimeline: row.level_adv_timeline,
        firstPickWin: row.first_pick_win,
        firstObjective: row.first_objective,
        firstObjectiveWin: row.first_objective_win,
        firstFort: row.first_fort,
        firstKeep: row.first_keep,
        firstFortWin: row.first_fort_win,
        firstKeepWin: row.first_keep_win,
      },
      players: row.players,
      status: row.status,
    },
    date: dateStr,
    type: row.type,
    mode: row.mode,
    map: row.map,
    length: row.length,
    winner: row.winner,
    team0Takedowns: row.team0_takedowns,
    team1Takedowns: row.team1_takedowns,
    team0Players: row.team0_players,
    team1Players: row.team1_players,
    file: row.file,
  }
}
