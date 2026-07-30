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
        AVG(win) as winPct,
        AVG(SoloKill) as avgKills,
        AVG(Assists) as avgAssists,
        AVG(Deaths) as avgDeaths,
        AVG(Takedowns) as avgTakedowns,
        AVG(HeroDamage) as avgHeroDamage,
        AVG(SiegeDamage) as avgSiegeDamage,
        AVG(Healing) as avgHealing,
        AVG(DamageTaken) as avgDamageTaken,
        AVG(ExperienceContribution) as avgXP,
        AVG(DPM) as avgDPM,
        AVG(HPM) as avgHPM,
        AVG(XPM) as avgXPM,
        AVG(KDA) as avgKDA,
        AVG(KillParticipation) as avgKillPart
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
          SotS_Healing = ?,
          SotS_Damage_Taken = ?,
          SotS_XP_Contribution = ?,
          SotS_DPM = ?,
          SotS_HPM = ?,
          SotS_XPM = ?,
          SotS_KDA = ?,
          SotS_Kill_Participation = ?
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
        stats.avgHealing,
        stats.avgDamageTaken,
        stats.avgXP,
        stats.avgDPM,
        stats.avgHPM,
        stats.avgXPM,
        stats.avgKDA,
        stats.avgKillPart,
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

      // Lookup hots_accounts.id if it exists
      const accountRow = db.prepare('SELECT id FROM hots_accounts WHERE hots_battle_tag = ?').get(battleTag) as { id: number } | undefined;
      const hotsAccountId = accountRow?.id ?? null;

      const playerTalents = player.talents || {};
      const gameStatsData = player.gameStats || {};

      const playerValues = filteredStatsCols.map(col => {
        if (col.name === 'replay_id') return replayId;
        if (col.name === 'hots_account_id') return hotsAccountId;
        if (col.name === 'hots_battle_tag') return battleTag;
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
