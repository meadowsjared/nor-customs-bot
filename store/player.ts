import { writeFile, rename } from 'fs/promises';
import { Player } from '../types/player';

// Store user data in memory
export const players = new Map<string, Player>();

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2);
    await writeFile('./store/players.tmp.json', data);
    await rename('./store/players.tmp.json', './store/players.json');
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

export async function loadPlayerData(): Promise<Map<string, Player>> {
  try {
    const data = await import('./players.json');
    const playersMap = new Map<string, Player>(Object.entries(data.default || {}));
    return playersMap;
  } catch (error) {
    try {
      console.warn('Failed to load player data, trying players.json.tmp...');
      const tmpData = await import('./players.tmp.json');
      const playersMap = new Map<string, Player>(Object.entries(tmpData.default || {}));
      return playersMap;
    } catch (error) {
      // console.error('Error loading player data:', error);
      throw new Error('Failed to load player data from both players.json and players.tmp.json');
      // we should not return an empty map here, as it could lead to overwriting existing player data
      // return new Map<string, Player>();
    }
  }
}
