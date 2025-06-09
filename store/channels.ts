import { VoiceChannel } from 'discord.js';
const db = new Database('./store/nor_customs.db');

// Store user data in memory
export const channelData = new Map<string, ChannelLocal>();

/**
 * Saves a voice channel to the local store.
 * @param name The name of the channel to save.
 * @param channel The voice channel object to save.
 */
export async function saveChannels(name: string, channel: VoiceChannel): Promise<void> {
  channelData.set(name, { id: channel.id, name: channel.name });
  try {
    // convert channelData to an object
    const channelObject = Array.from(channelData.entries()).reduce<{ [key: string]: ChannelLocal }>(
      (acc, [key, value]) => {
        acc[key] = value;
        return acc;
      },
      {}
    );
    await writeFile('./store/channels.json', JSON.stringify(channelObject, null, 2));
  } catch (error) {
    console.error('Error saving lobby channel:', error);
  }
}

/**
 * Loads the channels from the local store.
 */
export async function loadChannels() {
  try {
    // check if the file exists
    const fileExists = await import('fs').then(fs =>
      fs.promises
        .access('./store/channels.json')
        .then(() => true)
        .catch(() => false)
    );
    if (!fileExists) {
      console.warn('No channels file found');
      return;
    }
    const data = (await import('./channels.json')).default;
    Object.entries(data).forEach(([key, value]) => {
      channelData.set(key, value);
    });
  } catch (error) {
    console.error('Error loading lobby channel:', error);
  }
}
