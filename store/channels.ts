import { VoiceChannel } from 'discord.js';
import { ChannelExtended, ChannelLocal } from '../types/channel';
import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

// Ensure channels table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    guild_id TEXT NOT NULL DEFAULT 'global',
    channelType TEXT NOT NULL,
    channelId TEXT NOT NULL,
    channelName TEXT NOT NULL,
    PRIMARY KEY (guild_id, channelType)
  )
`);

// Check if existing channels table needs migration to include guild_id column
const channelCols = db.prepare<[], { name: string }>('PRAGMA table_info(channels)').all();
if (channelCols.length > 0 && !channelCols.some(c => c.name === 'guild_id')) {
  db.exec('ALTER TABLE channels RENAME TO channels_old');
  db.exec(`
    CREATE TABLE channels (
      guild_id TEXT NOT NULL DEFAULT 'global',
      channelType TEXT NOT NULL,
      channelId TEXT NOT NULL,
      channelName TEXT NOT NULL,
      PRIMARY KEY (guild_id, channelType)
    )
  `);
  db.exec("INSERT INTO channels (guild_id, channelType, channelId, channelName) SELECT 'global', channelType, channelId, channelName FROM channels_old");
  db.exec('DROP TABLE channels_old');
}

// Ensure lobby_messages table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS lobby_messages (
    guild_id TEXT NOT NULL DEFAULT 'global',
    messageType TEXT NOT NULL,
    messageId TEXT DEFAULT '',
    channelId TEXT DEFAULT '',
    previousPlayersList TEXT DEFAULT '',
    PRIMARY KEY (guild_id, messageType)
  )
`);

// Check if existing lobby_messages table needs migration to include guild_id column
const lobbyMsgCols = db.prepare<[], { name: string }>('PRAGMA table_info(lobby_messages)').all();
if (lobbyMsgCols.length > 0 && !lobbyMsgCols.some(c => c.name === 'guild_id')) {
  db.exec('ALTER TABLE lobby_messages RENAME TO lobby_messages_old');
  db.exec(`
    CREATE TABLE lobby_messages (
      guild_id TEXT NOT NULL DEFAULT 'global',
      messageType TEXT NOT NULL,
      messageId TEXT DEFAULT '',
      channelId TEXT DEFAULT '',
      previousPlayersList TEXT DEFAULT '',
      PRIMARY KEY (guild_id, messageType)
    )
  `);
  db.exec("INSERT INTO lobby_messages (guild_id, messageType, messageId, channelId, previousPlayersList) SELECT 'global', messageType, messageId, channelId, previousPlayersList FROM lobby_messages_old");
  db.exec('DROP TABLE lobby_messages_old');
}

/**
 * Saves a Discord VoiceChannel to the local store for a specific guild.
 * @param guildId The Discord guild ID
 * @param channelType The type of the channel, e.g., 'lobby', 'team1', 'team2'
 * @param channel The Discord VoiceChannel object to save
 */
export function saveChannel(guildId: string, channelType: string, channel: VoiceChannel): void {
  const stmt = db.prepare(`
    INSERT INTO channels (guild_id, channelType, channelId, channelName)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, channelType) DO UPDATE SET
      channelId=excluded.channelId,
      channelName=excluded.channelName
  `);
  stmt.run(guildId, channelType, channel.id, channel.name);
}

type channelTypes = 'lobby' | 'team1' | 'team2';

/**
 * Retrieves a lobby channel
 * @param guildId The Discord guild ID
 * @param channelTypes Array of channel types to fetch
 * @return {ChannelLocal} The lobby channel as an object, or undefined if it does not exist.
 */
export function getChannels(guildId: string, channelTypes: channelTypes[]): ChannelExtended[] | undefined {
  if (channelTypes.length === 0) {
    return undefined;
  }
  const placeholders = channelTypes.map(() => '?').join(', ');
  const stmt = db.prepare<[string, ...string[]], ChannelExtended>(
    `SELECT * FROM channels WHERE guild_id = ? AND channelType IN (${placeholders})`,
  );
  const rows: ChannelExtended[] = stmt.all(guildId, ...channelTypes);
  if (!rows || rows.length === 0) {
    return undefined;
  }
  return rows.map((row: ChannelExtended) => ({
    channelId: row.channelId,
    channelName: row.channelName,
    channelType: row.channelType,
  }));
}

/**
 * Saves the lobby announcement message ID and channel ID to the database for a specific guild.
 * @param guildId The Discord guild ID
 * @param messageType The type of the message, e.g., 'new_game'
 * @param messageId The Discord message ID of the lobby announcement
 * @param channelId The Discord channel ID where the announcement was sent
 * @param previousPlayersList The previous players list string to store
 */
export function saveLobbyMessage(
  guildId: string,
  messageType: string,
  messageId: string,
  channelId: string,
  previousPlayersList: string,
): void {
  const stmt = db.prepare(`
    INSERT INTO lobby_messages (guild_id, messageType, messageId, channelId, previousPlayersList)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, messageType) DO UPDATE SET
      messageId=excluded.messageId,
      channelId=excluded.channelId,
      previousPlayersList=excluded.previousPlayersList
    WHERE messageType = ?
  `);
  stmt.run(guildId, messageType, messageId, channelId, previousPlayersList, messageType);
}

/**
 * Retrieves the current lobby announcement message ID and channel ID for a specific guild.
 * @param guildId The Discord guild ID
 * @param messageTypes The type of the message, e.g., 'new_game'
 * @returns The message and channel IDs, or undefined if no announcement exists
 */
export function getLobbyMessages(
  guildId: string,
  messageTypes: string[],
): { messageType: string; messageId: string; channelId: string; previousPlayersList: string }[] | undefined {
  const stmt = db.prepare<
    [string, ...string[]],
    { messageType: string; messageId: string; channelId: string; previousPlayersList: string }
  >(`
    SELECT messageType, messageId, channelId, previousPlayersList FROM lobby_messages WHERE guild_id = ? AND messageType IN (${messageTypes
      .map(() => '?')
      .join(', ')})
  `);
  const row = stmt.all(guildId, ...messageTypes);
  return row.length > 0 ? row : undefined;
}

/**
 * Deletes lobby messages of the specified types from the local store for a specific guild.
 * @param guildId The Discord guild ID
 * @param messageTypes An array of message types to delete, e.g., ['new_game']
 */
export function deleteLobbyMessages(guildId: string, messageTypes: string[]): void {
  if (messageTypes.length === 0) {
    return;
  }
  const placeholders = messageTypes.map(() => '?').join(', ');
  const stmt = db.prepare(`DELETE FROM lobby_messages WHERE guild_id = ? AND messageType IN (${placeholders})`);
  stmt.run(guildId, ...messageTypes);
}

/**
 * Deletes lobby messages with the specified message IDs from the local store.
 * @param messageIds An array of message IDs to delete
 */
export function deleteLobbyMessagesById(messageIds: string[]): void {
  if (messageIds.length === 0) {
    return;
  }
  const placeholders = messageIds.map(() => '?').join(', ');
  const stmt = db.prepare(`DELETE FROM lobby_messages WHERE messageId IN (${placeholders})`);
  stmt.run(...messageIds);
}

/**
 * Retrieves all channels from the local store.
 * @param guildId The Discord guild ID
 * @returns A Map of channel IDs to ChannelLocal objects.
 */
export function getAllChannels(guildId: string): Map<string, ChannelLocal> {
  const stmt = db.prepare<[string, ...string[]], ChannelExtended>('SELECT * FROM channels WHERE guild_id = ?');
  const rows: ChannelExtended[] = stmt.all(guildId);
  return new Map<string, ChannelLocal>(
    rows.map((row: ChannelExtended) => [
      row.channelType,
      {
        channelId: row.channelId,
        channelName: row.channelName,
      },
    ]),
  );
}
