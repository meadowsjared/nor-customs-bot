export type ChannelType = 'lobby' | 'team1' | 'team2'

export type ChannelLocal = {
  /**
   * The ID of the channel
   */
  channelId: string
  /**
   * The name of the channel
   */
  channelName: string
}

export type ChannelExtended = {
  /**
   * The ID of the channel
   */
  channelId: string
  /**
   * The name of the channel
   */
  channelName: string
  /**
   * The type of the channel, e.g., 'lobby', 'team1', 'team2'
   */
  channelType: string
}

export type LobbyMessage = {
  messageType: string
  messageId: string
  channelId: string
  previousPlayersList: string
}

export type ChannelRow = {
  guild_id: string
  channel_type: string
  channel_id: string
  channel_name: string
  updated_at: Date | string
}

export type LobbyMessageRow = {
  guild_id: string
  message_type: string
  message_id: string
  channel_id: string
  previous_players_list: string
  updated_at: Date | string
}

export const CHANNELS_TABLE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS channels (
    guild_id TEXT NOT NULL DEFAULT 'global',
    channel_type TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_type)
  );

  CREATE TABLE IF NOT EXISTS lobby_messages (
    guild_id TEXT NOT NULL DEFAULT 'global',
    message_type TEXT NOT NULL,
    message_id TEXT NOT NULL DEFAULT '',
    channel_id TEXT NOT NULL DEFAULT '',
    previous_players_list TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, message_type)
  );

  CREATE INDEX IF NOT EXISTS idx_lobby_messages_message_id
    ON lobby_messages (message_id);
`
