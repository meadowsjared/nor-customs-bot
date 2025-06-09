export interface ChannelLocal {
  /**
   * The ID of the channel
   */
  channelId: string;
  /**
   * The name of the channel
   */
  channelName: string;
}

export interface ChannelExtended extends ChannelLocal {
  /**
   * The type of the channel, e.g., 'lobby', 'team1', 'team2'
   */
  channelType: string;
}
