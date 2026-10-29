import {
  MAP_VOTE_TABLE_SCHEMA_SQL,
  MapDefinition,
  MapVoteRow,
  MapVoteSession,
  MapVoteSessionRow,
  MapVoteTally,
} from '../types/mapVote'
import { sql } from './db'

/**
 * Initializes the `map_vote_sessions` and `map_votes` tables in PostgreSQL.
 */
export async function initMapVoteTables(): Promise<void> {
  await sql.unsafe(MAP_VOTE_TABLE_SCHEMA_SQL)
}

initMapVoteTables().catch(error => {
  console.error('Error initializing map vote tables:', error)
})

export const HOTS_MAPS: MapDefinition[] = [
  {
    id: 'dragon_shire',
    name: 'Dragon Shire',
    imageFileName: 'dragon_shire.png',
  },
  {
    id: 'volskaya_foundry',
    name: 'Volskaya Foundry',
    imageFileName: 'volskaya_foundry.png',
  },
  {
    id: 'garden_of_terror',
    name: 'Garden of Terror',
    imageFileName: 'garden_of_terror.png',
  },
  {
    id: 'garden_of_terror_classic',
    name: 'Garden of Terror Classic',
    imageFileName: 'garden_of_terror_classic.png',
  },
  {
    id: 'towers_of_doom',
    name: 'Towers of Doom',
    imageFileName: 'towers_of_doom.png',
  },
  {
    id: 'infernal_shrines',
    name: 'Infernal Shrines',
    imageFileName: 'infernal_shrines.png',
  },
  {
    id: 'battlefield_of_eternity',
    name: 'Battlefield of Eternity',
    imageFileName: 'battlefield_of_eternity.png',
  },
  {
    id: 'alterac_pass',
    name: 'Alterac Pass',
    imageFileName: 'alterac_pass.png',
  },
  {
    id: 'tomb_of_the_spider_queen',
    name: 'Tomb of the Spider Queen',
    imageFileName: 'tomb_of_the_spider_queen.png',
  },
  {
    id: 'cursed_hollow',
    name: 'Cursed Hollow',
    imageFileName: 'cursed_hollow.png',
  },
  { id: 'sky_temple', name: 'Sky Temple', imageFileName: 'sky_temple.png' },
  {
    id: 'braxis_holdout',
    name: 'Braxis Holdout',
    imageFileName: 'braxis_holdout.png',
  },
  {
    id: 'haunted_mines',
    name: 'Haunted Mines',
    imageFileName: 'haunted_mines.png',
  },
  {
    id: 'hanamura_temple',
    name: 'Hanamura Temple',
    imageFileName: 'hanamura_temple.png',
  },
  {
    id: 'warhead_junction',
    name: 'Warhead Junction',
    imageFileName: 'warhead_junction.png',
  },
  {
    id: 'blackhearts_bay',
    name: "Blackheart's Bay",
    imageFileName: 'blackhearts_bay.png',
  },
]

type ReplayMapCountRow = {
  map: string
  count: number
}

/**
 * Returns names of maps played in the last N hours (default 15 hours) from the `replays` table.
 */
export async function getRecentlyPlayedMapNames(hours = 15): Promise<string[]> {
  try {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000)
    const rows = await sql<{ map: string }[]>`
      SELECT DISTINCT map
      FROM replays
      WHERE date >= ${cutoffDate}
    `
    return rows.map(r => r.map)
  } catch (err) {
    console.error('Error fetching recently played maps:', err)
    return []
  }
}

/**
 * Returns the game number for tonight based on replays played in the last N hours (default 15 hours).
 */
export async function getGameNumberTonight(hours = 15): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - hours * 60 * 60 * 1000)
    const rows = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM replays
      WHERE date >= ${cutoffDate}
    `
    return (rows[0]?.count ?? 0) + 1
  } catch (err) {
    console.error('Error fetching game number tonight:', err)
    return 1
  }
}

/**
 * Queries play counts for each map directly from the `replays` table, ordered by count DESC.
 */
export async function getHistoricalPlayCounts(): Promise<Record<string, number>> {
  const countsMap: Record<string, number> = {}
  try {
    const rows = await sql<ReplayMapCountRow[]>`
      SELECT map, COUNT(*)::int AS count
      FROM replays
      GROUP BY map
      ORDER BY count DESC
    `
    for (const r of rows) {
      if (r.map) {
        countsMap[r.map.toLowerCase()] = r.count
      }
    }
  } catch (err) {
    console.error('Error querying replays map counts:', err)
  }
  return countsMap
}

/**
 * Returns HOTS_MAPS dynamically sorted by historical play count DESC from `replays`.
 */
export async function getSortedHotsMaps(): Promise<MapDefinition[]> {
  const historicalCounts = await getHistoricalPlayCounts()
  return [...HOTS_MAPS].sort((a, b) => {
    const countA = historicalCounts[a.name.toLowerCase()] ?? 0
    const countB = historicalCounts[b.name.toLowerCase()] ?? 0
    if (countB !== countA) {
      return countB - countA
    }
    return HOTS_MAPS.indexOf(a) - HOTS_MAPS.indexOf(b)
  })
}

/**
 * Returns active maps (excluding maps played in the last 15 hours),
 * sorted by current session votes DESC, then historical play count DESC.
 */
export async function getMapVoteSortedList(sessionId?: string): Promise<{
  activeMaps: MapDefinition[]
  recentlyPlayedMaps: MapDefinition[]
  tallies: MapVoteTally[]
}> {
  const [tallies, recentlyPlayedRaw, historicalCounts, sortedMaps] = await Promise.all([
    sessionId ? getMapVoteResults(sessionId) : Promise.resolve([]),
    getRecentlyPlayedMapNames(15),
    getHistoricalPlayCounts(),
    getSortedHotsMaps(),
  ])

  const talliesByMapId: Record<string, MapVoteTally> = {}
  for (const t of tallies) {
    talliesByMapId[t.mapId] = t
  }

  const recentlyPlayedNames = recentlyPlayedRaw.map(n => n.toLowerCase())

  const activeMaps: MapDefinition[] = []
  const recentlyPlayedMaps: MapDefinition[] = []

  for (const mapDef of sortedMaps) {
    const lowerName = mapDef.name.toLowerCase()
    if (recentlyPlayedNames.includes(lowerName)) {
      recentlyPlayedMaps.push(mapDef)
    } else {
      activeMaps.push(mapDef)
    }
  }

  // Fallback: If all maps were played in the last 15 hours, do not exclude any maps
  if (activeMaps.length === 0) {
    activeMaps.push(...recentlyPlayedMaps)
    recentlyPlayedMaps.length = 0
  }

  activeMaps.sort((a, b) => {
    const currentVotesA = talliesByMapId[a.id]?.count ?? 0
    const currentVotesB = talliesByMapId[b.id]?.count ?? 0

    if (currentVotesB !== currentVotesA) {
      return currentVotesB - currentVotesA
    }

    const histA = historicalCounts[a.name.toLowerCase()] ?? 0
    const histB = historicalCounts[b.name.toLowerCase()] ?? 0

    if (histB !== histA) {
      return histB - histA
    }

    return sortedMaps.indexOf(a) - sortedMaps.indexOf(b)
  })

  return { activeMaps, recentlyPlayedMaps, tallies }
}

/**
 * Creates a new active map vote session in PostgreSQL.
 */
export async function startMapVoteSession(
  sessionId: string,
  guildId: string,
  channelId: string,
  messageIds: string[],
  createdBy: string,
  title?: string
): Promise<MapVoteSession> {
  await sql`
    UPDATE map_vote_sessions
    SET active = FALSE
    WHERE guild_id = ${guildId} AND channel_id = ${channelId}
  `

  const createdAt = new Date()
  await sql`
    INSERT INTO map_vote_sessions (id, guild_id, channel_id, message_ids, created_by, created_at, active, title)
    VALUES (${sessionId}, ${guildId}, ${channelId}, ${messageIds}, ${createdBy}, ${createdAt}, TRUE, ${title ?? null})
  `

  return {
    id: sessionId,
    channelId,
    messageIds,
    createdBy,
    createdAt,
    active: true,
    title,
  }
}

function mapSessionRowToSession(row: MapVoteSessionRow): MapVoteSession {
  return {
    id: row.id,
    channelId: row.channel_id,
    messageIds: Array.isArray(row.message_ids) ? row.message_ids : [],
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    active: Boolean(row.active),
    title: row.title ?? undefined,
  }
}

/**
 * Retrieves the active vote session in a channel for a specific guild.
 */
export async function getActiveMapVoteSession(
  guildId: string,
  channelId: string
): Promise<MapVoteSession | undefined> {
  const rows = await sql<MapVoteSessionRow[]>`
    SELECT *
    FROM map_vote_sessions
    WHERE guild_id = ${guildId}
      AND channel_id = ${channelId}
      AND active = TRUE
    ORDER BY created_at DESC
    LIMIT 1
  `
  return rows[0] ? mapSessionRowToSession(rows[0]) : undefined
}

/**
 * Retrieves the newest vote session in a channel (active or ended).
 * If no session is found for the channel, falls back to the newest session overall.
 */
export async function getNewestMapVoteSession(
  guildId?: string,
  channelId?: string
): Promise<MapVoteSession | undefined> {
  let row: MapVoteSessionRow | undefined
  if (guildId && channelId) {
    const rows = await sql<MapVoteSessionRow[]>`
      SELECT *
      FROM map_vote_sessions
      WHERE guild_id = ${guildId} AND channel_id = ${channelId}
      ORDER BY created_at DESC
      LIMIT 1
    `
    row = rows[0]
  } else if (guildId) {
    const rows = await sql<MapVoteSessionRow[]>`
      SELECT *
      FROM map_vote_sessions
      WHERE guild_id = ${guildId}
      ORDER BY created_at DESC
      LIMIT 1
    `
    row = rows[0]
  }

  if (!row) {
    const rows = await sql<MapVoteSessionRow[]>`
      SELECT *
      FROM map_vote_sessions
      ORDER BY created_at DESC
      LIMIT 1
    `
    row = rows[0]
  }

  return row ? mapSessionRowToSession(row) : undefined
}

/**
 * Updates the stored message IDs for a vote session.
 */
export async function updateMapVoteSessionMessageIds(sessionId: string, messageIds: string[]): Promise<void> {
  await sql`
    UPDATE map_vote_sessions
    SET message_ids = ${messageIds}
    WHERE id = ${sessionId}
  `
}

/**
 * Retrieves a session by its ID.
 */
export async function getMapVoteSessionById(sessionId: string): Promise<MapVoteSession | undefined> {
  const rows = await sql<MapVoteSessionRow[]>`
    SELECT *
    FROM map_vote_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `
  return rows[0] ? mapSessionRowToSession(rows[0]) : undefined
}

/**
 * Casts or changes a user's vote for a map.
 */
export async function castMapVote(
  sessionId: string,
  userId: string,
  userName: string,
  mapId: string
): Promise<void> {
  await sql`
    INSERT INTO map_votes (session_id, user_id, user_name, map_id, voted_at)
    VALUES (${sessionId}, ${userId}, ${userName}, ${mapId}, CURRENT_TIMESTAMP)
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      map_id = EXCLUDED.map_id,
      user_name = EXCLUDED.user_name,
      voted_at = CURRENT_TIMESTAMP
  `
}

/**
 * Removes a user's vote.
 */
export async function removeMapVote(sessionId: string, userId: string): Promise<void> {
  await sql`
    DELETE FROM map_votes
    WHERE session_id = ${sessionId} AND user_id = ${userId}
  `
}

/**
 * Gets vote results tally for a given session.
 */
export async function getMapVoteResults(sessionId: string): Promise<MapVoteTally[]> {
  const [votes, sortedMaps] = await Promise.all([
    sql<MapVoteRow[]>`
      SELECT *
      FROM map_votes
      WHERE session_id = ${sessionId}
      ORDER BY voted_at ASC
    `,
    getSortedHotsMaps(),
  ])

  const talliesMap: Record<string, { count: number; voters: string[] }> = {}

  for (const mapDef of sortedMaps) {
    talliesMap[mapDef.id] = { count: 0, voters: [] }
  }

  for (const vote of votes) {
    if (!talliesMap[vote.map_id]) {
      talliesMap[vote.map_id] = { count: 0, voters: [] }
    }
    talliesMap[vote.map_id].count += 1
    talliesMap[vote.map_id].voters.push(vote.user_name)
  }

  return sortedMaps.map(mapDef => ({
    mapId: mapDef.id,
    mapName: mapDef.name,
    count: talliesMap[mapDef.id].count,
    voters: talliesMap[mapDef.id].voters,
  }))
}

/**
 * Gets the current vote cast by a specific user.
 */
export async function getUserVote(sessionId: string, userId: string): Promise<string | undefined> {
  const rows = await sql<Pick<MapVoteRow, 'map_id'>[]>`
    SELECT map_id
    FROM map_votes
    WHERE session_id = ${sessionId} AND user_id = ${userId}
    LIMIT 1
  `
  return rows[0]?.map_id
}

/**
 * Marks a vote session as ended/inactive.
 */
export async function endMapVoteSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE map_vote_sessions
    SET active = FALSE
    WHERE id = ${sessionId}
  `
}

/**
 * Completely deletes a map vote session and all associated user votes from PostgreSQL.
 */
export async function deleteMapVoteSession(sessionId: string): Promise<void> {
  await sql`
    DELETE FROM map_votes
    WHERE session_id = ${sessionId}
  `
  await sql`
    DELETE FROM map_vote_sessions
    WHERE id = ${sessionId}
  `
}
