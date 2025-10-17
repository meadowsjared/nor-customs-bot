import Database from 'better-sqlite3';
import { CommandIds } from '../constants';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db = new Database('./store/nor_customs.db');
import fs from 'fs';

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
  db.exec(`
    CREATE TABLE IF NOT EXISTS hots_replays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      map TEXT NOT NULL,
      filename TEXT NOT NULL,
      winner INTEGER,
      length INTEGER
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_replays_name_date_type
    ON hots_replays(map, date, type)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS hots_replay_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      replay_id INTEGER NOT NULL,
      team_number INTEGER NOT NULL,
      takedowns INTEGER,
      win INTEGER,
      FOREIGN KEY (replay_id) REFERENCES hots_replays(id)
    )
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
    const replay = Parser.processReplay(file, { overrideVerifiedBuild: true });
    // const header = Parser.getHeader(file);
    if (!replay) {
      console.error(`Invalid replay data for file: ${file}`);
      return;
    }

    // console.log(JSON.stringify({ replay, header }, null, 2));
    // console.log({ replay, header });
    // console.log(JSON.stringify(header, null, 2));
    // const replayId = replay.header;
    // const mapName = replay.header.mapName || 'Unknown';
    // const gameMode = replay.header.gameMode || 'Unknown';
    // const playerNames = replay.players.map((p: any) => p.name).join(', ');

    // console.log(JSON.stringify(replay.match, null, 2));
    // console.log({ replay: replay.match });
    // output the replay object to a file for later analysis

    fs.writeFileSync(`./replay_debug_${Date.now()}.json`, JSON.stringify(replay, null, 2));
    // join replay.match.teams['0'].tags and replay.match.teams['0'].names
    const mergeNamesAndTags = (names: string[], tags: number[]) => {
      if (!names || !tags || names.length !== tags.length) {
        console.warn('Names and tags arrays have different lengths or are invalid');
        return names || []; // fallback to just names if tags are missing/invalid
      }
      return names.map((name, index) => `${name}#${tags[index]}`);
    };
    return {
      date: replay.match.date,
      type: replay.match.type,
      mode: replay.match.mode,
      map: replay.match.map,
      length: replay.match.length,
      winner: replay.match.winner,
      team0Takedowns: replay.match.team0Takedowns,
      team1Takedowns: replay.match.team1Takedowns,
      team0Players: mergeNamesAndTags(replay.match.teams['0'].names, replay.match.teams['0'].tags),
      team1Players: mergeNamesAndTags(replay.match.teams['1'].names, replay.match.teams['1'].tags),
      file,
    };
    // return {
    //   replayId,
    //   mapName,
    //   gameMode,
    //   playerNames,
    // };
  } catch (error) {
    console.error(`Error parsing replay file ${file}:`, error);
  }
}
