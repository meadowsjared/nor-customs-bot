import type { ReplayTakedown, ReplayTeam, ReplayTimedLocation, ReplayVersion } from './replay'

export type { DraftCoinState } from './settings'

/**
 * Player-specific TypeScript definitions for Heroes of the Storm replay data
 * and aggregated player statistics in PostgreSQL.
 */

export type ReplayBStepEvent = {
  start: number
  stop: number
  duration: number
  kills: number
  deaths: number
}

export type ReplayTauntDanceEvent = {
  loop: number
  time: number
  kills: number
  deaths: number
}

export type ReplayLootEmoteEvent = {
  loop: number
  time: number
  kills: number
  deaths: number
  kind: string
  x: number
  y: number
}

export type ReplayGlobeEvent = {
  loop: number
  time: number
}

export type ReplayPlayerGlobes = {
  count: number
  events: ReplayGlobeEvent[]
}

export type ReplayUnitLife = {
  born: number
  died?: number
  duration: number
  locations: ReplayTimedLocation[]
}

export type ReplayPlayerUnit = {
  name: string
  lives: ReplayUnitLife[]
}

export type ReplayPlayerTalents = {
  Tier1Choice?: string
  Tier2Choice?: string
  Tier3Choice?: string
  Tier4Choice?: string
  Tier5Choice?: string
  Tier6Choice?: string
  Tier7Choice?: string
}

export type ReplayPlayerGameStats = {
  awards: string[]
  Takedowns: number
  Deaths: number
  TownKills: number
  SoloKill: number
  Assists: number
  MetaExperience: number
  Level: number
  TeamTakedowns: number
  ExperienceContribution: number
  Healing: number
  SiegeDamage: number
  StructureDamage: number
  MinionDamage: number
  HeroDamage: number
  MercCampCaptures: number
  WatchTowerCaptures: number
  SelfHealing: number
  TimeSpentDead: number
  TimeCCdEnemyHeroes: number
  CreepDamage: number
  SummonDamage: number
  Tier1Talent: number
  Tier2Talent: number
  Tier3Talent: number
  Tier4Talent: number
  Tier5Talent: number
  Tier6Talent: number
  Tier7Talent: number
  DamageTaken: number
  DamageSoaked: number
  Role: number
  KilledTreasureGoblin: number
  GameScore: number
  HighestKillStreak: number
  TeamLevel: number
  ProtectionGivenToAllies: number
  TimeSilencingEnemyHeroes: number
  TimeRootingEnemyHeroes: number
  TimeStunningEnemyHeroes: number
  ClutchHealsPerformed: number
  EscapesPerformed: number
  VengeancesPerformed: number
  TeamfightEscapesPerformed: number
  OutnumberedDeaths: number
  TeamfightHealingDone: number
  TeamfightDamageTaken: number
  TeamfightHeroDamage: number
  OnFireTimeOnFire: number
  LunarNewYearSuccesfulArtifactTurnIns: number
  TimeOnPoint: number
  CageUnlocksInterrupted: number
  GardenSeedsCollectedByPlayer: number
  TeamWinsDiablo: number
  TeamWinsFemale: number
  TeamWinsMale: number
  TeamWinsStarCraft: number
  TeamWinsWarcraft: number
  WinsWarrior: number
  WinsAssassin: number
  WinsSupport: number
  WinsSpecialist: number
  WinsStarCraft: number
  WinsDiablo: number
  WinsWarcraft: number
  WinsMale: number
  WinsFemale: number
  PlaysStarCraft: number
  PlaysDiablo: number
  PlaysOverwatch: number
  PlaysWarCraft: number
  PlaysNexus: number
  PlaysOverwatchOrNexus: number
  PlaysWarrior: number
  PlaysAssassin: number
  PlaysSupport: number
  PlaysSpecialist: number
  PlaysMale: number
  PlaysFemale: number
  LunarNewYearEventCompleted: number
  StarcraftDailyEventCompleted: number
  StarcraftPiecesCollected: number
  LunarNewYearRoosterEventCompleted: number
  TouchByBlightPlague: number
  PachimariMania: number
  LessThan4Deaths: number
  LessThan3TownStructuresLost: number
  PhysicalDamage: number
  SpellDamage: number
  Multikill: number
  MinionKills: number
  RegenGlobes: number
  DragonNumberOfDragonCaptures?: number
  DragonShrinesCaptured?: number
  AltarDamageDone?: number
  DamageDoneToImmortal?: number
  BlackheartDoubloonsCollected?: number
  BlackheartDoubloonsTurnedIn?: number
  MinesSkullsCollected?: number
  DamageDoneToShrineMinions?: number
  GardensPlantDamage?: number
  GardensSeedsCollected?: number
  GemsTurnedIn?: number
  NukeDamageDone?: number
  CurseDamageDone?: number
  TimeInTemple?: number
  DamageDoneToZerg?: number
  KDA: number
  damageDonePerDeath: number
  damageTakenPerDeath: number
  healingDonePerDeath: number
  DPM: number
  HPM: number
  XPM: number
  KillParticipation: number
  length: number
  passiveXPRate: number
  passiveXPDiff: number
  passiveXPGain: number
  aces: number
  wipes: number
  timeWithHeroAdv: number
  pctWithHeroAdv: number
  levelAdvTime: number
  levelAdvPct: number
}

export type ReplayPlayer = {
  hero: string
  name: string
  uuid: number
  region: number
  realm: number
  ToonHandle: string
  tag: number
  team: number
  gameStats: ReplayPlayerGameStats
  talents: ReplayPlayerTalents
  takedowns: ReplayTakedown[]
  deaths: ReplayTakedown[]
  bsteps: ReplayBStepEvent[]
  voiceLines: ReplayLootEmoteEvent[]
  sprays: ReplayLootEmoteEvent[]
  taunts: ReplayTauntDanceEvent[]
  dances: ReplayTauntDanceEvent[]
  units: Record<string, ReplayPlayerUnit>
  votes: number
  rawDate: number
  map: string
  date: string | Date
  build: number
  mode: number
  version: ReplayVersion
  globes: ReplayPlayerGlobes
  heroLevel: number
  skin: string
  announcer: string
  mount: string
  silenced: boolean
  voiceSilenced?: boolean
  length: number
  turn?: number
  win: boolean
  internalHeroName: string
  with: ReplayTeam
  against: ReplayTeam
  lifespan: number[][]
}

/**
 * Row representation of the `mv_replay_player_stats` materialized view,
 * flattening each player's per-match performance for sub-millisecond aggregation.
 */
export type ReplayPlayerStatRow = {
  replay_id: number
  date: Date | string
  map: string
  type: number
  mode: number
  length: number
  toon_handle: string
  hots_battle_tag: string
  player_name: string
  uuid: string | number
  tag: number
  hero: string
  role: number
  team: number
  win: boolean
  votes: number
  takedowns: number
  solo_kills: number
  assists: number
  deaths: number
  highest_kill_streak: number
  multikill: number
  outnumbered_deaths: number
  hero_damage: number
  physical_damage: number
  spell_damage: number
  siege_damage: number
  structure_damage: number
  minion_damage: number
  creep_damage: number
  summon_damage: number
  healing: number
  self_healing: number
  protection_given: number
  clutch_heals: number
  damage_taken: number
  damage_soaked: number
  escapes: number
  vengeances: number
  xp_contribution: number
  minion_kills: number
  regen_globes: number
  merc_camp_captures: number
  watch_tower_captures: number
  time_spent_dead: number
  time_on_fire: number
  time_ccd_enemy_heroes: number
  time_stunning_enemy_heroes: number
  time_rooting_enemy_heroes: number
  time_silencing_enemy_heroes: number
  teamfight_hero_damage: number
  teamfight_damage_taken: number
  teamfight_healing_done: number
  teamfight_escapes: number
  kda: number
  dpm: number
  hpm: number
  xpm: number
  kill_participation: number
  bsteps_count: number
  bstep_td: number
  bstep_deaths: number
  sprays_count: number
  spray_td: number
  spray_deaths: number
  taunts_count: number
  taunt_td: number
  taunt_deaths: number
  dances_count: number
  dance_td: number
  dance_deaths: number
  voice_lines_count: number
}

/**
 * Aggregated player statistics across matches.
 */
export type PlayerAggregatedStats = {
  toon_handle: string
  player_name: string
  games_played: number
  wins: number
  losses: number
  win_rate_pct: number
  total_takedowns: number
  total_solo_kills: number
  total_assists: number
  total_deaths: number
  overall_kda: number
  avg_takedowns: number
  avg_deaths: number
  avg_assists: number
  avg_hero_damage: number
  avg_siege_damage: number
  avg_healing: number
  avg_damage_taken: number
  avg_damage_soaked: number
  avg_xp_contribution: number
  avg_dpm: number
  avg_hpm: number
  avg_xpm: number
  avg_kill_participation_pct: number
  avg_time_spent_dead: number
  total_votes: number
  total_bsteps: number
  total_sprays: number
  total_taunts: number
  total_dances: number
  total_voice_lines: number
  recent_10_win_rate_pct: number
  recent_10_avg_dpm: number
}

export type PlayerStatsFilter = {
  toonHandle?: string
  playerName?: string
  hero?: string
  map?: string
}

/**
 * PostgreSQL DDL for the `mv_replay_player_stats` materialized view and its indexes.
 */
export const PLAYER_STATS_VIEW_SCHEMA_SQL = `
  CREATE MATERIALIZED VIEW IF NOT EXISTS mv_replay_player_stats AS
  SELECT
    r.id AS replay_id,
    r.date,
    r.map,
    r.type,
    r.mode,
    r.length,
    p.key AS toon_handle,
    (p.value->>'name') || '#' || (p.value->>'tag') AS hots_battle_tag,
    p.value->>'name' AS player_name,
    (p.value->>'uuid')::bigint AS uuid,
    (p.value->>'tag')::int AS tag,
    p.value->>'hero' AS hero,
    COALESCE((p.value->'gameStats'->>'Role')::int, 0) AS role,
    (p.value->>'team')::int AS team,
    (p.value->>'win')::boolean AS win,
    COALESCE((p.value->>'votes')::int, 0) AS votes,
    COALESCE((p.value->'gameStats'->>'Takedowns')::int, 0) AS takedowns,
    COALESCE((p.value->'gameStats'->>'SoloKill')::int, 0) AS solo_kills,
    COALESCE((p.value->'gameStats'->>'Assists')::int, 0) AS assists,
    COALESCE((p.value->'gameStats'->>'Deaths')::int, 0) AS deaths,
    COALESCE((p.value->'gameStats'->>'HighestKillStreak')::int, 0) AS highest_kill_streak,
    COALESCE((p.value->'gameStats'->>'Multikill')::int, 0) AS multikill,
    COALESCE((p.value->'gameStats'->>'OutnumberedDeaths')::int, 0) AS outnumbered_deaths,
    COALESCE((p.value->'gameStats'->>'HeroDamage')::double precision, 0) AS hero_damage,
    COALESCE((p.value->'gameStats'->>'PhysicalDamage')::double precision, 0) AS physical_damage,
    COALESCE((p.value->'gameStats'->>'SpellDamage')::double precision, 0) AS spell_damage,
    COALESCE((p.value->'gameStats'->>'SiegeDamage')::double precision, 0) AS siege_damage,
    COALESCE((p.value->'gameStats'->>'StructureDamage')::double precision, 0) AS structure_damage,
    COALESCE((p.value->'gameStats'->>'MinionDamage')::double precision, 0) AS minion_damage,
    COALESCE((p.value->'gameStats'->>'CreepDamage')::double precision, 0) AS creep_damage,
    COALESCE((p.value->'gameStats'->>'SummonDamage')::double precision, 0) AS summon_damage,
    COALESCE((p.value->'gameStats'->>'Healing')::double precision, 0) AS healing,
    COALESCE((p.value->'gameStats'->>'SelfHealing')::double precision, 0) AS self_healing,
    COALESCE((p.value->'gameStats'->>'ProtectionGivenToAllies')::double precision, 0) AS protection_given,
    COALESCE((p.value->'gameStats'->>'ClutchHealsPerformed')::int, 0) AS clutch_heals,
    COALESCE((p.value->'gameStats'->>'DamageTaken')::double precision, 0) AS damage_taken,
    COALESCE((p.value->'gameStats'->>'DamageSoaked')::double precision, 0) AS damage_soaked,
    COALESCE((p.value->'gameStats'->>'EscapesPerformed')::int, 0) AS escapes,
    COALESCE((p.value->'gameStats'->>'VengeancesPerformed')::int, 0) AS vengeances,
    COALESCE((p.value->'gameStats'->>'ExperienceContribution')::double precision, 0) AS xp_contribution,
    COALESCE((p.value->'gameStats'->>'MinionKills')::int, 0) AS minion_kills,
    COALESCE((p.value->'gameStats'->>'RegenGlobes')::int, 0) AS regen_globes,
    COALESCE((p.value->'gameStats'->>'MercCampCaptures')::int, 0) AS merc_camp_captures,
    COALESCE((p.value->'gameStats'->>'WatchTowerCaptures')::int, 0) AS watch_tower_captures,
    COALESCE((p.value->'gameStats'->>'TimeSpentDead')::double precision, 0) AS time_spent_dead,
    COALESCE((p.value->'gameStats'->>'OnFireTimeOnFire')::double precision, 0) AS time_on_fire,
    COALESCE((p.value->'gameStats'->>'TimeCCdEnemyHeroes')::double precision, 0) AS time_ccd_enemy_heroes,
    COALESCE((p.value->'gameStats'->>'TimeStunningEnemyHeroes')::double precision, 0) AS time_stunning_enemy_heroes,
    COALESCE((p.value->'gameStats'->>'TimeRootingEnemyHeroes')::double precision, 0) AS time_rooting_enemy_heroes,
    COALESCE((p.value->'gameStats'->>'TimeSilencingEnemyHeroes')::double precision, 0) AS time_silencing_enemy_heroes,
    COALESCE((p.value->'gameStats'->>'TeamfightHeroDamage')::double precision, 0) AS teamfight_hero_damage,
    COALESCE((p.value->'gameStats'->>'TeamfightDamageTaken')::double precision, 0) AS teamfight_damage_taken,
    COALESCE((p.value->'gameStats'->>'TeamfightHealingDone')::double precision, 0) AS teamfight_healing_done,
    COALESCE((p.value->'gameStats'->>'TeamfightEscapesPerformed')::int, 0) AS teamfight_escapes,
    COALESCE((p.value->'gameStats'->>'KDA')::double precision, 0) AS kda,
    COALESCE((p.value->'gameStats'->>'DPM')::double precision, 0) AS dpm,
    COALESCE((p.value->'gameStats'->>'HPM')::double precision, 0) AS hpm,
    COALESCE((p.value->'gameStats'->>'XPM')::double precision, 0) AS xpm,
    COALESCE((p.value->'gameStats'->>'KillParticipation')::double precision, 0) AS kill_participation,
    COALESCE(jsonb_array_length(p.value->'bsteps'), 0) AS bsteps_count,
    COALESCE((SELECT SUM((elem->>'kills')::int) FROM jsonb_array_elements(COALESCE(p.value->'bsteps', '[]'::jsonb)) AS elem), 0)::int AS bstep_td,
    COALESCE((SELECT SUM((elem->>'deaths')::int) FROM jsonb_array_elements(COALESCE(p.value->'bsteps', '[]'::jsonb)) AS elem), 0)::int AS bstep_deaths,
    COALESCE(jsonb_array_length(p.value->'sprays'), 0) AS sprays_count,
    COALESCE((SELECT SUM((elem->>'kills')::int) FROM jsonb_array_elements(COALESCE(p.value->'sprays', '[]'::jsonb)) AS elem), 0)::int AS spray_td,
    COALESCE((SELECT SUM((elem->>'deaths')::int) FROM jsonb_array_elements(COALESCE(p.value->'sprays', '[]'::jsonb)) AS elem), 0)::int AS spray_deaths,
    COALESCE(jsonb_array_length(p.value->'taunts'), 0) AS taunts_count,
    COALESCE((SELECT SUM((elem->>'kills')::int) FROM jsonb_array_elements(COALESCE(p.value->'taunts', '[]'::jsonb)) AS elem), 0)::int AS taunt_td,
    COALESCE((SELECT SUM((elem->>'deaths')::int) FROM jsonb_array_elements(COALESCE(p.value->'taunts', '[]'::jsonb)) AS elem), 0)::int AS taunt_deaths,
    COALESCE(jsonb_array_length(p.value->'dances'), 0) AS dances_count,
    COALESCE((SELECT SUM((elem->>'kills')::int) FROM jsonb_array_elements(COALESCE(p.value->'dances', '[]'::jsonb)) AS elem), 0)::int AS dance_td,
    COALESCE((SELECT SUM((elem->>'deaths')::int) FROM jsonb_array_elements(COALESCE(p.value->'dances', '[]'::jsonb)) AS elem), 0)::int AS dance_deaths,
    COALESCE(jsonb_array_length(p.value->'voiceLines'), 0) AS voice_lines_count
  FROM replays r
  CROSS JOIN LATERAL jsonb_each(r.players) AS p(key, value);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_replay_player_stats_replay_player
    ON mv_replay_player_stats (replay_id, toon_handle);

  CREATE INDEX IF NOT EXISTS idx_mv_replay_player_stats_battle_tag
    ON mv_replay_player_stats (LOWER(hots_battle_tag));

  CREATE INDEX IF NOT EXISTS idx_mv_replay_player_stats_toon_date
    ON mv_replay_player_stats (toon_handle, date DESC);

  CREATE INDEX IF NOT EXISTS idx_mv_replay_player_stats_name
    ON mv_replay_player_stats (player_name);

  CREATE INDEX IF NOT EXISTS idx_mv_replay_player_stats_hero
    ON mv_replay_player_stats (hero, toon_handle);

  CREATE INDEX IF NOT EXISTS idx_mv_replay_player_stats_map
    ON mv_replay_player_stats (map, toon_handle);
`

/**
 * Discord Player, Linked HotS Account, Lobby, and Account Substitution types.
 */

export enum PlayerIdPrefix {
  HOTS_ROW_ID = 'hotsRowId:',
  TAG = 'tag:',
}

export type DiscordUserNames = {
  discordName: string
  discordDisplayName: string
  discordGlobalName: string
}

export type HotsAccount = {
  id: number
  hotsBattleTag: string
  isPrimary: boolean
  realIdName?: string | null
  ownerDiscordId?: string | null
  hpQmMMR: number | null
  hpSlMMR: number | null
  hpArMMR: number | null
  hpQmGames: number | null
  hpSlGames: number | null
  hpArGames: number | null
}

export type HotsAccountRow = {
  id: number
  discord_id: string | null
  hots_battle_tag: string
  is_primary: boolean | number
  real_id_name: string | null
  owner_discord_id?: string | null
  hp_region?: number | null
  hp_blizz_id?: number | string | null
  hp_qm_mmr?: number | null
  hp_sl_mmr?: number | null
  hp_ar_mmr?: number | null
  hp_qm_games?: number | null
  hp_sl_games?: number | null
  hp_ar_games?: number | null
  HP_Region?: number | null
  HP_Blizz_ID?: number | string | null
  HP_QM_MMR?: number | null
  HP_SL_MMR?: number | null
  HP_AR_MMR?: number | null
  HP_QM_Games?: number | null
  HP_SL_Games?: number | null
  HP_AR_Games?: number | null
}

export type Usernames = DiscordUserNames & {
  accounts?: HotsAccount[]
}

export type UsernamesWithAccounts = DiscordUserNames & {
  accounts: HotsAccount[]
}

export type Player = {
  discordId: string | null
  usernames: Usernames
  role?: string
  active: boolean
  team: number | null
  lobbyRank: number
  draftOrder: number
  adjustment: number | null
  mmr: number | null
  lastActive: Date
}

export type PlayerWithAccounts = Omit<Player, 'usernames'> & {
  usernames: UsernamesWithAccounts
}

export type FlatPlayer = {
  discord_id: string | null
  hots_battle_tag: string
  discord_name: string
  discord_global_name: string
  discord_display_name: string
  role: string
  active: boolean | number
  team: number | null
  adjustment: number | null
  lobby_rank: number | null
  draft_order: number | null
  last_active: string | Date
}

export type AccountSubstitution = {
  id: number
  guildId: string
  hotsBattleTag: string
  originalDiscordId: string
  substituteDiscordId: string
  replayId: number | null
  date: string
  isActive: boolean
}

export type AccountSubstitutionRow = {
  id: number
  guild_id: string
  hots_battle_tag: string
  original_discord_id: string
  substitute_discord_id: string
  replay_id: number | null
  date: string | Date
  is_active: boolean | number
}

export type RegisteredPlayerAccount = {
  id: number
  discordId: string | null
  hotsBattleTag: string
  discordDisplayName: string
  discordName?: string
  discordGlobalName?: string
  realIdName: string | null
  ownerDiscordId?: string | null
}

export type HotSAccountMatch = {
  player: Player
  matchedAccounts: HotsAccount[]
}

export type FormatPlayerDisplayOptions = {
  includeBattleTag?: boolean
  includeRole?: boolean
}

export type ResolvedHotsAccount = {
  hotsAccountId: number
  ownerDiscordId: string | null
  discordId: string | null
  battleTag: string
}

export const PLAYERS_TABLES_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS players (
    discord_id TEXT PRIMARY KEY,
    discord_name TEXT NOT NULL,
    discord_global_name TEXT NOT NULL,
    discord_display_name TEXT NOT NULL,
    role TEXT,
    adjustment INTEGER,
    last_active TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS hots_accounts (
    id SERIAL PRIMARY KEY,
    discord_id TEXT REFERENCES players(discord_id) ON DELETE SET NULL,
    hots_battle_tag TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    real_id_name TEXT,
    owner_discord_id TEXT,
    hp_region INTEGER,
    hp_blizz_id TEXT,
    hp_qm_mmr INTEGER,
    hp_sl_mmr INTEGER,
    hp_ar_mmr INTEGER,
    hp_qm_games INTEGER,
    hp_sl_games INTEGER,
    hp_ar_games INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_hots_accounts_discord_id
    ON hots_accounts (discord_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_hots_battle_tag
    ON hots_accounts (discord_id, LOWER(hots_battle_tag));

  CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_owner_battle_tag
    ON hots_accounts (LOWER(hots_battle_tag))
    WHERE owner_discord_id IS NULL;

  CREATE TABLE IF NOT EXISTS lobby_players (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL DEFAULT 'global',
    discord_id TEXT REFERENCES players(discord_id) ON DELETE CASCADE,
    hots_account_id INTEGER REFERENCES hots_accounts(id) ON DELETE CASCADE,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    team INTEGER CHECK (team IN (1, 2) OR team IS NULL),
    lobby_rank INTEGER,
    draft_order INTEGER,
    role TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_discord
    ON lobby_players (guild_id, discord_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_account
    ON lobby_players (guild_id, hots_account_id);

  CREATE TABLE IF NOT EXISTS account_substitutions (
    id SERIAL PRIMARY KEY,
    guild_id TEXT NOT NULL,
    hots_battle_tag TEXT NOT NULL,
    original_discord_id TEXT NOT NULL,
    substitute_discord_id TEXT NOT NULL,
    replay_id INTEGER,
    date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
  );

  CREATE INDEX IF NOT EXISTS idx_account_substitutions_lookup
    ON account_substitutions (guild_id, LOWER(hots_battle_tag), is_active);
`


