import { VoiceChannel } from 'discord.js';
import { ChannelExtended, ChannelLocal } from '../types/channel';
import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

// Ensure the channels table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    channelType TEXT PRIMARY KEY,
    channelId TEXT NOT NULL,
    channelName TEXT NOT NULL
  )
`);

// Ensure the lobby_messages table exists for storing lobby announcement message IDs
// and reset the previous messages
db.exec(`
  CREATE TABLE IF NOT EXISTS lobby_messages (
    messageType TEXT PRIMARY KEY,
    messageId TEXT DEFAULT '',
    channelId TEXT DEFAULT '',
    previousPlayersList TEXT DEFAULT ''
  );
`);
//DELETE FROM lobby_messages WHERE messageType = 'new_game';

/**
 * Saves a Discord VoiceChannel to the local store.
 * @param channelType The type of the channel, e.g., 'lobby', 'team1', 'team2'
 * @param channel The Discord VoiceChannel object to save
 * @returns {void}
 */
export function saveChannel(channelType: string, channel: VoiceChannel): void {
  const stmt = db.prepare(`
    INSERT INTO channels (channelType, channelId, channelName)
    VALUES (?, ?, ?)
    ON CONFLICT(channelType) DO UPDATE SET
      channelId=excluded.channelId,
      channelName=excluded.channelName
  `);
  stmt.run(channelType, channel.id, channel.name);
}

type channelTypes = 'lobby' | 'team1' | 'team2';

/**
 * Retrieves a lobby channel
 * @return {ChannelLocal} The lobby channel as an object, or undefined if it does not exist.
 */
export function getChannels(channelTypes: channelTypes[]): ChannelLocal[] | undefined {
  if (channelTypes.length === 0) {
    return undefined;
  }
  const placeholders = channelTypes.map(() => '?').join(', ');
  const stmt = db.prepare<string[], ChannelExtended>(`SELECT * FROM channels WHERE channelType IN (${placeholders})`);
  const rows: ChannelExtended[] = stmt.all(...channelTypes);
  if (!rows || rows.length === 0) {
    return undefined;
  }
  return rows.map((row: ChannelExtended) => ({
    channelId: row.channelId,
    channelName: row.channelName,
  }));
}

/**
 * Saves the lobby announcement message ID and channel ID
 * @param messageType The type of the message, e.g., 'new_game'
 * @param messageId The Discord message ID of the lobby announcement
 * @param channelId The Discord channel ID where the announcement was sent
 * @param previousPlayersList The previous players list string to store
 */
export function saveLobbyMessage(
  messageType: string,
  messageId: string,
  channelId: string,
  previousPlayersList: string
): void {
  const stmt = db.prepare(`
    INSERT INTO lobby_messages (messageType, messageId, channelId, previousPlayersList)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(messageType) DO UPDATE SET
      messageId=excluded.messageId,
      channelId=excluded.channelId,
      previousPlayersList=excluded.previousPlayersList
    WHERE messageType = ?
  `);
  stmt.run(messageType, messageId, channelId, previousPlayersList, messageType);
}

/**
 * Retrieves the current lobby announcement message ID and channel ID
 * @param messageType The type of the message, e.g., 'new_game'
 * @returns The message and channel IDs, or undefined if no announcement exists
 */
export function getLobbyMessage(
  messageType: string
): { messageId: string; channelId: string; previousPlayersList: string } | undefined {
  const stmt = db.prepare<string, { messageId: string; channelId: string; previousPlayersList: string }>(`
    SELECT messageId, channelId, previousPlayersList FROM lobby_messages WHERE messageType = ?
  `);
  const row = stmt.get(messageType);
  return row || undefined;
}

/**
 * Retrieves all channels from the local store.
 * @returns A Map of channel IDs to ChannelLocal objects.
 */
export function getAllChannels(): Map<string, ChannelLocal> {
  const stmt = db.prepare<[], ChannelExtended>('SELECT * FROM channels');
  const rows: ChannelExtended[] = stmt.all();
  return new Map<string, ChannelLocal>(
    rows.map((row: ChannelExtended) => [
      row.channelType,
      {
        channelId: row.channelId,
        channelName: row.channelName,
      },
    ])
  );
}
