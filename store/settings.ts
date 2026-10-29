import { DraftCoinState, SETTINGS_TABLE_SCHEMA_SQL, SettingRow } from '../types/settings'
import { sql } from './db'

/**
 * Initializes the `settings` table in PostgreSQL.
 */
export async function initSettingsTable(): Promise<void> {
  await sql.unsafe(SETTINGS_TABLE_SCHEMA_SQL)
}

initSettingsTable().catch(error => {
  console.error('Error initializing settings table:', error)
})

/**
 * Retrieves a setting value by key and guild ID from the PostgreSQL `settings` table.
 * @param key The setting key
 * @param guildId The Discord guild ID (server ID)
 * @returns The string value or undefined if not found
 */
export async function getSetting(key: string, guildId: string): Promise<string | undefined> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return undefined
  }

  const rows = await sql<Pick<SettingRow, 'value'>[]>`
    SELECT value
    FROM settings
    WHERE guild_id = ${guildId} AND key = ${key}
    LIMIT 1
  `
  return rows[0]?.value
}

/**
 * Saves or updates a setting in the PostgreSQL `settings` table for a specific guild ID.
 * @param key The setting key
 * @param value The string value
 * @param guildId The Discord guild ID (server ID)
 */
export async function setSetting(key: string, value: string, guildId: string): Promise<boolean> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return false
  }

  await sql`
    INSERT INTO settings (guild_id, key, value, updated_at)
    VALUES (${guildId}, ${key}, ${value}, CURRENT_TIMESTAMP)
    ON CONFLICT (guild_id, key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = CURRENT_TIMESTAMP
  `
  return true
}

/**
 * Deletes a setting from the PostgreSQL `settings` table for a specific guild ID.
 * @param key The setting key
 * @param guildId The Discord guild ID (server ID)
 */
export async function deleteSetting(key: string, guildId: string | null): Promise<boolean> {
  if (!guildId) {
    console.log({ key, guildId }, 'guildId is required')
    return false
  }

  await sql`
    DELETE FROM settings
    WHERE guild_id = ${guildId} AND key = ${key}
  `
  return true
}

function isDraftCoinState(obj: unknown): obj is DraftCoinState {
  return typeof obj === 'object' && obj !== null && 'status' in obj && 'callerTeam' in obj
}

/**
 * Retrieves the draft coin toss state for a guild.
 */
export async function getDraftCoinState(guildId: string): Promise<DraftCoinState | null> {
  const raw = await getSetting('draft_coin_state', guildId)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isDraftCoinState(parsed)) {
      return parsed
    }
  } catch (error) {
    console.error('Failed to parse draft_coin_state:', error)
  }
  return null
}

/**
 * Saves the draft coin toss state for a guild.
 */
export async function setDraftCoinState(guildId: string, state: DraftCoinState): Promise<boolean> {
  return await setSetting('draft_coin_state', JSON.stringify(state), guildId)
}

/**
 * Resets/deletes the draft coin toss state for a guild.
 */
export async function resetDraftCoinState(guildId: string): Promise<boolean> {
  return await deleteSetting('draft_coin_state', guildId)
}
