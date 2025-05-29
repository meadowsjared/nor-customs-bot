export interface Player {
  /**
   * The username of the player in Heroes of the Storm
   */
  username: string;
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
