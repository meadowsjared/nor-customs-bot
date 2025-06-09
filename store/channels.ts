import { VoiceChannel } from 'discord.js';
import { ChannelExtended, ChannelLocal } from '../types/channel';
import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

// Ensure the players table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    channelType TEXT PRIMARY KEY,
    channelId TEXT NOT NULL,
    channelName TEXT NOT NULL
  )
`);

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

/**
 * Retrieves a lobby channel
 * @return {ChannelLocal} The lobby channel as an object, or undefined if it does not exist.
 */
export function getChannels(channelTypes: string[]): ChannelLocal[] | undefined {
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
