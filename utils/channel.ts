import { Guild, TextBasedChannel } from 'discord.js';
import { botChannelName } from '../constants';
import { getSetting, setSetting } from '../store/settings';

/**
 * Gets or resolves the primary text channel for bot commands and announcements in a guild.
 * It first checks the SQLite settings table for `bot_channel_id`.
 * If missing or pointing to an invalid channel, it falls back to finding a channel named `🫠-nor-customs`.
 * When found by name, it automatically persists the channel ID in SQLite settings.
 *
 * @param guild The Discord guild instance
 * @returns The text-based channel or undefined if not found
 */
export async function getBotChannel(
  guild: Guild | null | undefined
): Promise<TextBasedChannel | undefined> {
  if (!guild) {
    return undefined;
  }

  // 1. Try saved channel ID from settings table
  const savedChannelId = getSetting('bot_channel_id', guild.id);
  if (savedChannelId) {
    const channelById =
      guild.channels.cache.get(savedChannelId) ??
      (await guild.channels.fetch(savedChannelId).catch(() => null));

    if (channelById && channelById.isTextBased()) {
      return channelById;
    }
  }

  // 2. Fallback to searching by channel name ('🫠-nor-customs')
  const channelByName = guild.channels.cache.find(ch => ch.name === botChannelName);
  if (channelByName && channelByName.isTextBased()) {
    // Automatically persist to settings so future lookups are fast and immune to renames
    setSetting('bot_channel_id', channelByName.id, guild.id);
    return channelByName;
  }

  return undefined;
}
