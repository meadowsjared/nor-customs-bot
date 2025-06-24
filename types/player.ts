interface Usernames extends DiscordUserNames {
  /**
   * The Heroes of the Storm username of the player
   */
  hots: string;
}

export interface DiscordUserNames {
  /**
   * The discord ID of the player
   */
  discordName: string;
  /**
   * The discord username of the player
   */
  discordDisplayName: string;
  /**
   * The discord global name of the player
   */
  discordGlobalName: string;
}

export interface Player {
  /**
   * The usernames of the player in Heroes of the Storm and Discord
   */
  usernames: Usernames;
  /**
   * The role of the player in the game
   * T = Tank, A = Assassin, B = Bruiser, H = Healer, F = Flex
   */
  role: string;
  /**
   * Whether the player is currently active in the lobby
   */
  active: boolean;
}

export interface FlatPlayer {
  /**
   * The discord ID of the player
   */
  discordId: string;
  /**
   * The Heroes of the Storm username of the player
   */
  hotsName: string;
  /**
   * The discord username of the player
   */
  discordName: string;
  /**
   * The discord global name of the player
   */
  discordGlobalName: string;
  /**
   * The discord display name of the player
   */
  discordDisplayName: string;
  /**
   * The role of the player in the game
   * T = Tank, A = Assassin, B = Bruiser, H = Healer, F = Flex
   */
  role: string;
  /**
   * Whether the player is currently active in the lobby
   */
  active: number;
}
