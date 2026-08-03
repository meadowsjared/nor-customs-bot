import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

// Ensure the settings table exists with guild_id support
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT NOT NULL DEFAULT 'global',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (guild_id, key)
  )
`);

// Check if existing table needs migration to include guild_id column
const cols = db.prepare<[], { name: string }>('PRAGMA table_info(settings)').all();
if (cols.length > 0 && !cols.some(c => c.name === 'guild_id')) {
  db.exec('ALTER TABLE settings RENAME TO settings_old');
  db.exec(`
    CREATE TABLE settings (
      guild_id TEXT NOT NULL DEFAULT 'global',
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (guild_id, key)
    )
  `);
  db.exec("INSERT INTO settings (guild_id, key, value) SELECT 'global', key, value FROM settings_old");
  db.exec('DROP TABLE settings_old');
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_settings_guild_key
  ON settings(guild_id, key)
`);

/**
 * Retrieves a setting value by key and optional guild ID from the database settings table.
 * Defaults guildId to 'global' if not specified.
 * @param key The setting key
 * @param guildId The optional Discord guild ID (server ID)
 * @returns The string value or undefined if not found
 */
export function getSetting(key: string, guildId: string | null): string | undefined {
  if (guildId === null) {
    console.log({ key, guildId }, 'guildId is required');
    return undefined;
  }

  const stmt = db.prepare<[string, string], { value: string }>(
    'SELECT value FROM settings WHERE guild_id = ? AND key = ?',
  );
  const row = stmt.get(guildId, key);
  return row?.value;
}

/**
 * Saves or updates a setting in the database settings table for a specific guild ID.
 * Defaults guildId to 'global' if not specified.
 * @param key The setting key
 * @param value The string value
 * @param guildId The optional Discord guild ID (server ID)
 */
export function setSetting(key: string, value: string, guildId: string | null): boolean {
  if (guildId === null) {
    console.log({ key, guildId }, 'guildId is required');
    return false;
  }

  const stmt = db.prepare(`
    INSERT INTO settings (guild_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(guildId, key, value);
  return true;
}

/**
 * Deletes a setting from the database settings table for a specific guild ID.
 * @param key The setting key
 * @param guildId The optional Discord guild ID (server ID)
 */
export function deleteSetting(key: string, guildId: string | null): boolean {
  if (guildId === null) {
    console.log({ key, guildId }, 'guildId is required');
    return false;
  }

  const stmt = db.prepare(`
    DELETE FROM settings WHERE guild_id = ? AND key = ?
  `);
  stmt.run(guildId, key);
  return true;
}