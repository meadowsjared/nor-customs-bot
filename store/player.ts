import { writeFile, rename } from 'fs/promises';
import Database from 'better-sqlite3';
import { DiscordUserNames, FlatPlayer, Player } from '../types/player';

const db = new Database('./store/nor_customs.db');

// Ensure the players table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    discordId TEXT PRIMARY KEY,
    hotsName TEXT NOT NULL,
    discordName TEXT NOT NULL,
    discordGlobalName TEXT NOT NULL,
    discordDisplayName TEXT NOT NULL,
    role TEXT NOT NULL,
    active INTEGER NOT NULL
  )
`);

export function savePlayer(discordId: string, player: Player): void {
  const stmt = db.prepare(`
    INSERT INTO players (discordId, hotsName, discordName, discordGlobalName, discordDisplayName, role, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(discordId) DO UPDATE SET
      hotsName=excluded.hotsName,
      discordName=excluded.discordName,
      role=excluded.role,
      active=excluded.active
  `);
  stmt.run(
    discordId,
    player.usernames.hots,
    player.usernames.discordName,
    player.usernames.discordGlobalName,
    player.usernames.discordDisplayName,
    player.role,
    player.active ? 1 : 0
  );
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
export function getActivePlayers(): Player[] {
  const stmt = db.prepare<[], FlatPlayer>('SELECT * FROM players WHERE active = 1');
  const rows: FlatPlayer[] = stmt.all();
  return rows.map<Player>(row => ({
    discordId: row.discordId,
    usernames: {
      hots: row.hotsName,
      discordName: row.discordName,
      discordGlobalName: row.discordGlobalName,
      discordDisplayName: row.discordDisplayName,
    },
    role: row.role,
    active: row.active === 1,
    team: row.team ?? undefined,
  }));
}

/**
 * Marks all players as inactive in the database.
 * @returns void
 */
export function markAllPlayersInactive(): void {
  const stmt = db.prepare('UPDATE players SET active = 0 WHERE active = 1');
  stmt.run();
}

/**
 * Mark this player as inactive in the database.
 * @param discordId The Discord ID of the player to mark as inactive.
 * @returns boolean true if the player was found and marked inactive, false otherwise.
 */
export function markPlayerInactive(discordId: string): false | Player {
  const player = getPlayerByDiscordId(discordId);
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
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return { alreadyActive: false, player: undefined }; // Player not found
  }
  if (player?.active) {
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
  const stmt = db.prepare<[string], FlatPlayer>('SELECT * FROM players WHERE discordId = ?');
  const row: FlatPlayer | undefined = stmt.get(discordId);
  if (!row) {
    return undefined; // Player not found
  }
  return {
    discordId: row.discordId,
    usernames: {
      hots: row.hotsName,
      discordName: row.discordName,
      discordGlobalName: row.discordGlobalName,
      discordDisplayName: row.discordDisplayName,
    },
    role: row.role,
    active: row.active === 1,
    team: row.team ?? undefined, // Ensure team is undefined if null
  };
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
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare('UPDATE players SET role = ? WHERE discordId = ?');
  stmt.run(role, discordId);
  player.role = role;
  return player;
}

/**
 * Changes the player's hots name in the database.
 * @param discordId The Discord ID of the player to change the name for.
 * @param hotsName The new Heroes of the Storm name for the player.
 * @returns Player object if the player was found and the name was changed, false otherwise.
 */
export function setPlayerName(discordId: string, hotsName: string): false | Player {
  if (!hotsName) {
    return false; // Invalid name
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare('UPDATE players SET hotsName = ? WHERE discordId = ?');
  stmt.run(hotsName, discordId);
  player.usernames.hots = hotsName;
  return player;
}

/**
 * Sets the Discord user names for a player in the database.
 * @param discordId The Discord ID of the player to set Discord names for.
 * @param discordData The Discord user names data to set for the player.
 * @returns boolean true if the player was found and the names were set, false otherwise.
 */
export function setPlayerDiscordNames(discordId: string, discordData: DiscordUserNames) {
  const { discordName, discordGlobalName, discordDisplayName } = discordData;
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare(`
    UPDATE players
    SET discordName = ?, discordGlobalName = ?, discordDisplayName = ?
    WHERE discordId = ?
  `);
  stmt.run(discordName, discordGlobalName, discordDisplayName, discordId);
  return true;
}

/**
 * Sets the active status of a player in the database.
 * @param discordId The Discord ID of the player to set active status for.
 * @param active Whether the player should be set as active (true) or inactive (false).
 * @returns ({ updated: boolean; player?: Player }) An object indicating whether the player was updated and the updated player object if applicable.
 * If the player was not found, updated will be false and player will be undefined.
 */
export function setPlayerActive(discordId: string, active: boolean): { updated: boolean; player?: Player } {
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return { updated: false, player }; // Player not found
  }
  if (player.active === active) {
    return { updated: false, player }; // No change needed
  }
  const stmt = db.prepare('UPDATE players SET active = ? WHERE discordId = ?');
  stmt.run(active ? 1 : 0, discordId);
  player.active = active;
  return { updated: true, player };
}

/**
 * clears the team assignments for all players in the database.
 * This sets the team field to NULL for all players.
 * @returns void
 */
export function clearTeams(): void {
  const stmt = db.prepare('UPDATE players SET team = NULL');
  stmt.run();
}

/**
 * sets the team for all players in the database.
 * @returns void
 */
export function setTeams(team1Ids: string[], team2Ids: string[]): void {
  const clearStmt = db.prepare('UPDATE players SET team = NULL');
  const stmts1 = db.prepare(`UPDATE players SET team = ? WHERE discordId IN ('${team1Ids.join("', '")}')`);
  const stmts2 = db.prepare(`UPDATE players SET team = ? WHERE discordId IN ('${team2Ids.join("', '")}')`);
  clearStmt.run();
  stmts1.run(1);
  stmts2.run(2);
}

export async function loadPlayerDataIntoSqlite(): Promise<Player[] | undefined> {
  interface PlayerJSON extends Omit<Player, 'team'> {
    team: number | null;
  }
  try {
    const data = await import('./players.json');
    const playersMap = new Map<string, PlayerJSON>(Object.entries(data.default ?? {}));
    // transfer the loaded players to the sqlite database
    // const adaptedPlayersMap = Array.from(playersMap).map((player, discordId) => {
    const adaptedPlayersMap = Array.from(playersMap.entries()).map(([discordId, player]) => {
      const playerData: Player = {
        ...player,
        usernames: {
          ...player.usernames,
        },
        discordId,
        team: player.team ?? undefined, // Ensure team is undefined if null
      };

      savePlayer(discordId, playerData);
      return playerData;
    });
    return adaptedPlayersMap;
  } catch (error) {
    console.error('Error loading player data:', error);
    throw error; // Re-throw the error to handle it upstream
  }
}
