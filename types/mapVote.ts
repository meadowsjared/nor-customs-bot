export interface MapDefinition {
  id: string;
  name: string;
  imageFileName: string;
}

export interface MapVoteSession {
  id: string;
  channelId: string;
  messageIds: string[];
  createdBy: string;
  createdAt: Date;
  active: boolean;
  title?: string;
}

export interface MapVote {
  id?: number;
  sessionId: string;
  userId: string;
  userName: string;
  mapId: string;
  votedAt: Date;
}

export interface MapVoteTally {
  mapId: string;
  mapName: string;
  count: number;
  voters: string[];
}
