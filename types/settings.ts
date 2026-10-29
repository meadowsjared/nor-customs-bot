export type DraftCoinState = {
  status: 'awaiting_call' | 'awaiting_choice' | 'completed'
  callerTeam: 1 | 2
  call?: 'heads' | 'tails'
  flipResult?: 'heads' | 'tails'
  isFirstPick?: boolean
  firstPickTeam?: 1 | 2
}

export type SettingRow = {
  guild_id: string
  key: string
  value: string
  updated_at: Date | string
}

export const SETTINGS_TABLE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    guild_id TEXT NOT NULL DEFAULT 'global',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, key)
  );
`

