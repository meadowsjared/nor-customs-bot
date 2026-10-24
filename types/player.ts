interface Usernames extends DiscordUserNames {
  /**
   * The Heroes of the Storm accounts of the player
   */
  accounts?: HotsAccount[]
}

interface UsernamesWithAccounts extends DiscordUserNames {
  /**
   * The Heroes of the Storm accounts of the player
   */
  accounts: HotsAccount[]
}

export interface HotsAccount {
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hotsBattleTag: string
  /**
   * Whether this is the player's primary account
   */
  isPrimary: boolean
  /**
   * The Battle.net Real ID name of the player on this account (if any)
   */
  realIdName?: string | null
  /**
   * The database ID of the account
   * Used for updating/deleting the account
   */
  id: number
  hpQmMMR: number | null // HP_QM_MMR
  hpSlMMR: number | null // HP_SL_MMR
  hpArMMR: number | null // HP_AR_MMR
  hpQmGames: number | null // HP_QM_Games
  hpSlGames: number | null // HP_SL_Games
  hpArGames: number | null // HP_AR_Games
  /**
   * Discord ID of the original owner if this account is currently loaned/substituted
   */
  ownerDiscordId?: string | null
}

export interface HotsAccountRow {
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hots_battle_tag: string
  /**
   * The Discord ID of the player (null if not linked to Discord)
   */
  discord_id: string | null
  /**
   * Whether this is the player's primary account
   */
  is_primary: boolean
  /**
   * The Battle.net Real ID name of the player on this account (if any)
   */
  real_id_name: string | null
  /**
   * Discord ID of the original owner if this account is currently loaned/substituted
   */
  owner_discord_id?: string | null
  /**
   * The database ID of the account
   * Used for updating/deleting the account
   */
  id: number
  HP_Region?: number | null
  HP_Blizz_ID?: number | string | null
  HP_QM_MMR: number | null // HP_QM_MMR
  HP_SL_MMR: number | null // HP_SL_MMR
  HP_AR_MMR: number | null // HP_AR_MMR
  HP_QM_Games: number | null // HP_QM_Games
  HP_SL_Games: number | null // HP_SL_Games
  HP_AR_Games: number | null // HP_AR_Games
}

export interface AccountSubstitution {
  id: number
  guildId: string
  hotsBattleTag: string
  originalDiscordId: string
  substituteDiscordId: string
  replayId: number | null
  date: string
  isActive: boolean
}

export interface AccountSubstitutionRow {
  id: number
  guild_id: string
  hots_battle_tag: string
  original_discord_id: string
  substitute_discord_id: string
  replay_id: number | null
  date: string
  is_active: number
}

export interface DiscordUserNames {
  /**
   * The discord ID of the player
   */
  discordName: string
  /**
   * The discord username of the player
   */
  discordDisplayName: string
  /**
   * The discord global name of the player
   */
  discordGlobalName: string
}

export interface Player {
  /**
   * The discord ID of the player (null if not linked to Discord)
   */
  discordId: string | null
  /**
   * The usernames of the player in Heroes of the Storm and Discord
   */
  usernames: Usernames
  /**
   * The role of the player in the game
   * T = Tank, A = Assassin, B = Bruiser, H = Healer, F = Flex
   */
  role?: string
  /**
   * Whether the player is currently active in the lobby
   */
  active: boolean
  /**
   * The team number of the player
   * null = not assigned, 1 = team 1, 2 = team 2
   * This is used to determine which team the player is on
   */
  team: number | null
  lobbyRank: number
  draftOrder: number
  adjustment: number | null
  mmr: number | null
  lastActive: Date
}

export interface PlayerWithAccounts extends Player {
  /**
   * The Heroes of the Storm accounts of the player
   */
  usernames: UsernamesWithAccounts
}

export interface FlatPlayer {
  /**
   * The discord ID of the player
   */
  discord_id: string | null
  /**
   * The Heroes of the Storm battle tag of the player
   */
  hots_battle_tag: string
  /**
   * The discord username of the player
   */
  discord_name: string
  /**
   * The discord global name of the player
   */
  discord_global_name: string
  /**
   * The discord display name of the player
   */
  discord_display_name: string
  /**
   * The role of the player in the game
   * T = Tank, A = Assassin, B = Bruiser, H = Healer, F = Flex
   */
  role: string
  /**
   * Whether the player is currently active in the lobby
   */
  active: number
  /**
   * The team number of the player
   * undefined = not assigned, 1 = team 1, 2 = team 2
   * This is used to determine which team the player is on
   */
  team: number
  adjustment: number | null
  lobby_rank: number | null
  draft_order: number | null
  last_active: string // ISO date string
}

export interface DraftCoinState {
  status: 'awaiting_call' | 'awaiting_choice' | 'completed'
  callerTeam: 1 | 2
  call?: 'heads' | 'tails'
  flipResult?: 'heads' | 'tails'
  isFirstPick?: boolean
  firstPickTeam?: 1 | 2
}
