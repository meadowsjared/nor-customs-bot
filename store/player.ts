import { writeFile } from 'fs/promises';
import { Player } from '../types/player';

// Store user data in memory
export const players = new Map<string, Player>();

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2);
    await writeFile('./store/players.json', data);
    console.log('Player data saved successfully.');
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

export async function loadPlayerData(): Promise<Map<string, Player>> {
  try {
    const data = await import('./players.json');
    const playersMap = new Map<string, Player>(Object.entries(data.default || {}));
    console.log('Player data loaded successfully.');
    return playersMap;
  } catch (error) {
    console.error('Error loading player data:', error);
    return new Map<string, Player>();
  }
}
