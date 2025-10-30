import Database from 'better-sqlite3';
import { CommandIds } from '../constants';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = new Database('./store/nor_customs.db');
import fs from 'fs';
import { ColumnDefinition, generateCreateTableSQL, InterfaceFromSchema, SQLiteColumnType } from '../utils/sql';

const HOTS_REPLAYS_MATCH_COLUMNS = [
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
  { name: 'region', dbType: SQLiteColumnType.INTEGER },
  { name: 'loopGameStart', dbType: SQLiteColumnType.INTEGER },
  { name: 'length', dbType: SQLiteColumnType.REAL }, // in seconds
  { name: 'team0Takedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'team1Takedowns', dbType: SQLiteColumnType.INTEGER },
  { name: 'winner', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstPickWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstObjective', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstObjectiveWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstFort', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstKeep', dbType: SQLiteColumnType.INTEGER },
  { name: 'firstFortWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  { name: 'firstKeepWin', dbType: SQLiteColumnType.INTEGER, isBoolean: true },
  {
    name: 'players',
    dbType: SQLiteColumnType.INTEGER,
    skipImport: true,
  }, // row number in hots_replay_players table
] as const satisfies readonly ColumnDefinition[];

const HOTS_REPLAY_PLAYER_COLUMNS = [
  {
    name: 'id',
    dbType: SQLiteColumnType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    skipImport: true,
  },
  { name: 'replay_id', dbType: SQLiteColumnType.INTEGER, skipImport: true }, // foreign key to hots_replays.id
  { name: 'hero', dbType: SQLiteColumnType.TEXT },
  { name: 'name', dbType: SQLiteColumnType.TEXT },
  { name: 'region', dbType: SQLiteColumnType.INTEGER },
  { name: 'realm', dbType: SQLiteColumnType.INTEGER },
  { name: 'ToonHandle', dbType: SQLiteColumnType.TEXT },
  { name: 'tag', dbType: SQLiteColumnType.INTEGER },
  { name: 'team', dbType: SQLiteColumnType.INTEGER },
  {
    name: 'gameStats',
    dbType: SQLiteColumnType.INTEGER,
    skipImport: true,
  }, // row number in hots_replay_player_game_stats table
] as const satisfies readonly ColumnDefinition[];

const HOTS_REPLAY_GAME_STATS_COLUMNS = [
  {
    name: 'id',
    dbType: SQLiteColumnType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    skipImport: true,
  },
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
  { name: 'DPM', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'HPM', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'XPM', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'KillParticipation', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'length', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'passiveXPRate', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'passiveXPDiff', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'passiveXPGain', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'aces', dbType: SQLiteColumnType.INTEGER },
  { name: 'wipes', dbType: SQLiteColumnType.INTEGER },
  { name: 'timeWithHeroAdv', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'pctWithHeroAdv', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'levelAdvTime', dbType: SQLiteColumnType.REAL }, // REAL
  { name: 'levelAdvPct', dbType: SQLiteColumnType.REAL }, // REAL
] as const satisfies readonly ColumnDefinition[];

interface HotSReplay {
  match: InterfaceFromSchema<typeof HOTS_REPLAYS_MATCH_COLUMNS>;
  players: { [key: string]: InterfaceFromSchema<typeof HOTS_REPLAY_PLAYER_COLUMNS> };
}

export type HotSReplayGameStats = InterfaceFromSchema<typeof HOTS_REPLAY_GAME_STATS_COLUMNS>;

const initSchema = db.transaction(() => {
  // Ensure the settings table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Create an index for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_settings_key
    ON settings(key)
  `);

  const createHotsReplaysTableSQL = generateCreateTableSQL('hots_replays', HOTS_REPLAYS_MATCH_COLUMNS);
  db.exec(createHotsReplaysTableSQL);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replays_name_date_type
    ON hots_replays(map, date, type)
  `);

  const createHotsReplayPlayersTableSQL = generateCreateTableSQL('hots_replay_players', HOTS_REPLAY_PLAYER_COLUMNS);
  db.exec(createHotsReplayPlayersTableSQL);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_players_id
    ON hots_replay_players(id)
  `);

  const createHotsReplayPlayerGameStatsTableSQL = generateCreateTableSQL(
    'hots_replay_player_game_stats',
    HOTS_REPLAY_GAME_STATS_COLUMNS
  );
  db.exec(createHotsReplayPlayerGameStatsTableSQL);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replay_player_game_stats_id
    ON hots_replay_player_game_stats(id)
  `);
});

// Execute the transaction
try {
  initSchema();
} catch (error) {
  console.error('Error initializing database schema:', error);
}

export function setReplayFolderPath(path: string) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('${CommandIds.REPLAY_FOLDER_PATH}', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `);
  stmt.run(path);
}

export function getReplayFolderPath(): string | undefined {
  const stmt = db.prepare<string[], { value: string } | undefined>(`
    SELECT value FROM settings WHERE key = '${CommandIds.REPLAY_FOLDER_PATH}'
  `);
  const row = stmt.get();
  return row ? row.value : undefined;
}

/**
 * Parses a Heroes of the Storm replay file using hots-parser and extracts relevant information.
 * @param file The path to the replay file
 */
export async function parseReplay(file: string) {
  try {
    const Parser = require('hots-parser');
    const replay: HotSReplay = Parser.processReplay(file, { overrideVerifiedBuild: true });
    // const header = Parser.getHeader(file);
    if (!replay) {
      console.error(`Invalid replay data for file: ${file}`);
      return;
    }

    // first write the match data to the match table in the database
    function getInsertMatchSQL(replay: HotSReplay): { sql: string; values: unknown[] } {
      const allColumns: readonly ColumnDefinition[] = HOTS_REPLAYS_MATCH_COLUMNS.slice();
      const filteredColumns = allColumns.filter(col => !col.skipImport);
      const columnNames = filteredColumns.map(col => col.name);
      const placeholders = filteredColumns.map(() => '?').join(', ');

      const values = filteredColumns.map(col => {
        const value = replay.match[col.name as keyof typeof replay.match]; // we know the key exists because the match is defined by HOTS_REPLAYS_MATCH_COLUMNS

        // Handle boolean conversion for SQLite (convert true/false to 1/0)
        if (col.isBoolean && typeof value === 'boolean') {
          return value ? 1 : 0;
        }

        // Handle string values that need quotes
        if (col.dbType === SQLiteColumnType.TEXT && typeof value === 'string') {
          return value;
        }

        return value;
      });

      return {
        sql: `INSERT INTO hots_replays (${columnNames.join(', ')}) VALUES (${placeholders})`,
        values,
      };
    }
    const { sql, values } = getInsertMatchSQL(replay);
    const matchStmt = db.prepare(sql);
    const result = matchStmt.run(values);
    const replayId = result.lastInsertRowid;
    fs.writeFileSync(`./replay_debug_${replayId}.json`, JSON.stringify(replay, null, 2));

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
      replayId,
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      map: replay.match.map,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players: team0Players,
      team1Players: team1Players,
      file,
    };
  } catch (error) {
    console.error(`Error parsing replay file ${file}:`, error);
  }
}
