import Database from 'better-sqlite3';
import { CommandIds } from '../constants';

const db = new Database('./store/nor_customs.db');

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
      replayId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      playerNames TEXT NOT NULL,
      gameDate TEXT NOT NULL,
      mapName TEXT NOT NULL,
      gameMode TEXT NOT NULL,
      UNIQUE(replayId)
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
