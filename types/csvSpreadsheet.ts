import { ColumnDefinition, SQLiteColumnType } from '../utils/sql';

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

export interface CSVColumnDefinition extends ColumnDefinition {
  csvColumnName?: keyof CSVRecord;
}

export const HOTS_ACCOUNTS_COLUMNS: CSVColumnDefinition[] = [
  { name: 'id', dbType: SQLiteColumnType.INTEGER, primaryKey: true, autoIncrement: true, skipImport: true },
  { name: 'discord_id', dbType: SQLiteColumnType.TEXT, nullable: false, skipImport: true },
  {
    name: 'is_primary',
    csvColumnName: 'is_primary',
    dbType: SQLiteColumnType.INTEGER,
    defaultValue: 0,
    isBoolean: true,
    skipImport: true,
  },
  { name: 'updated_at', dbType: SQLiteColumnType.DATETIME, defaultValue: 'CURRENT_TIMESTAMP', skipImport: true },
  { name: 'hots_battle_tag', dbType: SQLiteColumnType.TEXT, nullable: false, skipImport: true },
  { name: 'HP_Region', dbType: SQLiteColumnType.INTEGER, skipImport: true },
  { name: 'HP_Blizz_ID', dbType: SQLiteColumnType.INTEGER, skipImport: true },
  { name: 'HP_QM_MMR', csvColumnName: 'QM MMR', dbType: SQLiteColumnType.INTEGER },
  { name: 'HP_SL_MMR', csvColumnName: 'SL MMR', dbType: SQLiteColumnType.INTEGER },
  { name: 'HP_QM_Games', csvColumnName: 'QM Games', dbType: SQLiteColumnType.INTEGER },
  { name: 'HP_SL_Games', csvColumnName: 'SL Games', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Win_Pct', csvColumnName: 'Win %', dbType: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Games', csvColumnName: 'Games', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Takedowns', csvColumnName: 'Takedowns', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Kills', csvColumnName: 'Kills', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Assists', csvColumnName: 'Assists', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Deaths', csvColumnName: 'Deaths', dbType: SQLiteColumnType.REAL },
  {
    name: 'SotS_Kill_Participation',
    csvColumnName: 'Kill Participation',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_KDA', csvColumnName: 'KDA', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Highest_Kill_Streak', csvColumnName: 'Highest Kill Streak', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Vengeances', csvColumnName: 'Vengeances', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Time_Dead', csvColumnName: 'Time Dead', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Time_Dead_Pct', csvColumnName: 'Time Dead %', dbType: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Deaths_While_Outnumbered', csvColumnName: 'Deaths While Outnumbered', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Escapes', csvColumnName: 'Escapes', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Escapes', csvColumnName: 'Team Fight Escapes', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Hero_Damage', csvColumnName: 'Hero Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_DPM', csvColumnName: 'DPM', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Physical_Damage', csvColumnName: 'Physical Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Ability_Damage', csvColumnName: 'Ability Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_per_Death', csvColumnName: 'Damage per Death', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Hero_Damage', csvColumnName: 'Team Fight Hero Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Siege_Damage', csvColumnName: 'Siege Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Structure_Damage', csvColumnName: 'Structure Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Minion_Damage', csvColumnName: 'Minion Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Summon_Damage', csvColumnName: 'Summon Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Creep_Damage', csvColumnName: 'Creep Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Healing', csvColumnName: 'Healing', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_HPM', csvColumnName: 'HPM', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Healing_per_Death', csvColumnName: 'Healing per Death', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Healing', csvColumnName: 'Team Fight Healing', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Self_Healing', csvColumnName: 'Self Healing', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Allied_Shields', csvColumnName: 'Allied Shields', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Clutch_Heals', csvColumnName: 'Clutch Heals', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Taken', csvColumnName: 'Damage Taken', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Soaked', csvColumnName: 'Damage Soaked', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_Taken_per_Death', csvColumnName: 'Damage Taken per Death', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Team_Fight_Damage_Taken', csvColumnName: 'Team Fight Damage Taken', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_CC_Time', csvColumnName: 'CC Time', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Root_Time', csvColumnName: 'Root Time', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Silence_Time', csvColumnName: 'Silence Time', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Stun_Time', csvColumnName: 'Stun Time', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Time_on_Fire', csvColumnName: 'Time on Fire', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_XP_Contribution', csvColumnName: 'XP Contribution', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_XPM', csvColumnName: 'XPM', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Merc_Camp_Captures', csvColumnName: 'Merc Camp Captures', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Watch_Tower_Captures', csvColumnName: 'Watch Tower Captures', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Aces', csvColumnName: 'Aces', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Wipes', csvColumnName: 'Wipes', dbType: SQLiteColumnType.REAL },
  {
    name: 'SotS_Pct_of_Game_with_Level_Adv',
    csvColumnName: '% of Game with Level Adv.',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Game_with_Hero_Adv',
    csvColumnName: '% of Game with Hero Adv.',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_Passive_XP_Second', csvColumnName: 'Passive XP/Second', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Passive_XP_Gained', csvColumnName: 'Passive XP Gained', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Altar_Damage_Done', csvColumnName: 'Altar Damage Done', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Damage_to_Immortal', csvColumnName: 'Damage to Immortal', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Dragon_Knights_Captured', csvColumnName: 'Dragon Knights Captured', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Shrines_Captured', csvColumnName: 'Shrines Captured', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Dubloons_Held_At_End', csvColumnName: 'Dubloons Held At End', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Dubloons_Turned_In', csvColumnName: 'Dubloons Turned In', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Skulls_Collected', csvColumnName: 'Skulls Collected', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Shrine_Minion_Damage', csvColumnName: 'Shrine Minion Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Plant_Damage', csvColumnName: 'Plant Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Seeds_Collected', csvColumnName: 'Seeds Collected', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Garden_Seeds_Collected', csvColumnName: 'Garden Seeds Collected', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Gems_Turned_In', csvColumnName: 'Gems Turned In', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Nuke_Damage', csvColumnName: 'Nuke Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Curse_Damage', csvColumnName: 'Curse Damage', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Time_On_Temple', csvColumnName: 'Time On Temple', dbType: SQLiteColumnType.TEXT },
  { name: 'SotS_Damage_Done_to_Zerg', csvColumnName: 'Damage Done to Zerg', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Cage_Unlocks_Interrupted', csvColumnName: 'Cage Unlocks Interrupted', dbType: SQLiteColumnType.REAL },
  { name: 'SotS_Hero_Pool', csvColumnName: 'Hero Pool', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Damage_Ratio', csvColumnName: 'Damage Ratio', dbType: SQLiteColumnType.REAL },
  {
    name: 'SotS_Pct_of_Team_Damage',
    csvColumnName: '% of Team Damage',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Team_Damage_Taken',
    csvColumnName: '% of Team Damage Taken',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Team_Damage_Healed',
    csvColumnName: '% of Team Damage Healed',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Time_Slow_CC',
    csvColumnName: '% of Time Slow CC',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  {
    name: 'SotS_Pct_of_Time_Non_Slow_CC',
    csvColumnName: '% of Time Non-Slow CC',
    dbType: SQLiteColumnType.REAL,
    isPercentage: true,
  },
  { name: 'SotS_Votes', csvColumnName: 'Votes', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Awards', csvColumnName: 'Awards', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Award_Pct', csvColumnName: 'Award %', dbType: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_MVP', csvColumnName: 'MVP', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_MVP_Pct', csvColumnName: 'MVP %', dbType: SQLiteColumnType.REAL, isPercentage: true },
  { name: 'SotS_Bsteps', csvColumnName: 'Bsteps', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Bstep_TD', csvColumnName: 'Bstep TD', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Bstep_Deaths', csvColumnName: 'Bstep Deaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunts', csvColumnName: 'Taunts', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunt_TD', csvColumnName: 'Taunt TD', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Taunt_Deaths', csvColumnName: 'Taunt Deaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Sprays', csvColumnName: 'Sprays', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Spray_TD', csvColumnName: 'Spray TD', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Spray_Deaths', csvColumnName: 'Spray Deaths', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dances', csvColumnName: 'Dances', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dance_TD', csvColumnName: 'Dance TD', dbType: SQLiteColumnType.INTEGER },
  { name: 'SotS_Dance_Deaths', csvColumnName: 'Dance Deaths', dbType: SQLiteColumnType.INTEGER },
];
