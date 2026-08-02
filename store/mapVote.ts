import Database from 'better-sqlite3';
import { MapDefinition, MapVoteSession, MapVoteTally } from '../types/mapVote';

const db = new Database('./store/nor_customs.db');

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS map_vote_sessions (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    message_ids TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    title TEXT
  );

  CREATE TABLE IF NOT EXISTS map_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    map_id TEXT NOT NULL,
    voted_at TEXT NOT NULL,
    UNIQUE(session_id, user_id)
  );
`);

export const HOTS_MAPS: MapDefinition[] = [
  { id: 'dragon_shire', name: 'Dragon Shire', imageFileName: 'dragon_shire.png' },
  { id: 'volskaya_foundry', name: 'Volskaya Foundry', imageFileName: 'volskaya_foundry.png' },
  { id: 'garden_of_terror', name: 'Garden of Terror', imageFileName: 'garden_of_terror.png' },
  { id: 'garden_of_terror_classic', name: 'Garden of Terror Classic', imageFileName: 'garden_of_terror_classic.png' },
  { id: 'towers_of_doom', name: 'Towers of Doom', imageFileName: 'towers_of_doom.png' },
  { id: 'infernal_shrines', name: 'Infernal Shrines', imageFileName: 'infernal_shrines.png' },
  { id: 'battlefield_of_eternity', name: 'Battlefield of Eternity', imageFileName: 'battlefield_of_eternity.png' },
  { id: 'alterac_pass', name: 'Alterac Pass', imageFileName: 'alterac_pass.png' },
  { id: 'tomb_of_the_spider_queen', name: 'Tomb of the Spider Queen', imageFileName: 'tomb_of_the_spider_queen.png' },
  { id: 'cursed_hollow', name: 'Cursed Hollow', imageFileName: 'cursed_hollow.png' },
  { id: 'sky_temple', name: 'Sky Temple', imageFileName: 'sky_temple.png' },
  { id: 'braxis_holdout', name: 'Braxis Holdout', imageFileName: 'braxis_holdout.png' },
  { id: 'haunted_mines', name: 'Haunted Mines', imageFileName: 'haunted_mines.png' },
  { id: 'hanamura_temple', name: 'Hanamura Temple', imageFileName: 'hanamura_temple.png' },
  { id: 'warhead_junction', name: 'Warhead Junction', imageFileName: 'warhead_junction.png' },
  { id: 'blackhearts_bay', name: "Blackheart's Bay", imageFileName: 'blackhearts_bay.png' },
];

interface SessionRow {
  id: string;
  channel_id: string;
  message_ids: string;
  created_by: string;
  created_at: string;
  active: number;
  title: string | null;
}

interface VoteRow {
  id: number;
  session_id: string;
  user_id: string;
  user_name: string;
  map_id: string;
  voted_at: string;
}

interface ReplayMapRow {
  map: string;
  count: number;
}

/**
 * Returns names of maps played in the last N hours (default 15 hours).
 */
export function getRecentlyPlayedMapNames(hours: number = 15): string[] {
  try {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = db
      .prepare<[string], { map: string }>(`SELECT DISTINCT map FROM hots_replays WHERE date >= ?`)
      .all(cutoffDate);
    return rows.map(r => r.map);
  } catch (err) {
    console.error('Error fetching recently played maps:', err);
    return [];
  }
}

/**
 * Returns the game number for tonight based on replays played in the last N hours (default 15 hours).
 */
export function getGameNumberTonight(hours: number = 15): number {
  try {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const row = db
      .prepare<[string], { count: number }>(`SELECT COUNT(*) as count FROM hots_replays WHERE date >= ?`)
      .get(cutoffDate);
    return (row?.count ?? 0) + 1;
  } catch (err) {
    console.error('Error fetching game number tonight:', err);
    return 1;
  }
}

/**
 * Queries play counts for each map directly from hots_replays table, ordered by count DESC
 */
export function getHistoricalPlayCounts(): Record<string, number> {
  const countsMap: Record<string, number> = {};
  try {
    const rows = db
      .prepare<[], ReplayMapRow>(`SELECT map, COUNT(*) as count FROM hots_replays GROUP BY map ORDER BY count DESC`)
      .all();
    for (const r of rows) {
      if (r.map) {
        countsMap[r.map.toLowerCase()] = r.count;
      }
    }
  } catch (err) {
    console.error('Error querying hots_replays counts:', err);
  }
  return countsMap;
}

/**
 * Returns HOTS_MAPS dynamically sorted by historical play count DESC from hots_replays.
 */
export function getSortedHotsMaps(): MapDefinition[] {
  const historicalCounts = getHistoricalPlayCounts();
  return [...HOTS_MAPS].sort((a, b) => {
    const countA = historicalCounts[a.name.toLowerCase()] ?? 0;
    const countB = historicalCounts[b.name.toLowerCase()] ?? 0;
    if (countB !== countA) {
      return countB - countA;
    }
    return HOTS_MAPS.indexOf(a) - HOTS_MAPS.indexOf(b);
  });
}

/**
 * Returns active maps (excluding maps played in the last 15 hours),
 * sorted by current session votes DESC, then historical play count DESC.
 */
export function getMapVoteSortedList(sessionId?: string): {
  activeMaps: MapDefinition[];
  recentlyPlayedMaps: MapDefinition[];
  tallies: MapVoteTally[];
} {
  const tallies = sessionId ? getMapVoteResults(sessionId) : [];
  const talliesByMapId: Record<string, MapVoteTally> = {};
  for (const t of tallies) {
    talliesByMapId[t.mapId] = t;
  }

  const recentlyPlayedNames = getRecentlyPlayedMapNames(15).map(n => n.toLowerCase());
  const historicalCounts = getHistoricalPlayCounts();

  const activeMaps: MapDefinition[] = [];
  const recentlyPlayedMaps: MapDefinition[] = [];

  const sortedMaps = getSortedHotsMaps();
  for (const mapDef of sortedMaps) {
    const lowerName = mapDef.name.toLowerCase();
    if (recentlyPlayedNames.includes(lowerName)) {
      recentlyPlayedMaps.push(mapDef);
    } else {
      activeMaps.push(mapDef);
    }
  }

  // Fallback: If all maps were played in the last 15 hours, do not exclude any maps
  if (activeMaps.length === 0) {
    activeMaps.push(...recentlyPlayedMaps);
    recentlyPlayedMaps.length = 0;
  }

  // Sort active maps:
  // 1. Current votes in session DESC
  // 2. Historical play count DESC
  // 3. Base sortedMaps index
  activeMaps.sort((a, b) => {
    const currentVotesA = talliesByMapId[a.id]?.count ?? 0;
    const currentVotesB = talliesByMapId[b.id]?.count ?? 0;

    if (currentVotesB !== currentVotesA) {
      return currentVotesB - currentVotesA;
    }

    const histA = historicalCounts[a.name.toLowerCase()] ?? 0;
    const histB = historicalCounts[b.name.toLowerCase()] ?? 0;

    if (histB !== histA) {
      return histB - histA;
    }

    return sortedMaps.indexOf(a) - sortedMaps.indexOf(b);
  });

  return { activeMaps, recentlyPlayedMaps, tallies };
}

/**
 * Creates a new active map vote session
 */
export function startMapVoteSession(
  sessionId: string,
  channelId: string,
  messageIds: string[],
  createdBy: string,
  title?: string,
): MapVoteSession {
  db.prepare(`UPDATE map_vote_sessions SET active = 0 WHERE channel_id = ?`).run(channelId);

  const createdAt = new Date();
  const stmt = db.prepare(`
    INSERT INTO map_vote_sessions (id, channel_id, message_ids, created_by, created_at, active, title)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);
  stmt.run(sessionId, channelId, JSON.stringify(messageIds), createdBy, createdAt.toISOString(), title ?? null);

  return {
    id: sessionId,
    channelId,
    messageIds,
    createdBy,
    createdAt,
    active: true,
    title,
  };
}

function mapSessionRowToSession(row: SessionRow): MapVoteSession {
  return {
    id: row.id,
    channelId: row.channel_id,
    messageIds: JSON.parse(row.message_ids || '[]'),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    active: row.active === 1,
    title: row.title ?? undefined,
  };
}

/**
 * Retrieves the active vote session in a channel.
 */
export function getActiveMapVoteSession(channelId: string): MapVoteSession | undefined {
  const row = db
    .prepare<[string], SessionRow>(
      `SELECT * FROM map_vote_sessions WHERE channel_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`,
    )
    .get(channelId);

  return row ? mapSessionRowToSession(row) : undefined;
}

/**
 * Retrieves the newest vote session in a channel (active or ended).
 * If no session is found for the channel, falls back to the newest session overall.
 */
export function getNewestMapVoteSession(channelId?: string): MapVoteSession | undefined {
  let row: SessionRow | undefined;
  if (channelId) {
    row = db
      .prepare<[string], SessionRow>(
        `SELECT * FROM map_vote_sessions WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(channelId);
  }

  if (!row) {
    row = db
      .prepare<[], SessionRow>(
        `SELECT * FROM map_vote_sessions ORDER BY created_at DESC LIMIT 1`,
      )
      .get();
  }

  return row ? mapSessionRowToSession(row) : undefined;
}

/**
 * Updates the stored message IDs for a vote session.
 */
export function updateMapVoteSessionMessageIds(sessionId: string, messageIds: string[]): void {
  db.prepare(`UPDATE map_vote_sessions SET message_ids = ? WHERE id = ?`).run(JSON.stringify(messageIds), sessionId);
}

/**
 * Retrieves a session by its ID.
 */
export function getMapVoteSessionById(sessionId: string): MapVoteSession | undefined {
  const row = db.prepare<[string], SessionRow>(`SELECT * FROM map_vote_sessions WHERE id = ?`).get(sessionId);
  return row ? mapSessionRowToSession(row) : undefined;
}

/**
 * Casts or changes a user's vote for a map.
 */
export function castMapVote(sessionId: string, userId: string, userName: string, mapId: string): void {
  const stmt = db.prepare(`
    INSERT INTO map_votes (session_id, user_id, user_name, map_id, voted_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, user_id) DO UPDATE SET
      map_id = excluded.map_id,
      user_name = excluded.user_name,
      voted_at = excluded.voted_at
  `);
  stmt.run(sessionId, userId, userName, mapId, new Date().toISOString());
}

/**
 * Removes a user's vote.
 */
export function removeMapVote(sessionId: string, userId: string): void {
  db.prepare(`DELETE FROM map_votes WHERE session_id = ? AND user_id = ?`).run(sessionId, userId);
}

/**
 * Gets vote results tally for a given session.
 */
export function getMapVoteResults(sessionId: string): MapVoteTally[] {
  const votes = db
    .prepare<[string], VoteRow>(`SELECT * FROM map_votes WHERE session_id = ? ORDER BY voted_at ASC`)
    .all(sessionId);

  const talliesMap: Record<string, { count: number; voters: string[] }> = {};

  const sortedMaps = getSortedHotsMaps();

  for (const mapDef of sortedMaps) {
    talliesMap[mapDef.id] = { count: 0, voters: [] };
  }

  for (const vote of votes) {
    if (!talliesMap[vote.map_id]) {
      talliesMap[vote.map_id] = { count: 0, voters: [] };
    }
    talliesMap[vote.map_id].count += 1;
    talliesMap[vote.map_id].voters.push(vote.user_name);
  }

  return sortedMaps.map(mapDef => ({
    mapId: mapDef.id,
    mapName: mapDef.name,
    count: talliesMap[mapDef.id].count,
    voters: talliesMap[mapDef.id].voters,
  }));
}

/**
 * Gets the current vote cast by a specific user.
 */
export function getUserVote(sessionId: string, userId: string): string | undefined {
  const row = db
    .prepare<[string, string], VoteRow>(`SELECT map_id FROM map_votes WHERE session_id = ? AND user_id = ?`)
    .get(sessionId, userId);
  return row?.map_id;
}

/**
 * Marks a vote session as ended/inactive.
 */
export function endMapVoteSession(sessionId: string): void {
  db.prepare(`UPDATE map_vote_sessions SET active = 0 WHERE id = ?`).run(sessionId);
}

/**
 * Completely deletes a map vote session and all associated user votes from the database.
 */
export function deleteMapVoteSession(sessionId: string): void {
  db.prepare(`DELETE FROM map_votes WHERE session_id = ?`).run(sessionId);
  db.prepare(`DELETE FROM map_vote_sessions WHERE id = ?`).run(sessionId);
}
