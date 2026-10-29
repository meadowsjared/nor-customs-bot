import { VoiceChannel } from 'discord.js'
import {
  ChannelExtended,
  ChannelLocal,
  ChannelRow,
  CHANNELS_TABLE_SCHEMA_SQL,
  ChannelType,
  LobbyMessage,
  LobbyMessageRow,
} from '../types/channel'
import { sql } from './db'

/**
 * Initializes the `channels` and `lobby_messages` tables in PostgreSQL.
 */
export async function initChannelsTables(): Promise<void> {
  await sql.unsafe(CHANNELS_TABLE_SCHEMA_SQL)
}

initChannelsTables().catch(error => {
  console.error('Error initializing channels tables:', error)
})

/**
 * Saves a Discord VoiceChannel to PostgreSQL for a specific guild.
 * @param guildId The Discord guild ID
 * @param channelType The type of the channel, e.g., 'lobby', 'team1', 'team2'
 * @param channel The Discord VoiceChannel object to save
 */
export async function saveChannel(guildId: string, channelType: string, channel: VoiceChannel): Promise<void> {
  await sql`
    INSERT INTO channels (guild_id, channel_type, channel_id, channel_name, updated_at)
    VALUES (${guildId}, ${channelType}, ${channel.id}, ${channel.name}, CURRENT_TIMESTAMP)
    ON CONFLICT (guild_id, channel_type) DO UPDATE SET
      channel_id = EXCLUDED.channel_id,
      channel_name = EXCLUDED.channel_name,
      updated_at = CURRENT_TIMESTAMP
  `
}

/**
 * Retrieves lobby/team channels for a guild matching the requested channel types.
 * @param guildId The Discord guild ID
 * @param channelTypes Array of channel types to fetch
 */
export async function getChannels(guildId: string, channelTypes: ChannelType[]): Promise<ChannelExtended[] | undefined> {
  if (channelTypes.length === 0) {
    return undefined
  }

  const rows = await sql<ChannelRow[]>`
    SELECT guild_id, channel_type, channel_id, channel_name, updated_at
    FROM channels
    WHERE guild_id = ${guildId}
      AND channel_type IN ${sql(channelTypes)}
  `

  if (rows.length === 0) {
    return undefined
  }

  return rows.map(row => ({
    channelId: row.channel_id,
    channelName: row.channel_name,
    channelType: row.channel_type,
  }))
}

/**
 * Saves the lobby announcement message ID and channel ID to PostgreSQL for a specific guild.
 * @param guildId The Discord guild ID
 * @param messageType The type of the message, e.g., 'new_game'
 * @param messageId The Discord message ID of the lobby announcement
 * @param channelId The Discord channel ID where the announcement was sent
 * @param previousPlayersList The previous players list string to store
 */
export async function saveLobbyMessage(
  guildId: string,
  messageType: string,
  messageId: string,
  channelId: string,
  previousPlayersList: string
): Promise<void> {
  await sql`
    INSERT INTO lobby_messages (guild_id, message_type, message_id, channel_id, previous_players_list, updated_at)
    VALUES (${guildId}, ${messageType}, ${messageId}, ${channelId}, ${previousPlayersList}, CURRENT_TIMESTAMP)
    ON CONFLICT (guild_id, message_type) DO UPDATE SET
      message_id = EXCLUDED.message_id,
      channel_id = EXCLUDED.channel_id,
      previous_players_list = EXCLUDED.previous_players_list,
      updated_at = CURRENT_TIMESTAMP
  `
}

/**
 * Retrieves lobby announcement messages for a specific guild and list of message types.
 * @param guildId The Discord guild ID
 * @param messageTypes The types of messages to retrieve, e.g., ['new_game']
 */
export async function getLobbyMessages(guildId: string, messageTypes: string[]): Promise<LobbyMessage[] | undefined> {
  if (messageTypes.length === 0) {
    return undefined
  }

  const rows = await sql<LobbyMessageRow[]>`
    SELECT guild_id, message_type, message_id, channel_id, previous_players_list, updated_at
    FROM lobby_messages
    WHERE guild_id = ${guildId}
      AND message_type IN ${sql(messageTypes)}
  `

  if (rows.length === 0) {
    return undefined
  }

  return rows.map(row => ({
    messageType: row.message_type,
    messageId: row.message_id,
    channelId: row.channel_id,
    previousPlayersList: row.previous_players_list,
  }))
}

/**
 * Deletes lobby messages of the specified types from PostgreSQL for a specific guild.
 * @param guildId The Discord guild ID
 * @param messageTypes An array of message types to delete, e.g., ['new_game']
 */
export async function deleteLobbyMessages(guildId: string, messageTypes: string[]): Promise<void> {
  if (messageTypes.length === 0) {
    return
  }

  await sql`
    DELETE FROM lobby_messages
    WHERE guild_id = ${guildId}
      AND message_type IN ${sql(messageTypes)}
  `
}

/**
 * Deletes lobby messages with the specified message IDs from PostgreSQL.
 * @param messageIds An array of message IDs to delete
 */
export async function deleteLobbyMessagesById(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) {
    return
  }

  await sql`
    DELETE FROM lobby_messages
    WHERE message_id IN ${sql(messageIds)}
  `
}

/**
 * Retrieves all channels for a guild as a Map keyed by channelType.
 * @param guildId The Discord guild ID
 */
export async function getAllChannels(guildId: string): Promise<Map<string, ChannelLocal>> {
  const rows = await sql<ChannelRow[]>`
    SELECT guild_id, channel_type, channel_id, channel_name, updated_at
    FROM channels
    WHERE guild_id = ${guildId}
  `

  return new Map<string, ChannelLocal>(
    rows.map(row => [
      row.channel_type,
      {
        channelId: row.channel_id,
        channelName: row.channel_name,
      },
    ])
  )
}
