export interface CSVRecord {
  Lookup: string; // This is their Discord ID
  Player: string; // In-Game Name
  Sorting: string; // Name used to sort players in the lobby and display
  'On Teams': string; // TRUE or FALSE
  'HP url': string; // URL to Heroes Profile
  'QM MMR': string; // Quick Match MMR
  'SL MMR': string; // Storm League MMR
  'QM Games': string; // Number of Quick Match Games
  'SL Games': string; // Number of Storm League Games
  MMR: number; // Overall MMR
  Untracked: string; // TRUE or FALSE
  Role: string; // T, A, B, H, F
  Tag: string; // BattleTag#1234
  is_primary: string; // TRUE or FALSE
  Adjustment: number;
  'Win %': number;
  Games: number;
  Takedowns: number;
  Kills: number;
  Assists: number;
  Deaths: number;
  'Kill Participation': number;
  KDA: number;
  'Highest Kill Streak': number;
  Vengeances: number;
  'Time Dead': number;
  'Time Dead %': number;
  'Deaths While Outnumbered': number;
  Escapes: number;
  'Team Fight Escapes': number;
  'Hero Damage': number;
  DPM: number;
  'Physical Damage': number;
  'Ability Damage': number;
  'Damage per Death': number;
  'Team Fight Hero Damage': number;
  'Siege Damage': number;
  'Structure Damage': number;
  'Minion Damage': number;
  'Summon Damage': number;
  'Creep Damage': number;
  Healing: number;
  HPM: number;
  'Healing per Death': number;
  'Team Fight Healing': number;
  'Self Healing': number;
  'Allied Shields': number;
  'Clutch Heals': number;
  'Damage Taken': number;
  'Damage Soaked': number;
  'Damage Taken per Death': number;
  'Team Fight Damage Taken': number;
  'CC Time': number;
  'Root Time': number;
  'Silence Time': number;
  'Stun Time': number;
  'Time on Fire': number;
  'XP Contribution': number;
  XPM: number;
  'Merc Camp Captures': number;
  'Watch Tower Captures': number;
  Aces: number;
  Wipes: number;
  '% of Game with Level Adv.': number;
  '% of Game with Hero Adv.': number;
  'Passive XP/Second': number;
  'Passive XP Gained': number;
  'Altar Damage Done': number;
  'Damage to Immortal': number;
  'Dragon Knights Captured': number;
  'Shrines Captured': number;
  'Dubloons Held At End': number;
  'Dubloons Turned In': number;
  'Skulls Collected': number;
  'Shrine Minion Damage': number;
  'Plant Damage': number;
  'Seeds Collected': number;
  'Garden Seeds Collected': number;
  'Gems Turned In': number;
  'Nuke Damage': number;
  'Curse Damage': number;
  'Time On Temple': number;
  'Damage Done to Zerg': number;
  'Cage Unlocks Interrupted': number;
  'Hero Pool': number;
  'Damage Ratio': number;
  '% of Team Damage': number;
  '% of Team Damage Taken': number;
  '% of Team Damage Healed': number;
  '% of Time Slow CC': number;
  '% of Time Non-Slow CC': number;
  Votes: number;
  Awards: number;
  'Award %': number;
  MVP: number;
  'MVP %': number;
  Bsteps: number;
  'Bstep TD': number;
  'Bstep Deaths': number;
  Taunts: number;
  'Taunt TD': number;
  'Taunt Deaths': number;
  Sprays: number;
  'Spray TD': number;
  'Spray Deaths': number;
  Dances: number;
  'Dance TD': number;
  'Dance Deaths': number;
}

export enum SQLiteColumnType {
  TEXT = 'TEXT',
  INTEGER = 'INTEGER',
  REAL = 'REAL',
  DATETIME = 'DATETIME',
}

export interface ColumnDefinition {
  name: string;
  type: SQLiteColumnType;
  csvColumnName?: keyof CSVRecord;
  nullable?: false;
  defaultValue?: string | number;
  unique?: boolean;
  primaryKey?: true;
  autoIncrement?: true;
  isBoolean?: true;
  isPercentage?: true;
  skipImport?: true;
}

export const HOTS_ACCOUNTS_COLUMNS: ColumnDefinition[] = [
  { name: 'id', type: SQLiteColumnType.INTEGER, primaryKey: true, autoIncrement: true, skipImport: true },
  { name: 'discord_id', type: SQLiteColumnType.TEXT, nullable: false, skipImport: true },
  {
    name: 'is_primary',
    csvColumnName: 'is_primary',
    type: SQLiteColumnType.INTEGER,
    defaultValue: 0,
    isBoolean: true,
    skipImport: true,
  },
  { name: 'updated_at', type: SQLiteColumnType.DATETIME, defaultValue: 'CURRENT_TIMESTAMP' },
  { name: 'hots_battle_tag', type: SQLiteColumnType.TEXT, nullable: false, skipImport: true },
  { name: 'HP_URL', type: SQLiteColumnType.TEXT, skipImport: true },
  { name: 'HP_QM_MMR', csvColumnName: 'QM MMR', type: SQLiteColumnType.INTEGER },
  { name: 'HP_SL_MMR', csvColumnName: 'SL MMR', type: SQLiteColumnType.INTEGER },
  { name: 'HP_QM_Games', csvColumnName: 'QM Games', type: SQLiteColumnType.INTEGER },
  { name: 'HP_SL_Games', csvColumnName: 'SL Games', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Win_Pct', csvColumnName: 'Win %', type: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Games', csvColumnName: 'Games', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Takedowns', csvColumnName: 'Takedowns', type: SQLiteColumnType.REAL },
  { name: 'SotS_Kills', csvColumnName: 'Kills', type: SQLiteColumnType.REAL },
  { name: 'SotS_Assists', csvColumnName: 'Assists', type: SQLiteColumnType.REAL },
  { name: 'SotS_Deaths', csvColumnName: 'Deaths', type: SQLiteColumnType.REAL },
  {
    name: 'SotS_Kill_Participation',
    csvColumnName: 'Kill Participation',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_KDA', csvColumnName: 'KDA', type: SQLiteColumnType.REAL },
  { name: 'SotS_Highest_Kill_Streak', csvColumnName: 'Highest Kill Streak', type: SQLiteColumnType.REAL },
  { name: 'SotS_Vengeances', csvColumnName: 'Vengeances', type: SQLiteColumnType.REAL },
  { name: 'SotS_Time_Dead', csvColumnName: 'Time Dead', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Time_Dead_Pct', csvColumnName: 'Time Dead %', type: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Deaths_While_Outnumbered', csvColumnName: 'Deaths While Outnumbered', type: SQLiteColumnType.REAL },
  { name: 'SotS_Escapes', csvColumnName: 'Escapes', type: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Escapes', csvColumnName: 'Team Fight Escapes', type: SQLiteColumnType.REAL },
  { name: 'SotS_Hero_Damage', csvColumnName: 'Hero Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_DPM', csvColumnName: 'DPM', type: SQLiteColumnType.REAL },
  { name: 'SotS_Physical_Damage', csvColumnName: 'Physical Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Ability_Damage', csvColumnName: 'Ability Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_per_Death', csvColumnName: 'Damage per Death', type: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Hero_Damage', csvColumnName: 'Team Fight Hero Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Siege_Damage', csvColumnName: 'Siege Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Structure_Damage', csvColumnName: 'Structure Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Minion_Damage', csvColumnName: 'Minion Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Summon_Damage', csvColumnName: 'Summon Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Creep_Damage', csvColumnName: 'Creep Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Healing', csvColumnName: 'Healing', type: SQLiteColumnType.REAL },
  { name: 'SotS_HPM', csvColumnName: 'HPM', type: SQLiteColumnType.REAL },
  { name: 'SotS_Healing_per_Death', csvColumnName: 'Healing per Death', type: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Healing', csvColumnName: 'Team Fight Healing', type: SQLiteColumnType.REAL },
  { name: 'SotS_Self_Healing', csvColumnName: 'Self Healing', type: SQLiteColumnType.REAL },
  { name: 'SotS_Allied_Shields', csvColumnName: 'Allied Shields', type: SQLiteColumnType.REAL },
  { name: 'SotS_Clutch_Heals', csvColumnName: 'Clutch Heals', type: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Taken', csvColumnName: 'Damage Taken', type: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Soaked', csvColumnName: 'Damage Soaked', type: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Taken_per_Death', csvColumnName: 'Damage Taken per Death', type: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Damage_Taken', csvColumnName: 'Team Fight Damage Taken', type: SQLiteColumnType.REAL },
  { name: 'SotS_CC_Time', csvColumnName: 'CC Time', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Root_Time', csvColumnName: 'Root Time', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Silence_Time', csvColumnName: 'Silence Time', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Stun_Time', csvColumnName: 'Stun Time', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Time_on_Fire', csvColumnName: 'Time on Fire', type: SQLiteColumnType.TEXT },
  { name: 'SotS_XP_Contribution', csvColumnName: 'XP Contribution', type: SQLiteColumnType.REAL },
  { name: 'SotS_XPM', csvColumnName: 'XPM', type: SQLiteColumnType.REAL },
  { name: 'SotS_Merc_Camp_Captures', csvColumnName: 'Merc Camp Captures', type: SQLiteColumnType.REAL },
  { name: 'SotS_Watch_Tower_Captures', csvColumnName: 'Watch Tower Captures', type: SQLiteColumnType.REAL },
  { name: 'SotS_Aces', csvColumnName: 'Aces', type: SQLiteColumnType.REAL },
  { name: 'SotS_Wipes', csvColumnName: 'Wipes', type: SQLiteColumnType.REAL },
  {
    name: 'SotS_Pct_of_Game_with_Level_Adv',
    csvColumnName: '% of Game with Level Adv.',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Game_with_Hero_Adv',
    csvColumnName: '% of Game with Hero Adv.',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_Passive_XP_Second', csvColumnName: 'Passive XP/Second', type: SQLiteColumnType.REAL },
  { name: 'SotS_Passive_XP_Gained', csvColumnName: 'Passive XP Gained', type: SQLiteColumnType.REAL },
  { name: 'SotS_Altar_Damage_Done', csvColumnName: 'Altar Damage Done', type: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_to_Immortal', csvColumnName: 'Damage to Immortal', type: SQLiteColumnType.REAL },
  { name: 'SotS_Dragon_Knights_Captured', csvColumnName: 'Dragon Knights Captured', type: SQLiteColumnType.REAL },
  { name: 'SotS_Shrines_Captured', csvColumnName: 'Shrines Captured', type: SQLiteColumnType.REAL },
  { name: 'SotS_Dubloons_Held_At_End', csvColumnName: 'Dubloons Held At End', type: SQLiteColumnType.REAL },
  { name: 'SotS_Dubloons_Turned_In', csvColumnName: 'Dubloons Turned In', type: SQLiteColumnType.REAL },
  { name: 'SotS_Skulls_Collected', csvColumnName: 'Skulls Collected', type: SQLiteColumnType.REAL },
  { name: 'SotS_Shrine_Minion_Damage', csvColumnName: 'Shrine Minion Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Plant_Damage', csvColumnName: 'Plant Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Seeds_Collected', csvColumnName: 'Seeds Collected', type: SQLiteColumnType.REAL },
  { name: 'SotS_Garden_Seeds_Collected', csvColumnName: 'Garden Seeds Collected', type: SQLiteColumnType.REAL },
  { name: 'SotS_Gems_Turned_In', csvColumnName: 'Gems Turned In', type: SQLiteColumnType.REAL },
  { name: 'SotS_Nuke_Damage', csvColumnName: 'Nuke Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Curse_Damage', csvColumnName: 'Curse Damage', type: SQLiteColumnType.REAL },
  { name: 'SotS_Time_On_Temple', csvColumnName: 'Time On Temple', type: SQLiteColumnType.TEXT },
  { name: 'SotS_Damage_Done_to_Zerg', csvColumnName: 'Damage Done to Zerg', type: SQLiteColumnType.REAL },
  { name: 'SotS_Cage_Unlocks_Interrupted', csvColumnName: 'Cage Unlocks Interrupted', type: SQLiteColumnType.REAL },
  { name: 'SotS_Hero_Pool', csvColumnName: 'Hero Pool', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Damage_Ratio', csvColumnName: 'Damage Ratio', type: SQLiteColumnType.REAL },
  {
    name: 'SotS_Pct_of_Team_Damage',
    csvColumnName: '% of Team Damage',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Team_Damage_Taken',
    csvColumnName: '% of Team Damage Taken',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Team_Damage_Healed',
    csvColumnName: '% of Team Damage Healed',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Time_Slow_CC',
    csvColumnName: '% of Time Slow CC',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Time_Non_Slow_CC',
    csvColumnName: '% of Time Non-Slow CC',
    type: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_Votes', csvColumnName: 'Votes', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Awards', csvColumnName: 'Awards', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Award_Pct', csvColumnName: 'Award %', type: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_MVP', csvColumnName: 'MVP', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_MVP_Pct', csvColumnName: 'MVP %', type: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Bsteps', csvColumnName: 'Bsteps', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Bstep_TD', csvColumnName: 'Bstep TD', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Bstep_Deaths', csvColumnName: 'Bstep Deaths', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunts', csvColumnName: 'Taunts', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunt_TD', csvColumnName: 'Taunt TD', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunt_Deaths', csvColumnName: 'Taunt Deaths', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Sprays', csvColumnName: 'Sprays', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Spray_TD', csvColumnName: 'Spray TD', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Spray_Deaths', csvColumnName: 'Spray Deaths', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dances', csvColumnName: 'Dances', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dance_TD', csvColumnName: 'Dance TD', type: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dance_Deaths', csvColumnName: 'Dance Deaths', type: SQLiteColumnType.INTEGER },
];
