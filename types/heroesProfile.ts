export interface HPData {
  qmMmr: number | string;
  slMmr: number | string;
  arMmr: number | string;
  qmGames: number | string;
  slGames: number | string;
  arGames: number | string;
  region: number;
  blizz_id: string;
}

interface HPLatestMap {
  map_id: number;
  name: string;
  short_name: string;
  type: string;
  ranked_rotation: number;
  playable: number;
  sanitized_map_name: string;
}

export interface HPPlayerData {
  blizz_id: string;
  battletag: string;
  region: number;
  latest_game: string;
  totalGamesPlayed: number;
  latestMap: HPLatestMap;
  latestHero: HPHero;
  battletagShort: string;
  regionName: string;
}

interface HPHero {
  id: number;
  name: string;
  short_name: string;
  alt_name: string | null;
  role: string | null;
  new_role: string;
  type: string;
  release_date: string;
  rework_date: string | null;
  last_change_patch_version: string;
  attribute_id: string;
  build_copy_name: string;
  last_updated: string;
}

interface HPGameMap {
  map_id: number;
  name: string;
  short_name: string;
  type: string;
  ranked_rotation: number;
  playable: number;
  sanitized_map_name: string;
}

interface HPGameType {
  type_id: number;
  name: string;
  no_space_name: string;
  short_name: string;
}

interface HPTalent {
  talent_id: number;
  hero_name: string;
  short_name: string;
  attribute_id: string;
  title: string;
  talent_name: string;
  description: string;
  status: string;
  hotkey: string;
  cooldown: string;
  mana_cost: string;
  sort: string;
  level: number;
  icon: string;
  required_talent_id: number | null;
}

interface HPHeroStats extends HPStats {
  hero_id: number;
  hero: HPHero;
}

interface HPMapStats extends HPStats {
  map_id: number;
  game_map: HPGameMap;
}

interface HPStats {
  wins: number;
  losses: number;
  games_played: number;
  game_date: string;
  win_rate: number;
  blizz_id: string;
  region: string;
  battletag: string;
  hovertext: string;
}

interface HPMMRData {
  conservative_rating: number;
  win: number;
  loss: number;
  rank_tier: string;
  win_rate: number;
  mmr: number;
}

interface HPMatchData {
  replayID: number;
  game_type: HPGameType;
  game_date: string;
  game_map: HPGameMap;
  winner: number;
  hero: HPHero;
  player_conservative_rating: number;
  player_change: number;
  hero_conservative_rating: number;
  hero_change: number;
  role_conservative_rating: number;
  role_change: number;
  level_one: HPTalent;
  level_four: HPTalent;
  level_seven: HPTalent;
  level_ten: HPTalent;
  level_thirteen: HPTalent;
  level_sixteen: HPTalent;
  level_twenty: HPTalent | null;
  player_mmr: number;
  hero_mmr: number;
  role_mmr: number;
}

export interface HPPlayerStatsData {
  wins: number;
  losses: number;
  first_to_ten_wins: number;
  first_to_ten_losses: number;
  first_to_ten_win_rate: number;
  second_to_ten_wins: number;
  second_to_ten_losses: number;
  second_to_ten_win_rate: number;
  kdr: number;
  kda: number;
  account_level: number;
  win_rate: number;
  bruiser_win_rate: number;
  support_win_rate: number;
  ranged_assassin_win_rate: number;
  melee_assassin_win_rate: number;
  healer_win_rate: number;
  tank_win_rate: number;
  mvp_rate: number;
  total_time_played: string;
  average_time_on_fire: string;
  heroes_three_highest_win_rate: HPHeroStats[];
  heroes_three_most_played: HPHeroStats[];
  heroes_three_latest_played: HPHeroStats[];
  qm_mmr_data: HPMMRData | null;
  ud_mmr_data: HPMMRData | null;
  hl_mmr_data: HPMMRData | null;
  tl_mmr_data: HPMMRData | null;
  sl_mmr_data: HPMMRData | null;
  ar_mmr_data: HPMMRData | null;
  maps_three_highest_win_rate: HPMapStats[];
  maps_three_most_played: HPMapStats[];
  maps_three_latest_played: HPMapStats[];
  stack_one_wins: number;
  stack_one_losses: number;
  stack_one_win_rate: number;
  stack_two_wins: number;
  stack_two_losses: number;
  stack_two_win_rate: number;
  stack_three_wins: number;
  stack_three_losses: number;
  stack_three_win_rate: number;
  stack_four_wins: number;
  stack_four_losses: number;
  stack_four_win_rate: number;
  stack_five_wins: number;
  stack_five_losses: number;
  stack_five_win_rate: number;
  matchData: HPMatchData[];
}
