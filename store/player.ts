import { writeFile, rename } from 'fs/promises';
import Database from 'better-sqlite3';
import { FlatPlayer, Player } from '../types/player';

const db = new Database('./store/nor_customs.db');

// Ensure the players table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discordId TEXT PRIMARY KEY,
    hotsName TEXT NOT NULL,
    discordName TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL
  )
`);

// Store user data in memory
export const players = new Map<string, Player>();

export function savePlayer(discordId: string, player: Player): void {
  const stmt = db.prepare(`
    INSERT INTO players (discordId, hotsName, discordName, role, active)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discordId) DO UPDATE SET
      hotsName=excluded.hotsName,
      discordName=excluded.discordName,
      role=excluded.role,
      active=excluded.active
  `);
  stmt.run(discordId, player.usernames.hots, player.usernames.discord, player.role, player.active ? 1 : 0);
  players.set(discordId, player);
}

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2);
    await writeFile('./store/players.tmp.json', data);
    await rename('./store/players.tmp.json', './store/players.json');
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

/**
 * Retrieves all active players from the database.
 * @returns Map<string, Player> a Map of active players, where the key is the Discord ID and the value is the Player object.
 */
export function getActivePlayers(): Map<string, Player> {
  const stmt = db.prepare<[], FlatPlayer>('SELECT * FROM players WHERE active = 1');
  const rows: FlatPlayer[] = stmt.all();
  return new Map<string, Player>(
    rows.map(row => [
      row.discordId,
      {
        usernames: {
          hots: row.hotsName,
          discord: row.discordName,
        },
        discordId: row.discordId,
        role: row.role,
        active: row.active === 1,
      },
    ])
  );
}

/**
 * Marks all players as inactive in the database.
 * @returns void
 */
export function markAllPlayersInactive(): void {
  const stmt = db.prepare('UPDATE players SET active = 0 WHERE active = 1');
  stmt.run();
  players.forEach(player => {
    player.active = false;
  });
}

/**
 * Mark this player as inactive in the database.
 * @param discordId The Discord ID of the player to mark as inactive.
 * @returns boolean true if the player was found and marked inactive, false otherwise.
 */
export function markPlayerInactive(discordId: string): false | Player {
  const player = players.get(discordId);
  if (!player) {
    return false;
  }
  const stmt = db.prepare('UPDATE players SET active = 0 WHERE discordId = ?');
  stmt.run(discordId);
  player.active = false;
  return player;
}

/**
 * Marks a player as active in the database.
 * @param discordId The Discord ID of the player to mark as active.
 * @returns Player object if the player was found and marked active, false otherwise, true if the player was already active.
 */
export function markPlayerActive(discordId: string): { alreadyActive: boolean; player: Player | undefined } {
  const player = players.get(discordId);
  if (!player) {
    return { alreadyActive: false, player: undefined }; // Player not found
  }
  if (player && player.active) {
    return { alreadyActive: true, player }; // Player already active
  }
  const stmt = db.prepare('UPDATE players SET active = 1 WHERE discordId = ?');
  stmt.run(discordId);
  player.active = true;
  return { alreadyActive: false, player };
}

/**
 * Gets a player by their Discord ID.
 * @param discordId The Discord ID of the player to retrieve.
 * @returns Player object if found, undefined otherwise.
 */
export function getPlayerByDiscordId(discordId: string): Player | undefined {
  return players.get(discordId);
}

/**
 * Sets the player role in the database.
 * @param discordId The Discord ID of the player to set the role for.
 * @param role The role to set for the player.
 * @returns Player object if the player was found and the role was set, false otherwise.
 */
export function setPlayerRole(discordId: string, role: string | null): false | Player {
  if (!role) {
    return false; // Invalid role
  }
  const player = players.get(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare('UPDATE players SET role = ? WHERE discordId = ?');
  stmt.run(role, discordId);
  player.role = role;
  return player;
}

export async function loadPlayerDataIntoSqlite(): Promise<Map<string, Player> | undefined> {
  try {
    const data = await import('./players.json');
    const playersMap = new Map<string, Player>(Object.entries(data.default || {}));
    // transfer the loaded players to the sqlite database
    playersMap.forEach((player, discordId) => {
      savePlayer(discordId, player);
    });
    return playersMap;
  } catch (error) {
    console.error('Error loading player data:', error);
    throw error; // Re-throw the error to handle it upstream
  }
}
