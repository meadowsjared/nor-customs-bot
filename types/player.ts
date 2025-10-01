interface Usernames extends DiscordUserNames {
  /**
   * The Heroes of the Storm accounts of the player
   */
  accounts?: HotsAccount[];
}

interface UsernamesWithAccounts extends DiscordUserNames {
  /**
   * The Heroes of the Storm accounts of the player
   */
  accounts: HotsAccount[];
}

export interface HotsAccount {
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hotsBattleTag: string;
  /**
   * Whether this is the player's primary account
   */
  isPrimary: boolean;
  /**
   * The database ID of the account
   * Used for updating/deleting the account
   */
  id: number;
}

export interface HotsAccountRow {
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hots_battle_tag: string;
  /**
   * The Discord ID of the player
   */
  discord_id: string;
  /**
   * Whether this is the player's primary account
   */
  is_primary: boolean;
  /**
   * The database ID of the account
   * Used for updating/deleting the account
   */
  id: number;
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
   * The discord ID of the player
   */
  discordId: string;
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
  /**
   * The team number of the player
   * undefined = not assigned, 1 = team 1, 2 = team 2
   * This is used to determine which team the player is on
   */
  team: number | undefined;
}

export interface PlayerWithAccounts extends Player {
  /**
   * The Heroes of the Storm accounts of the player
   */
  usernames: UsernamesWithAccounts;
}

export interface FlatPlayer {
  /**
   * The discord ID of the player
   */
  discord_id: string;
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hots_battle_tag: string;
  /**
   * The discord username of the player
   */
  discord_name: string;
  /**
   * The discord global name of the player
   */
  discord_global_name: string;
  /**
   * The discord display name of the player
   */
  discord_display_name: string;
  /**
   * The role of the player in the game
   * T = Tank, A = Assassin, B = Bruiser, H = Healer, F = Flex
   */
  role: string;
  /**
   * Whether the player is currently active in the lobby
   */
  active: number;
  /**
   * The team number of the player
   * undefined = not assigned, 1 = team 1, 2 = team 2
   * This is used to determine which team the player is on
   */
  team: number;
}
