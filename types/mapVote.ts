export type MapDefinition = {
  id: string
  name: string
  imageFileName: string
}

export type MapVoteSession = {
  id: string
  channelId: string
  messageIds: string[]
  createdBy: string
  createdAt: Date
  active: boolean
  title?: string
}

export type MapVote = {
  id?: number
  sessionId: string
  userId: string
  userName: string
  mapId: string
  votedAt: Date
}

export type MapVoteTally = {
  mapId: string
  mapName: string
  count: number
  voters: string[]
}

export type MapVoteSessionRow = {
  id: string
  guild_id: string
  channel_id: string
  message_ids: string[]
  created_by: string
  created_at: Date | string
  active: boolean
  title: string | null
}

export type MapVoteRow = {
  id: number
  session_id: string
  user_id: string
  user_name: string
  map_id: string
  voted_at: Date | string
}

export const MAP_VOTE_TABLE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS map_vote_sessions (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL DEFAULT 'global',
    channel_id TEXT NOT NULL,
    message_ids TEXT[] NOT NULL DEFAULT '{}',
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    title TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_map_vote_sessions_guild_channel_active
    ON map_vote_sessions (guild_id, channel_id, active, created_at DESC);

  CREATE TABLE IF NOT EXISTS map_votes (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES map_vote_sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    map_id TEXT NOT NULL,
    voted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_map_votes_session
    ON map_votes (session_id, voted_at ASC);
`
