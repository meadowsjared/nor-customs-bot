import Database from 'better-sqlite3';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = new Database('./store/nor_customs.db');
import { ColumnDefinition, generateCreateTableSQL, InterfaceFromSchema, SQLiteColumnType } from '../utils/sql';

export const HOTS_REPLAYS_MATCH_COLUMNS = [
  {
    name: 'id',
    dbType: SQLiteColumnType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    skipImport: true,
  },
  { name: 'type', dbType: SQLiteColumnType.INTEGER },
  { name: 'loopLength', dbType: SQLiteColumnType.INTEGER },
  { name: 'filename', dbType: SQLiteColumnType.TEXT },
  { name: 'mode', dbType: SQLiteColumnType.INTEGER },
  { name: 'map', dbType: SQLiteColumnType.TEXT },
  { name: 'date', dbType: SQLiteColumnType.TEXT },
  { name: 'rawDate', dbType: SQLiteColumnType.INTEGER },
  { name: 'build', dbType: SQLiteColumnType.INTEGER },
  { name: 'region', dbType: SQLiteColumnType.INTEGER },
  { name: 'loopGameStart', dbType: SQLiteColumnType.INTEGER },
  { name: 'length', dbType: SQLiteColumnType.REAL }, // in seconds
  { name: 'team0Takedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'team1Takedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'winner', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstPick', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstPickWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstObjective', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstObjectiveWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstFort', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstKeep', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstFortWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstKeepWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'team0Ban1', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Ban2', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Ban3', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Ban1', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Ban2', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Ban3', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Pick1', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Pick2', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Pick3', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Pick4', dbType: SQLiteColumnType.TEXT },
  { name: 'team0Pick5', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Pick1', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Pick2', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Pick3', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Pick4', dbType: SQLiteColumnType.TEXT },
  { name: 'team1Pick5', dbType: SQLiteColumnType.TEXT },
] as const satisfies readonly ColumnDefinition[];

export const HOTS_REPLAY_GAME_STATS_COLUMNS = [
  {
    name: 'id',
    dbType: SQLiteColumnType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    skipImport: true,
  },
  { name: 'replay_id', dbType: SQLiteColumnType.INTEGER },
  { name: 'hots_account_id', dbType: SQLiteColumnType.INTEGER },
  { name: 'discord_id', dbType: SQLiteColumnType.TEXT },
  { name: 'hots_battle_tag', dbType: SQLiteColumnType.TEXT },
  { name: 'ToonHandle', dbType: SQLiteColumnType.TEXT },
  { name: 'name', dbType: SQLiteColumnType.TEXT },
  { name: 'tag', dbType: SQLiteColumnType.INTEGER },
  { name: 'region', dbType: SQLiteColumnType.INTEGER },
  { name: 'realm', dbType: SQLiteColumnType.INTEGER },
  { name: 'hero', dbType: SQLiteColumnType.TEXT },
  { name: 'internalHeroName', dbType: SQLiteColumnType.TEXT },
  { name: 'team', dbType: SQLiteColumnType.INTEGER },
  { name: 'win', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'heroLevel', dbType: SQLiteColumnType.INTEGER },
  { name: 'skin', dbType: SQLiteColumnType.TEXT },
  { name: 'mount', dbType: SQLiteColumnType.TEXT },
  { name: 'announcer', dbType: SQLiteColumnType.TEXT },
  { name: 'silenced', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'voiceSilenced', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'Tier1Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier2Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier3Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier4Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier5Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier6Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'Tier7Choice', dbType: SQLiteColumnType.TEXT },
  { name: 'awards', dbType: SQLiteColumnType.TEXT },
  { name: 'votes', dbType: SQLiteColumnType.INTEGER },
  { name: 'sprays', dbType: SQLiteColumnType.INTEGER },
  { name: 'sprayTD', dbType: SQLiteColumnType.INTEGER },
  { name: 'sprayDeaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'bsteps', dbType: SQLiteColumnType.INTEGER },
  { name: 'bstepTD', dbType: SQLiteColumnType.INTEGER },
  { name: 'bstepDeaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'taunts', dbType: SQLiteColumnType.INTEGER },
  { name: 'tauntTD', dbType: SQLiteColumnType.INTEGER },
  { name: 'tauntDeaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'dances', dbType: SQLiteColumnType.INTEGER },
  { name: 'danceTD', dbType: SQLiteColumnType.INTEGER },
  { name: 'danceDeaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'voiceLines', dbType: SQLiteColumnType.INTEGER },
  { name: 'DDRatio', dbType: SQLiteColumnType.REAL },
  { name: 'DPct', dbType: SQLiteColumnType.REAL },
  { name: 'DTPct', dbType: SQLiteColumnType.REAL },
  { name: 'HPct', dbType: SQLiteColumnType.REAL },
  { name: 'SoftCCPct', dbType: SQLiteColumnType.REAL },
  { name: 'HardCCPct', dbType: SQLiteColumnType.REAL },
  { name: 'timeDeadPct', dbType: SQLiteColumnType.REAL },
  { name: 'Takedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'Deaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'TownKills', dbType: SQLiteColumnType.INTEGER },
  { name: 'SoloKill', dbType: SQLiteColumnType.INTEGER },
  { name: 'Assists', dbType: SQLiteColumnType.INTEGER },
  { name: 'MetaExperience', dbType: SQLiteColumnType.INTEGER },
  { name: 'Level', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamTakedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'ExperienceContribution', dbType: SQLiteColumnType.INTEGER },
  { name: 'Healing', dbType: SQLiteColumnType.INTEGER },
  { name: 'SiegeDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'StructureDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'MinionDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'HeroDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'MercCampCaptures', dbType: SQLiteColumnType.INTEGER },
  { name: 'WatchTowerCaptures', dbType: SQLiteColumnType.INTEGER },
  { name: 'SelfHealing', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeSpentDead', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeCCdEnemyHeroes', dbType: SQLiteColumnType.INTEGER },
  { name: 'CreepDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'SummonDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier1Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier2Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier3Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier4Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier5Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier6Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'Tier7Talent', dbType: SQLiteColumnType.INTEGER },
  { name: 'DamageTaken', dbType: SQLiteColumnType.INTEGER },
  { name: 'DamageSoaked', dbType: SQLiteColumnType.INTEGER },
  { name: 'Role', dbType: SQLiteColumnType.INTEGER },
  { name: 'KilledTreasureGoblin', dbType: SQLiteColumnType.INTEGER },
  { name: 'GameScore', dbType: SQLiteColumnType.INTEGER },
  { name: 'HighestKillStreak', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamLevel', dbType: SQLiteColumnType.INTEGER },
  { name: 'ProtectionGivenToAllies', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeSilencingEnemyHeroes', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeRootingEnemyHeroes', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeStunningEnemyHeroes', dbType: SQLiteColumnType.INTEGER },
  { name: 'ClutchHealsPerformed', dbType: SQLiteColumnType.INTEGER },
  { name: 'EscapesPerformed', dbType: SQLiteColumnType.INTEGER },
  { name: 'VengeancesPerformed', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamfightEscapesPerformed', dbType: SQLiteColumnType.INTEGER },
  { name: 'OutnumberedDeaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamfightHealingDone', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamfightDamageTaken', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamfightHeroDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'OnFireTimeOnFire', dbType: SQLiteColumnType.INTEGER },
  { name: 'LunarNewYearSuccesfulArtifactTurnIns', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeOnPoint', dbType: SQLiteColumnType.INTEGER },
  { name: 'CageUnlocksInterrupted', dbType: SQLiteColumnType.INTEGER },
  { name: 'GardenSeedsCollectedByPlayer', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamWinsDiablo', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamWinsFemale', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamWinsMale', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamWinsStarCraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'TeamWinsWarcraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsWarrior', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsAssassin', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsSupport', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsSpecialist', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsStarCraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsDiablo', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsWarcraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsMale', dbType: SQLiteColumnType.INTEGER },
  { name: 'WinsFemale', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysStarCraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysDiablo', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysOverwatch', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysWarCraft', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysNexus', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysOverwatchOrNexus', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysWarrior', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysAssassin', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysSupport', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysSpecialist', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysMale', dbType: SQLiteColumnType.INTEGER },
  { name: 'PlaysFemale', dbType: SQLiteColumnType.INTEGER },
  { name: 'LunarNewYearEventCompleted', dbType: SQLiteColumnType.INTEGER },
  { name: 'StarcraftDailyEventCompleted', dbType: SQLiteColumnType.INTEGER },
  { name: 'StarcraftPiecesCollected', dbType: SQLiteColumnType.INTEGER },
  { name: 'LunarNewYearRoosterEventCompleted', dbType: SQLiteColumnType.INTEGER },
  { name: 'TouchByBlightPlague', dbType: SQLiteColumnType.INTEGER },
  { name: 'PachimariMania', dbType: SQLiteColumnType.INTEGER },
  { name: 'LessThan4Deaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'LessThan3TownStructuresLost', dbType: SQLiteColumnType.INTEGER },
  { name: 'PhysicalDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'SpellDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'Multikill', dbType: SQLiteColumnType.INTEGER },
  { name: 'MinionKills', dbType: SQLiteColumnType.INTEGER },
  { name: 'RegenGlobes', dbType: SQLiteColumnType.INTEGER },
  { name: 'DragonNumberOfDragonCaptures', dbType: SQLiteColumnType.INTEGER },
  { name: 'DragonShrinesCaptured', dbType: SQLiteColumnType.INTEGER },
  { name: 'KDA', dbType: SQLiteColumnType.REAL },
  { name: 'damageDonePerDeath', dbType: SQLiteColumnType.REAL },
  { name: 'damageTakenPerDeath', dbType: SQLiteColumnType.REAL },
  { name: 'healingDonePerDeath', dbType: SQLiteColumnType.REAL },
  { name: 'DPM', dbType: SQLiteColumnType.REAL },
  { name: 'HPM', dbType: SQLiteColumnType.REAL },
  { name: 'XPM', dbType: SQLiteColumnType.REAL },
  { name: 'KillParticipation', dbType: SQLiteColumnType.REAL },
  { name: 'length', dbType: SQLiteColumnType.REAL },
  { name: 'passiveXPRate', dbType: SQLiteColumnType.REAL },
  { name: 'passiveXPDiff', dbType: SQLiteColumnType.REAL },
  { name: 'passiveXPGain', dbType: SQLiteColumnType.REAL },
  { name: 'aces', dbType: SQLiteColumnType.INTEGER },
  { name: 'wipes', dbType: SQLiteColumnType.INTEGER },
  { name: 'timeWithHeroAdv', dbType: SQLiteColumnType.REAL },
  { name: 'pctWithHeroAdv', dbType: SQLiteColumnType.REAL },
  { name: 'levelAdvTime', dbType: SQLiteColumnType.REAL },
  { name: 'levelAdvPct', dbType: SQLiteColumnType.REAL },
  { name: 'AltarDamageDone', dbType: SQLiteColumnType.INTEGER },
  { name: 'DamageDoneToImmortal', dbType: SQLiteColumnType.INTEGER },
  { name: 'BlackheartDoubloonsCollected', dbType: SQLiteColumnType.INTEGER },
  { name: 'BlackheartDoubloonsTurnedIn', dbType: SQLiteColumnType.INTEGER },
  { name: 'MinesSkullsCollected', dbType: SQLiteColumnType.INTEGER },
  { name: 'DamageDoneToShrineMinions', dbType: SQLiteColumnType.INTEGER },
  { name: 'GardensPlantDamage', dbType: SQLiteColumnType.INTEGER },
  { name: 'GardensSeedsCollected', dbType: SQLiteColumnType.INTEGER },
  { name: 'GemsTurnedIn', dbType: SQLiteColumnType.INTEGER },
  { name: 'NukeDamageDone', dbType: SQLiteColumnType.INTEGER },
  { name: 'CurseDamageDone', dbType: SQLiteColumnType.INTEGER },
  { name: 'TimeInTemple', dbType: SQLiteColumnType.INTEGER },
  { name: 'DamageDoneToZerg', dbType: SQLiteColumnType.INTEGER },
  { name: 'isMVP', dbType: SQLiteColumnType.INTEGER },
  { name: 'awardCount', dbType: SQLiteColumnType.INTEGER },
] as const satisfies readonly ColumnDefinition[];

interface HotSReplay {
  match: Record<string, any>;
  players: Record<string, Record<string, any>>;
}

export type HotSReplayGameStats = InterfaceFromSchema<typeof HOTS_REPLAY_GAME_STATS_COLUMNS>;

function ensureTableColumns(tableName: string, columns: readonly ColumnDefinition[]) {
  const existingCols: { name: string }[] = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  const existingColNames = new Set(existingCols.map(c => c.name));

  for (const col of columns) {
    if (!existingColNames.has(col.name)) {
      try {
        let sql = `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.dbType}`;
        if (col.defaultValue !== undefined) {
          sql += ` DEFAULT ${typeof col.defaultValue === 'string' ? `'${col.defaultValue}'` : col.defaultValue}`;
        }
        db.exec(sql);
      } catch (err) {
        console.error(`Error adding column ${col.name} to ${tableName}:`, err);
      }
    }
  }
}

const initSchema = db.transaction(() => {
  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_settings_key
    ON settings(key)
  `);

  // hots_replays
  const createHotsReplaysTableSQL = generateCreateTableSQL('hots_replays', HOTS_REPLAYS_MATCH_COLUMNS);
  db.exec(createHotsReplaysTableSQL);
  ensureTableColumns('hots_replays', HOTS_REPLAYS_MATCH_COLUMNS);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replays_name_date_type
    ON hots_replays(map, date, type)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hots_replays_unique_match
    ON hots_replays(map, date, loopLength)
  `);

  // Remove legacy hots_replay_players table if it exists
  db.exec('DROP TABLE IF EXISTS hots_replay_players');

  // hots_replay_player_game_stats
  const createHotsReplayPlayerGameStatsTableSQL = generateCreateTableSQL(
    'hots_replay_player_game_stats',
    HOTS_REPLAY_GAME_STATS_COLUMNS
  );
  db.exec(createHotsReplayPlayerGameStatsTableSQL);
  ensureTableColumns('hots_replay_player_game_stats', HOTS_REPLAY_GAME_STATS_COLUMNS);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_player_game_stats_replay_id
    ON hots_replay_player_game_stats(replay_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_player_game_stats_account_id
    ON hots_replay_player_game_stats(hots_account_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_player_game_stats_discord_id
    ON hots_replay_player_game_stats(discord_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_player_game_stats_battle_tag
    ON hots_replay_player_game_stats(hots_battle_tag)
  `);
});

try {
  initSchema();
} catch (error) {
  console.error('Error initializing database schema:', error);
}

type ParsedReplay = NonNullable<Awaited<ReturnType<typeof parseReplay>>>;

/**
 * Parses a Heroes of the Storm replay file using hots-parser and extracts relevant information.
 * @param file The path to the replay file
 */
export async function parseReplay(file: string) {
  try {
    const Parser = require('hots-parser');
    const replay: HotSReplay = Parser.processReplay(file, { overrideVerifiedBuild: true });
    if (!replay || !replay.match) {
      console.error(`Invalid or incomplete replay data for file: ${file}`);
      return null;
    }

    const players = Object.values(replay.players).map(player => player);
    const team0Players = players
      .filter(p => p.team === 0)
      .map(p => `${p.name}#${p.tag}`)
      .join(', ');
    const team1Players = players
      .filter(p => p.team === 1)
      .map(p => `${p.name}#${p.tag}`)
      .join(', ');

    return {
      replayObj: replay,
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      map: replay.match.map,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players,
      team1Players,
      file,
    };
  } catch (error) {
    console.error(`Error parsing replay file ${file}:`, error);
    return null;
  }
}

/**
 * Recalculates and updates the SotS_* summary columns in hots_accounts for a given BattleTag
 */

function updateSotsStatsForAccount(battleTag: string) {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as totalGames,
        COUNT(DISTINCT hero) as heroPool,
        AVG(win) as winPct,
        AVG(SoloKill) as avgKills,
        AVG(Assists) as avgAssists,
        AVG(Deaths) as avgDeaths,
        AVG(Takedowns) as avgTakedowns,
        AVG(HeroDamage) as avgHeroDamage,
        AVG(SiegeDamage) as avgSiegeDamage,
        AVG(StructureDamage) as avgStructureDamage,
        AVG(MinionDamage) as avgMinionDamage,
        AVG(SummonDamage) as avgSummonDamage,
        AVG(CreepDamage) as avgCreepDamage,
        AVG(PhysicalDamage) as avgPhysicalDamage,
        AVG(SpellDamage) as avgAbilityDamage,
        AVG(Healing) as avgHealing,
        AVG(SelfHealing) as avgSelfHealing,
        AVG(ProtectionGivenToAllies) as avgAlliedShields,
        AVG(ClutchHealsPerformed) as avgClutchHeals,
        AVG(DamageTaken) as avgDamageTaken,
        AVG(DamageSoaked) as avgDamageSoaked,
        AVG(ExperienceContribution) as avgXP,
        AVG(DPM) as avgDPM,
        AVG(HPM) as avgHPM,
        AVG(XPM) as avgXPM,
        AVG(KDA) as avgKDA,
        AVG(KillParticipation) as avgKillPart,
        MAX(HighestKillStreak) as maxKillStreak,
        AVG(VengeancesPerformed) as avgVengeances,
        AVG(TimeSpentDead) as avgTimeDead,
        AVG(timeDeadPct) * 100 as avgTimeDeadPct,
        AVG(OutnumberedDeaths) as avgOutnumberedDeaths,
        AVG(EscapesPerformed) as avgEscapes,
        AVG(TeamfightEscapesPerformed) as avgTeamFightEscapes,
        AVG(damageDonePerDeath) as avgDamagePerDeath,
        AVG(healingDonePerDeath) as avgHealingPerDeath,
        AVG(damageTakenPerDeath) as avgDamageTakenPerDeath,
        AVG(TeamfightHeroDamage) as avgTeamFightHeroDamage,
        AVG(TeamfightDamageTaken) as avgTeamFightDamageTaken,
        AVG(TeamfightHealingDone) as avgTeamFightHealing,
        AVG(TimeCCdEnemyHeroes) as avgCCTime,
        AVG(TimeRootingEnemyHeroes) as avgRootTime,
        AVG(TimeSilencingEnemyHeroes) as avgSilenceTime,
        AVG(TimeStunningEnemyHeroes) as avgStunTime,
        AVG(OnFireTimeOnFire) as avgTimeOnFire,
        AVG(MercCampCaptures) as avgMercCaptures,
        AVG(WatchTowerCaptures) as avgWatchTowerCaptures,
        SUM(aces) as totalAces,
        SUM(wipes) as totalWipes,
        AVG(levelAdvPct) as avgLevelAdvPct,
        AVG(pctWithHeroAdv) as avgHeroAdvPct,
        AVG(passiveXPRate) as avgPassiveXPRate,
        AVG(passiveXPGain) as avgPassiveXPGain,
        AVG(AltarDamageDone) as avgAltarDamage,
        AVG(DamageDoneToImmortal) as avgImmortalDamage,
        AVG(DragonNumberOfDragonCaptures) as avgDragonCaptures,
        AVG(DragonShrinesCaptured) as avgShrinesCaptured,
        AVG(BlackheartDoubloonsCollected) as avgDubloonsHeld,
        AVG(BlackheartDoubloonsTurnedIn) as avgDubloonsTurnedIn,
        AVG(MinesSkullsCollected) as avgSkullsCollected,
        AVG(DamageDoneToShrineMinions) as avgShrineMinionDamage,
        AVG(GardensPlantDamage) as avgPlantDamage,
        AVG(GardensSeedsCollected) as avgSeedsCollected,
        AVG(GardenSeedsCollectedByPlayer) as avgGardenSeeds,
        AVG(GemsTurnedIn) as avgGemsTurnedIn,
        AVG(NukeDamageDone) as avgNukeDamage,
        AVG(CurseDamageDone) as avgCurseDamage,
        AVG(TimeInTemple) as avgTimeInTemple,
        AVG(DamageDoneToZerg) as avgDamageDoneToZerg,
        AVG(CageUnlocksInterrupted) as avgCageUnlocks,
        AVG(DDRatio) as avgDamageRatio,
        AVG(DPct) * 100 as avgPctOfTeamDamage,
        AVG(DTPct) * 100 as avgPctOfTeamDamageTaken,
        AVG(HPct) * 100 as avgPctOfTeamDamageHealed,
        AVG(SoftCCPct) * 100 as avgPctOfTimeSlowCC,
        AVG(HardCCPct) * 100 as avgPctOfTimeNonSlowCC,
        SUM(votes) as totalVotes,
        SUM(awardCount) as totalAwards,
        SUM(isMVP) as totalMVP,
        SUM(sprays) as totalSprays,
        SUM(sprayTD) as totalSprayTD,
        SUM(sprayDeaths) as totalSprayDeaths,
        SUM(bsteps) as totalBsteps,
        SUM(bstepTD) as totalBstepTD,
        SUM(bstepDeaths) as totalBstepDeaths,
        SUM(taunts) as totalTaunts,
        SUM(tauntTD) as totalTauntTD,
        SUM(tauntDeaths) as totalTauntDeaths,
        SUM(dances) as totalDances,
        SUM(danceTD) as totalDanceTD,
        SUM(danceDeaths) as totalDanceDeaths
      FROM hots_replay_player_game_stats
      WHERE hots_battle_tag = ?
    `).get(battleTag) as Record<string, number> | undefined;

    if (stats && stats.totalGames > 0) {
      db.prepare(`
        UPDATE hots_accounts SET
          SotS_Games = ?,
          SotS_Win_Pct = ?,
          SotS_Kills = ?,
          SotS_Assists = ?,
          SotS_Deaths = ?,
          SotS_Takedowns = ?,
          SotS_Hero_Damage = ?,
          SotS_Siege_Damage = ?,
          SotS_Structure_Damage = ?,
          SotS_Minion_Damage = ?,
          SotS_Summon_Damage = ?,
          SotS_Creep_Damage = ?,
          SotS_Physical_Damage = ?,
          SotS_Ability_Damage = ?,
          SotS_Healing = ?,
          SotS_Self_Healing = ?,
          SotS_Allied_Shields = ?,
          SotS_Clutch_Heals = ?,
          SotS_Damage_Taken = ?,
          SotS_Damage_Soaked = ?,
          SotS_XP_Contribution = ?,
          SotS_DPM = ?,
          SotS_HPM = ?,
          SotS_XPM = ?,
          SotS_KDA = ?,
          SotS_Kill_Participation = ?,
          SotS_Highest_Kill_Streak = ?,
          SotS_Vengeances = ?,
          SotS_Time_Dead = ?,
          SotS_Time_Dead_Pct = ?,
          SotS_Deaths_While_Outnumbered = ?,
          SotS_Escapes = ?,
          SotS_Team_Fight_Escapes = ?,
          SotS_Damage_per_Death = ?,
          SotS_Healing_per_Death = ?,
          SotS_Damage_Taken_per_Death = ?,
          SotS_Team_Fight_Hero_Damage = ?,
          SotS_Team_Fight_Damage_Taken = ?,
          SotS_Team_Fight_Healing = ?,
          SotS_CC_Time = ?,
          SotS_Root_Time = ?,
          SotS_Silence_Time = ?,
          SotS_Stun_Time = ?,
          SotS_Time_on_Fire = ?,
          SotS_Merc_Camp_Captures = ?,
          SotS_Watch_Tower_Captures = ?,
          SotS_Aces = ?,
          SotS_Wipes = ?,
          SotS_Pct_of_Game_with_Level_Adv = ?,
          SotS_Pct_of_Game_with_Hero_Adv = ?,
          SotS_Passive_XP_Second = ?,
          SotS_Passive_XP_Gained = ?,
          SotS_Altar_Damage_Done = ?,
          SotS_Damage_to_Immortal = ?,
          SotS_Dragon_Knights_Captured = ?,
          SotS_Shrines_Captured = ?,
          SotS_Dubloons_Held_At_End = ?,
          SotS_Dubloons_Turned_In = ?,
          SotS_Skulls_Collected = ?,
          SotS_Shrine_Minion_Damage = ?,
          SotS_Plant_Damage = ?,
          SotS_Seeds_Collected = ?,
          SotS_Garden_Seeds_Collected = ?,
          SotS_Gems_Turned_In = ?,
          SotS_Nuke_Damage = ?,
          SotS_Curse_Damage = ?,
          SotS_Time_On_Temple = ?,
          SotS_Damage_Done_to_Zerg = ?,
          SotS_Cage_Unlocks_Interrupted = ?,
          SotS_Hero_Pool = ?,
          SotS_Damage_Ratio = ?,
          SotS_Pct_of_Team_Damage = ?,
          SotS_Pct_of_Team_Damage_Taken = ?,
          SotS_Pct_of_Team_Damage_Healed = ?,
          SotS_Pct_of_Time_Slow_CC = ?,
          SotS_Pct_of_Time_Non_Slow_CC = ?,
          SotS_Votes = ?,
          SotS_Awards = ?,
          SotS_Award_Pct = ?,
          SotS_MVP = ?,
          SotS_MVP_Pct = ?,
          SotS_Sprays = ?,
          SotS_Spray_TD = ?,
          SotS_Spray_Deaths = ?,
          SotS_Bsteps = ?,
          SotS_Bstep_TD = ?,
          SotS_Bstep_Deaths = ?,
          SotS_Taunts = ?,
          SotS_Taunt_TD = ?,
          SotS_Taunt_Deaths = ?,
          SotS_Dances = ?,
          SotS_Dance_TD = ?,
          SotS_Dance_Deaths = ?
        WHERE hots_battle_tag = ?
      `).run(
        stats.totalGames,
        stats.winPct,
        stats.avgKills,
        stats.avgAssists,
        stats.avgDeaths,
        stats.avgTakedowns,
        stats.avgHeroDamage,
        stats.avgSiegeDamage,
        stats.avgStructureDamage,
        stats.avgMinionDamage,
        stats.avgSummonDamage,
        stats.avgCreepDamage,
        stats.avgPhysicalDamage,
        stats.avgAbilityDamage,
        stats.avgHealing,
        stats.avgSelfHealing,
        stats.avgAlliedShields,
        stats.avgClutchHeals,
        stats.avgDamageTaken,
        stats.avgDamageSoaked,
        stats.avgXP,
        stats.avgDPM,
        stats.avgHPM,
        stats.avgXPM,
        stats.avgKDA,
        stats.avgKillPart,
        stats.maxKillStreak,
        stats.avgVengeances,
        stats.avgTimeDead,
        stats.avgTimeDeadPct,
        stats.avgOutnumberedDeaths,
        stats.avgEscapes,
        stats.avgTeamFightEscapes,
        stats.avgDamagePerDeath,
        stats.avgHealingPerDeath,
        stats.avgDamageTakenPerDeath,
        stats.avgTeamFightHeroDamage,
        stats.avgTeamFightDamageTaken,
        stats.avgTeamFightHealing,
        stats.avgCCTime,
        stats.avgRootTime,
        stats.avgSilenceTime,
        stats.avgStunTime,
        stats.avgTimeOnFire,
        stats.avgMercCaptures,
        stats.avgWatchTowerCaptures,
        stats.totalAces,
        stats.totalWipes,
        stats.avgLevelAdvPct,
        stats.avgHeroAdvPct,
        stats.avgPassiveXPRate,
        stats.avgPassiveXPGain,
        stats.avgAltarDamage,
        stats.avgImmortalDamage,
        stats.avgDragonCaptures,
        stats.avgShrinesCaptured,
        stats.avgDubloonsHeld,
        stats.avgDubloonsTurnedIn,
        stats.avgSkullsCollected,
        stats.avgShrineMinionDamage,
        stats.avgPlantDamage,
        stats.avgSeedsCollected,
        stats.avgGardenSeeds,
        stats.avgGemsTurnedIn,
        stats.avgNukeDamage,
        stats.avgCurseDamage,
        stats.avgTimeInTemple,
        stats.avgDamageDoneToZerg,
        stats.avgCageUnlocks,
        stats.heroPool,
        stats.avgDamageRatio,
        stats.avgPctOfTeamDamage,
        stats.avgPctOfTeamDamageTaken,
        stats.avgPctOfTeamDamageHealed,
        stats.avgPctOfTimeSlowCC,
        stats.avgPctOfTimeNonSlowCC,
        stats.totalVotes,
        stats.totalAwards,
        stats.totalGames > 0 ? (stats.totalAwards || 0) / stats.totalGames : 0,
        stats.totalMVP,
        stats.totalGames > 0 ? (stats.totalMVP || 0) / stats.totalGames : 0,
        stats.totalSprays,
        stats.totalSprayTD,
        stats.totalSprayDeaths,
        stats.totalBsteps,
        stats.totalBstepTD,
        stats.totalBstepDeaths,
        stats.totalTaunts,
        stats.totalTauntTD,
        stats.totalTauntDeaths,
        stats.totalDances,
        stats.totalDanceTD,
        stats.totalDanceDeaths,
        battleTag
      );
    }
  } catch (err) {
    console.error(`Error updating SotS stats for account ${battleTag}:`, err);
  }
}

/**
 * Saves a parsed custom match into the database and returns its assigned replay ID.
 */
export function saveReplayToDb(parsedReplay: ParsedReplay): number {
  const replay = parsedReplay.replayObj;

  const saveTransaction = db.transaction(() => {
    // 1. Prepare match insert data
    const matchData: Record<string, any> = { ...replay.match };

    // Extract draft bans & picks
    if (matchData.bans) {
      for (let team = 0; team <= 1; team++) {
        const teamBans = matchData.bans[String(team)] || [];
        for (let i = 0; i < 3; i++) {
          matchData[`team${team}Ban${i + 1}`] = teamBans[i]?.hero || null;
        }
      }
    }

    if (matchData.picks) {
      matchData.firstPick = matchData.picks.first ?? null;
      for (let team = 0; team <= 1; team++) {
        const teamPicks = matchData.picks[String(team)] || [];
        for (let i = 0; i < 5; i++) {
          matchData[`team${team}Pick${i + 1}`] = teamPicks[i] || null;
        }
      }
    }

    if (matchData.version && typeof matchData.version === 'object') {
      matchData.build = matchData.version.m_build ?? null;
    }

    const filteredMatchCols = HOTS_REPLAYS_MATCH_COLUMNS.filter(col => !('skipImport' in col && (col as any).skipImport));
    const matchColNames = filteredMatchCols.map(col => col.name);
    const matchPlaceholders = filteredMatchCols.map(() => '?').join(', ');

    const matchValues = filteredMatchCols.map(col => {
      const rawValue = matchData[col.name];
      if (rawValue === undefined || rawValue === null) return null;
      if (rawValue instanceof Date) return rawValue.toISOString();
      if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
      if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'bigint' || Buffer.isBuffer(rawValue)) return rawValue;
      return String(rawValue);
    });

    const matchSql = `INSERT INTO hots_replays (${matchColNames.join(', ')}) VALUES (${matchPlaceholders}) ON CONFLICT(map, date, loopLength) DO UPDATE SET map=excluded.map RETURNING id`;
    const matchRow = db.prepare(matchSql).get(matchValues) as { id: number };
    const replayId = matchRow.id;

    // Delete existing player game stats for this replay if re-importing
    db.prepare('DELETE FROM hots_replay_player_game_stats WHERE replay_id = ?').run(replayId);

    // 2. Insert player game stats for all players
    const filteredStatsCols = HOTS_REPLAY_GAME_STATS_COLUMNS.filter(col => col.name !== 'id');
    const statsColNames = filteredStatsCols.map(col => col.name);
    const statsPlaceholders = filteredStatsCols.map(() => '?').join(', ');
    const statsSql = `INSERT INTO hots_replay_player_game_stats (${statsColNames.join(', ')}) VALUES (${statsPlaceholders})`;
    const insertStatsStmt = db.prepare(statsSql);

    const players = Object.values(replay.players || {});
    const updatedBattleTags = new Set<string>();

    for (const player of players) {
      const battleTag = `${player.name}#${player.tag}`;
      updatedBattleTags.add(battleTag);

      // Lookup hots_accounts id and discord_id if it exists
      const accountRow = db.prepare('SELECT id, discord_id FROM hots_accounts WHERE hots_battle_tag = ?').get(battleTag) as { id: number; discord_id: string } | undefined;
      const hotsAccountId = accountRow?.id ?? null;
      const discordId = accountRow?.discord_id ?? null;

      const playerTalents = player.talents || {};
      const gameStatsData = player.gameStats || {};

      const playerValues = filteredStatsCols.map(col => {
        if (col.name === 'replay_id') return replayId;
        if (col.name === 'hots_account_id') return hotsAccountId;
        if (col.name === 'discord_id') return discordId;
        if (col.name === 'hots_battle_tag') return battleTag;
        if (col.name === 'sprays') return Array.isArray(player.sprays) ? player.sprays.length : (player.sprays || 0);
        if (col.name === 'sprayTD') return Array.isArray(player.sprays) ? player.sprays.reduce((s: number, elem: any) => s + (elem.kills || 0), 0) : 0;
        if (col.name === 'sprayDeaths') return Array.isArray(player.sprays) ? player.sprays.reduce((s: number, elem: any) => s + (elem.deaths || 0), 0) : 0;
        if (col.name === 'bsteps') return Array.isArray(player.bsteps) ? player.bsteps.length : (player.bsteps || 0);
        if (col.name === 'bstepTD') return Array.isArray(player.bsteps) ? player.bsteps.reduce((s: number, elem: any) => s + (elem.kills || 0), 0) : 0;
        if (col.name === 'bstepDeaths') return Array.isArray(player.bsteps) ? player.bsteps.reduce((s: number, elem: any) => s + (elem.deaths || 0), 0) : 0;
        if (col.name === 'taunts') return Array.isArray(player.taunts) ? player.taunts.length : (player.taunts || 0);
        if (col.name === 'tauntTD') return Array.isArray(player.taunts) ? player.taunts.reduce((s: number, elem: any) => s + (elem.kills || 0), 0) : 0;
        if (col.name === 'tauntDeaths') return Array.isArray(player.taunts) ? player.taunts.reduce((s: number, elem: any) => s + (elem.deaths || 0), 0) : 0;
        if (col.name === 'dances') return Array.isArray(player.dances) ? player.dances.length : (player.dances || 0);
        if (col.name === 'danceTD') return Array.isArray(player.dances) ? player.dances.reduce((s: number, elem: any) => s + (elem.kills || 0), 0) : 0;
        if (col.name === 'danceDeaths') return Array.isArray(player.dances) ? player.dances.reduce((s: number, elem: any) => s + (elem.deaths || 0), 0) : 0;
        if (col.name === 'voiceLines') return Array.isArray(player.voiceLines) ? player.voiceLines.length : (player.voiceLines || 0);

        const gameLength = replay.match.length || 1;
        const teamPlayers = players.filter(p => p.team === player.team);
        const teamTotalHeroDamage = teamPlayers.reduce((acc, p) => acc + (p.gameStats?.HeroDamage || 0), 0) || 1;
        const teamTotalDamageTaken = teamPlayers.reduce((acc, p) => acc + (p.gameStats?.DamageTaken || 0), 0) || 1;

        if (col.name === 'DDRatio') return (gameStatsData.HeroDamage || 0) / (gameStatsData.DamageTaken === 0 || !gameStatsData.DamageTaken ? 1 : gameStatsData.DamageTaken);
        if (col.name === 'DPct') return (gameStatsData.HeroDamage || 0) / teamTotalHeroDamage;
        if (col.name === 'DTPct') return (gameStatsData.DamageTaken || 0) / teamTotalDamageTaken;
        if (col.name === 'HPct') return ((gameStatsData.Healing || 0) + (gameStatsData.ProtectionGivenToAllies || 0)) / teamTotalDamageTaken;
        if (col.name === 'SoftCCPct') return (gameStatsData.TimeCCdEnemyHeroes || 0) / gameLength;
        if (col.name === 'HardCCPct') return ((gameStatsData.TimeRootingEnemyHeroes || 0) + (gameStatsData.TimeSilencingEnemyHeroes || 0) + (gameStatsData.TimeStunningEnemyHeroes || 0)) / gameLength;
        if (col.name === 'timeDeadPct') return (gameStatsData.TimeSpentDead || 0) / gameLength;
        if (col.name === 'isMVP') return Array.isArray(gameStatsData.awards) && gameStatsData.awards.includes('EndOfMatchAwardMVPBoolean') ? 1 : 0;
        if (col.name === 'awardCount') return Array.isArray(gameStatsData.awards) ? gameStatsData.awards.length : 0;

        const rawValue = col.name in player
          ? player[col.name]
          : (col.name in playerTalents ? playerTalents[col.name] : gameStatsData[col.name]);

        if (rawValue === undefined || rawValue === null) return null;
        if (rawValue instanceof Date) return rawValue.toISOString();
        if (typeof rawValue === 'boolean') return rawValue ? 1 : 0;
        if (typeof rawValue === 'object') return JSON.stringify(rawValue);
        if (typeof rawValue === 'number' || typeof rawValue === 'string' || typeof rawValue === 'bigint' || Buffer.isBuffer(rawValue)) return rawValue;
        return String(rawValue);
      });

      insertStatsStmt.run(playerValues);
    }

    // 3. Update SotS_* summary columns on hots_accounts for participating players
    for (const bTag of updatedBattleTags) {
      updateSotsStatsForAccount(bTag);
    }

    return replayId;
  });

  return saveTransaction();
}

export interface PlayerMatchStats {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  recentMatches: Array<{
    date: string;
    map: string;
    hero: string;
    win: boolean;
    kills: number;
    assists: number;
    deaths: number;
  }>;
  topHeroes: Array<{
    hero: string;
    games: number;
    wins: number;
    winRate: number;
  }>;
  bmStats: {
    bsteps: number;
    bstepTd: number;
    bstepDeaths: number;
    taunts: number;
    tauntTd: number;
    tauntDeaths: number;
    sprays: number;
    sprayTd: number;
    sprayDeaths: number;
    dances: number;
    danceTd: number;
    danceDeaths: number;
  };
}

export function getPlayerMatchStats(discordId: string, limit: number = 13): PlayerMatchStats {
  type BmRow = {
    bsteps: number;
    bstepTd: number;
    bstepDeaths: number;
    taunts: number;
    tauntTd: number;
    tauntDeaths: number;
    sprays: number;
    sprayTd: number;
    sprayDeaths: number;
    dances: number;
    danceTd: number;
    danceDeaths: number;
  };
  const bmStats = db.prepare<[string], BmRow>(`
    SELECT 
      COALESCE(SUM(SotS_Bsteps), 0) as bsteps,
      COALESCE(SUM(SotS_Bstep_TD), 0) as bstepTd,
      COALESCE(SUM(SotS_Bstep_Deaths), 0) as bstepDeaths,
      COALESCE(SUM(SotS_Taunts), 0) as taunts,
      COALESCE(SUM(SotS_Taunt_TD), 0) as tauntTd,
      COALESCE(SUM(SotS_Taunt_Deaths), 0) as tauntDeaths,
      COALESCE(SUM(SotS_Sprays), 0) as sprays,
      COALESCE(SUM(SotS_Spray_TD), 0) as sprayTd,
      COALESCE(SUM(SotS_Spray_Deaths), 0) as sprayDeaths,
      COALESCE(SUM(SotS_Dances), 0) as dances,
      COALESCE(SUM(SotS_Dance_TD), 0) as danceTd,
      COALESCE(SUM(SotS_Dance_Deaths), 0) as danceDeaths
    FROM hots_accounts
    WHERE discord_id = ?
  `).get(discordId) || {
    bsteps: 0, bstepTd: 0, bstepDeaths: 0,
    taunts: 0, tauntTd: 0, tauntDeaths: 0,
    sprays: 0, sprayTd: 0, sprayDeaths: 0,
    dances: 0, danceTd: 0, danceDeaths: 0,
  };

  const matchFilter = `(s.discord_id = ? OR s.hots_battle_tag IN (SELECT hots_battle_tag FROM hots_accounts WHERE discord_id = ?))`;

  type OverallRow = { totalGames: number; wins: number; winRate: number };
  const overall = db.prepare<[string, string], OverallRow>(`
    SELECT 
      COUNT(*) as totalGames,
      SUM(CASE WHEN s.win = 1 THEN 1 ELSE 0 END) as wins,
      ROUND(AVG(s.win) * 100, 1) as winRate
    FROM hots_replay_player_game_stats s
    WHERE ${matchFilter}
  `).get(discordId, discordId) || { totalGames: 0, wins: 0, winRate: 0 };

  const totalGames = overall.totalGames || 0;
  const wins = overall.wins || 0;
  const losses = totalGames - wins;
  const winRate = totalGames > 0 ? (overall.winRate || 0) : 0;

  type RecentMatchRow = { date: string; map: string; hero: string; win: number; kills: number; assists: number; deaths: number };
  const recentMatchesRaw = db.prepare<[string, string, number], RecentMatchRow>(`
    SELECT r.date, r.map, s.hero, s.win, s.SoloKill as kills, s.Assists as assists, s.Deaths as deaths
    FROM hots_replay_player_game_stats s
    JOIN hots_replays r ON s.replay_id = r.id
    WHERE ${matchFilter}
    ORDER BY r.date DESC
    LIMIT ?
  `).all(discordId, discordId, limit);

  const recentMatches = recentMatchesRaw.map(m => ({
    ...m,
    win: m.win === 1,
  }));

  type TopHeroRow = { hero: string; games: number; wins: number; winRate: number };
  const topHeroes = db.prepare<[string, string], TopHeroRow>(`
    SELECT s.hero, COUNT(*) as games, SUM(CASE WHEN s.win = 1 THEN 1 ELSE 0 END) as wins, ROUND(AVG(s.win) * 100, 1) as winRate
    FROM hots_replay_player_game_stats s
    WHERE ${matchFilter}
    GROUP BY s.hero
    ORDER BY games DESC
    LIMIT 3
  `).all(discordId, discordId);

  return {
    totalGames,
    wins,
    losses,
    winRate,
    recentMatches,
    topHeroes,
    bmStats,
  };
}

export function optimizeDb(): void {
  try {
    console.log('Optimizing SQLite database (WAL checkpoint & VACUUM)...');
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec('VACUUM;');
    console.log('Database optimization complete!');
  } catch (error) {
    console.error('Error optimizing database:', error);
  }
}



