import { writeFile, rename } from 'fs/promises';
import Database from 'better-sqlite3';
import { DiscordUserNames, FlatPlayer, HotsAccount, HotsAccountRow, Player } from '../types/player';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  CacheType,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js';
import { CommandIds } from '../constants';
import { safeReply } from '../commands';

const db = new Database('./store/nor_customs.db');

const initSchema = db.transaction(() => {
  // Ensure the players table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      discord_id TEXT PRIMARY KEY,
      discord_name TEXT NOT NULL,
      discord_global_name TEXT NOT NULL,
      discord_display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hots_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      hots_battle_tag TEXT NOT NULL, -- hots name including the # and number
      HP_url TEXT,
      HP_QM_MMR INTEGER,
      HP_SL_MMR INTEGER,
      HP_QM_Games INTEGER,
      HP_SL_Games INTEGER,
      HP_MMR INTEGER,
      \`SotS_Win_%\` REAL,
      SotS_Games INTEGER,
      SotS_Takedowns REAL,
      SotS_Kills REAL,
      SotS_Assists REAL,
      SotS_Deaths REAL,
      SotS_Kill_Participation REAL,
      SotS_KDA_Ratio REAL,
      SotS_Highest_Kill_Streak REAL,
      SotS_Vengeances REAL,
      SotS_Time_Dead TEXT,
      \`SotS_Time_Dead_%\` REAL,
      SotS_Deaths_While_Outnumbered REAL,
      SotS_Escapes REAL,
      SotS_Team_Fight_Escapes REAL,
      SotS_Hero_Damage REAL,
      SotS_DPM REAL,
      SotS_Physical_Damage REAL,
      SotS_Ability_Damage REAL,
      SotS_Damage_per_Death REAL,
      SotS_Team_Fight_Hero_Damage REAL,
      SotS_Siege_Damage REAL,
      SotS_Structure_Damage REAL,
      SotS_Minion_Damage REAL,
      SotS_Summon_Damage REAL,
      SotS_Creep_Damage REAL,
      SotS_Healing REAL,
      SotS_HPM REAL,
      SotS_Healing_per_Death REAL,
      SotS_Team_Fight_Healing REAL,
      SotS_Self_Healing REAL,
      SotS_Allied_Shields REAL,
      SotS_Clutch_Heals REAL,
      SotS_Damage_Taken REAL,
      SotS_Damage_Soaked REAL,
      SotS_Damage_Taken_per_Death REAL,
      SotS_Team_Fight_Damage_Taken REAL,
      SotS_CC_Time TEXT,
      SotS_Root_Time TEXT,
      SotS_Silence_Time TEXT,
      SotS_Stun_Time TEXT,
      SotS_Time_on_Fire TEXT,
      SotS_XP_Contribution REAL,
      SotS_XPM REAL,
      SotS_Merc_Camp_Captures REAL,
      SotS_Watch_Tower_Captures REAL,
      SotS_Aces REAL,
      SotS_Wipes REAL,
      \`SotS_%_of_Game_with_Level_Adv\` REAL,
      \`SotS_%_of_Game_with_Hero_Adv\` REAL,
      SotS_Passive_XP_Second REAL,
      SotS_Passive_XP_Gained REAL,
      SotS_Altar_Damage_Done REAL,
      SotS_Damage_to_Immortal REAL,
      SotS_Dragon_Knights_Captured REAL,
      SotS_Shrines_Captured REAL,
      SotS_Dubloons_Held_At_End REAL,
      SotS_Dubloons_Turned_In REAL,
      SotS_Skulls_Collected REAL,
      SotS_Shrine_Minion_Damage REAL,
      SotS_Plant_Damage REAL,
      SotS_Seeds_Collected REAL,
      SotS_Garden_Seeds_Collected REAL,
      SotS_Gems_Turned_In REAL,
      SotS_Nuke_Damage REAL,
      SotS_Curse_Damage REAL,
      SotS_Time_On_Temple TEXT,
      SotS_Damage_Done_to_Zerg REAL,
      SotS_Cage_Unlocks_Interrupted REAL,
      SotS_Hero_Pool INTEGER,
      SotS_Damage_Ratio REAL,
      \`SotS_%_of_Team_Damage\` REAL,
      \`SotS_%_of_Team_Damage_Taken\` REAL,
      \`SotS_%_of_Team_Damage_Healed\` REAL,
      \`SotS_%_of_Time_Slow_CC\` REAL,
      \`SotS_%_of_Time_Non-Slow_CC\` REAL,
      SotS_Votes INTEGER,
      SotS_Awards INTEGER,
      \`SotS_Award_%\` REAL,
      SotS_MVP INTEGER,
      \`SotS_MVP_%\` REAL,
      SotS_Bsteps INTEGER,
      SotS_Bstep_TD INTEGER,
      SotS_Bstep_Deaths INTEGER,
      SotS_Taunts INTEGER,
      SotS_Taunt_TD INTEGER,
      SotS_Taunt_Deaths INTEGER,
      SotS_Sprays INTEGER,
      SotS_Spray_TD INTEGER,
      SotS_Spray_Deaths INTEGER,
      SotS_Dances INTEGER,
      SotS_Dance_TD INTEGER,
      SotS_Dance_Deaths INTEGER
    )
  `);

  // Create an index for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_accounts_discord_id 
    ON hots_accounts(discord_id)
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_hots_battle_tag 
    ON hots_accounts(hots_battle_tag)
  `);
});

// Execute the transaction
try {
  initSchema();
} catch (error) {
  console.error('Error initializing database schema:', error);
}

/**
 * Saves a player to the local store.
 * If the player already exists, it updates their information.
 * @param discordId The Discord ID of the player.
 * @param player The Player object containing player information.
 * @param hotsBattleTag The Heroes of the Storm battle tag of the player.
 * @returns {void}
 */
export async function savePlayer(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  player: Player,
  hotsBattleTag?: string
): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO players (discord_id, discord_name, discord_global_name, discord_display_name, role, active)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      discord_name=excluded.discord_name,
      role=excluded.role,
      active=excluded.active
  `);
  stmt.run(
    discordId,
    player.usernames.discordName,
    player.usernames.discordGlobalName,
    player.usernames.discordDisplayName,
    player.role,
    player.active ? 1 : 0
  );
  if (!hotsBattleTag) {
    return;
  }
  // get the existing hots accounts for this player
  const accountsStmt = db.prepare<string, HotsAccountRow>(
    'SELECT id, hots_battle_tag, is_primary FROM hots_accounts WHERE discord_id = ?'
  );
  const existingAccounts = accountsStmt.all(discordId).map(account => getAccountFromAccountRow(account));
  if (existingAccounts.length < 2) {
    const hotsStmt = db.prepare(`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (?, ?,
        CASE
          WHEN (SELECT COUNT(*) FROM hots_accounts WHERE discord_id = ? AND is_primary = 1) = 0
          THEN 1
          ELSE 0
        END
      )
      ON CONFLICT(hots_battle_tag) DO UPDATE SET
        hots_battle_tag=excluded.hots_battle_tag,
        updated_at=CURRENT_TIMESTAMP
    `);
    hotsStmt.run(discordId, hotsBattleTag, discordId);
  } else {
    console.log('existingAccounts', existingAccounts);
    if (!interaction) return;
    if (existingAccounts.some(account => account.hotsBattleTag === hotsBattleTag)) {
      return; // No need to rename if the name is the same as an existing account
    }
    const adminRoleBtn = existingAccounts.map(account =>
      new ButtonBuilder()
        .setCustomId(`${CommandIds.RENAME_HOTS_ACCOUNT}_${account.id}_${hotsBattleTag}`)
        .setLabel(`$${account.hotsBattleTag}`)
        .setStyle(ButtonStyle.Secondary)
    );
    if (interaction.replied) {
      await interaction.followUp({
        content: `Which account should I rename to \`${hotsBattleTag}\`?`,
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...adminRoleBtn)],
      });
    } else {
      await safeReply(interaction, {
        content: `Which account should I rename to \`${hotsBattleTag}\`?`,
        flags: MessageFlags.Ephemeral,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(...adminRoleBtn)],
      });
    }
  }
}

export async function handleNameButtonCommand(
  interaction: ButtonInteraction<CacheType>,
  accountId: string,
  hotsBattleTag: string
): Promise<void> {
  const hotsStmt = db.prepare(`
    INSERT INTO hots_accounts (discord_id, hots_battle_tag)
    VALUES (?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      hots_battle_tag=excluded.hots_battle_tag,
      updated_at=CURRENT_TIMESTAMP
  `);
  hotsStmt.run(accountId, hotsBattleTag);
  // Find the account by ID
  const account = getPlayerByDiscordId(accountId);
  if (!account) {
    await safeReply(interaction, {
      content: 'Account not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await safeReply(interaction, {
    content: `Renamed account to ${hotsBattleTag}`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2);
    await writeFile('./store/players.tmp.json', data);
    await rename('./store/players.tmp.json', './store/players.json');
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

function getPlayerFromRow(row: FlatPlayer, accounts: HotsAccountRow[]): Player {
  return {
    discordId: row.discord_id,
    usernames: {
      accounts: accounts
        .filter(account => account.discord_id === row.discord_id)
        .map(account => getAccountFromAccountRow(account)),
      discordName: row.discord_name,
      discordGlobalName: row.discord_global_name,
      discordDisplayName: row.discord_display_name,
    },
    role: row.role,
    active: row.active === 1,
    team: row.team ?? undefined, // Ensure team is undefined if null
  };
}

function getAccountFromAccountRow(account: HotsAccountRow): HotsAccount {
  return {
    id: account.id,
    hotsBattleTag: account.hots_battle_tag,
    isPrimary: !!account.is_primary,
  };
}

/**
 * Retrieves all active players from the database.
 * @returns Map<string, Player> a Map of active players, where the key is the Discord ID and the value is the Player object.
 */
export function getActivePlayers(): Player[] {
  const stmt = db.prepare<[], FlatPlayer>('SELECT * FROM players WHERE active = 1 ORDER BY active, team;');
  const rows: FlatPlayer[] = stmt.all();
  const accountsStmt = db.prepare<[], HotsAccountRow>(
    'SELECT discord_id, hots_battle_tag, is_primary FROM hots_accounts;'
  );
  const accounts = accountsStmt.all();
  return rows.map<Player>(row => getPlayerFromRow(row, accounts));
}

export async function handleAddHotsAccount(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  const battleTagRegex = /^.+#\d+$/;
  if (!battleTagRegex.test(hotsBattleTag)) {
    await safeReply(interaction, {
      content: 'You must provide a valid Heroes of the Storm battle tag in the format Name#1234.',
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  //check if the hots account is already in use by another player
  const existingAccountStmt = db.prepare<string[], HotsAccount & { discord_id: string }>(
    'SELECT discord_id, hots_battle_tag FROM hots_accounts WHERE hots_battle_tag = ? AND discord_id != ?'
  );
  const existingAccount = existingAccountStmt.get(hotsBattleTag, discordId);
  if (existingAccount) {
    await safeReply(interaction, {
      content: `This HotS account is already in use by another player: <@${existingAccount.discord_id}>\nare you sure this is your account...`,
      files: [
        {
          attachment: 'https://i.giphy.com/media/hPkJ9Q7dh6itMoMIMC/giphy.gif',
          name: 'is it.gif',
        },
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const player = getPlayerByDiscordId(discordId);
  console.log('player', JSON.stringify(player, null, 2));
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found',
      flags: MessageFlags.Ephemeral,
    });
    return false; // Player not found
  }

  // check if the player already has this hots account
  const hasAccount = player.usernames.accounts?.some(account => account.hotsBattleTag === hotsBattleTag);
  if (hasAccount) {
    await safeReply(interaction, {
      content: `${
        discordId === player.discordId ? 'You' : `<@${discordId}>`
      } already have this HotS account linked: \`${hotsBattleTag}\``,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const hotsAccountStmt = db.prepare(
    'INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary) VALUES (?, ?, ?)'
  );
  hotsAccountStmt.run(
    discordId,
    hotsBattleTag,
    player.usernames.accounts && player.usernames.accounts.length === 0 ? 1 : 0
  );
  await safeReply(interaction, {
    content: `Your HotS account has been added: \`${hotsBattleTag}\``,
    flags: MessageFlags.Ephemeral,
  });
  return player;
}

/**
 * Marks all players as inactive in the database.
 * @returns void
 */
export function markAllPlayersInactive(): void {
  const stmt = db.prepare('UPDATE players SET active = 0, team = NULL WHERE active = 1 OR team IS NOT NULL');
  stmt.run();
}

/**
 * Mark this player as inactive in the database.
 * @param discordId The Discord ID of the player to mark as inactive.
 * @returns boolean true if the player was found and marked inactive, false otherwise.
 */
export function markPlayerInactive(discordId: string): false | Player {
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false;
  }
  const stmt = db.prepare('UPDATE players SET active = 0 WHERE discord_id = ?');
  stmt.run(discordId);
  player.active = false;
  return player;
}

/**
 * Marks a player as active in the database.
 * @param discordId The Discord ID of the player to mark as active.
 * @returns Player object if the player was found and marked active, false otherwise, true if the player was already active.
 */
export function markPlayerActive(discordId: string): { alreadyActive: boolean; player: Player | undefined } {
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return { alreadyActive: false, player: undefined }; // Player not found
  }
  if (player?.active) {
    return { alreadyActive: true, player }; // Player already active
  }
  const stmt = db.prepare('UPDATE players SET active = 1 WHERE discord_id = ?');
  stmt.run(discordId);
  player.active = true;
  return { alreadyActive: false, player };
}

/**
 * Gets a player by their Discord ID.
 * @param discordId The Discord ID of the player to retrieve.
 * @returns Player object if found, undefined otherwise.
 */
export function getPlayerByDiscordId(discordId: string): Player | undefined {
  const stmt = db.prepare<[string], FlatPlayer>('SELECT * FROM players WHERE discord_id = ?');
  const row: FlatPlayer | undefined = stmt.get(discordId);
  if (!row) {
    return undefined; // Player not found
  }
  const accountsStmt = db.prepare<string[], HotsAccountRow>(
    'SELECT id, discord_id, hots_battle_tag, is_primary FROM hots_accounts WHERE discord_id = ?'
  );
  const accounts = accountsStmt.all(discordId);

  return getPlayerFromRow(row, accounts);
}

/**
 * Sets the player role in the database.
 * @param discordId The Discord ID of the player to set the role for.
 * @param role The role to set for the player.
 * @returns Player object if the player was found and the role was set, false otherwise.
 */
export function setPlayerRole(discordId: string, role: string | null): false | Player {
  if (!role) {
    return false; // Invalid role
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare('UPDATE players SET role = ? WHERE discord_id = ?');
  stmt.run(role, discordId);
  player.role = role;
  return player;
}

/**
 * Changes the player's hots name in the database.
 * @param interaction The interaction object from Discord, either a ChatInputCommandInteraction or ButtonInteraction.
 * @param discordId The Discord ID of the player to change the name for.
 * @param hotsBattleTag The new Heroes of the Storm name for the player.
 * @returns Player object if the player was found and the name was changed, false otherwise.
 */
export function setPlayerName(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string
): false | Player {
  if (!hotsBattleTag) {
    return false; // Invalid name
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  savePlayer(interaction, discordId, player, hotsBattleTag);
  return player;
}

/**
 * Sets the Discord user names for a player in the database.
 * @param discordId The Discord ID of the player to set Discord names for.
 * @param discordData The Discord user names data to set for the player.
 * @returns boolean true if the player was found and the names were set, false otherwise.
 */
export function setPlayerDiscordNames(discordId: string, discordData: DiscordUserNames) {
  const { discordName, discordGlobalName, discordDisplayName } = discordData;
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return false; // Player not found
  }
  const stmt = db.prepare(`
    UPDATE players
    SET discord_name = ?, discord_global_name = ?, discord_display_name = ?
    WHERE discord_id = ?
  `);
  stmt.run(discordName, discordGlobalName, discordDisplayName, discordId);
  return true;
}

/**
 * Sets the active status of a player in the database.
 * @param discordId The Discord ID of the player to set active status for.
 * @param active Whether the player should be set as active (true) or inactive (false).
 * @returns ({ updated: boolean; player?: Player }) An object indicating whether the player was updated and the updated player object if applicable.
 * If the player was not found, updated will be false and player will be undefined.
 */
export function setPlayerActive(discordId: string, active: boolean): { updated: boolean; player?: Player } {
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return { updated: false, player }; // Player not found
  }
  if (player.active === active) {
    return { updated: false, player }; // No change needed
  }
  const stmt = db.prepare('UPDATE players SET active = ? WHERE discord_id = ?');
  stmt.run(active ? 1 : 0, discordId);
  player.active = active;
  return { updated: true, player };
}

/**
 * clears the team assignments for all players in the database.
 * This sets the team field to NULL for all players.
 * @returns void
 */
export function clearTeams(): void {
  const stmt = db.prepare('UPDATE players SET team = NULL');
  stmt.run();
}

/**
 * sets the team for all players in the database.
 * @returns void
 */
export function setTeams(team1Ids: string[], team2Ids: string[]): void {
  const transaction = db.transaction(() => {
    const clearStmt = db.prepare('UPDATE players SET team = NULL');
    const stmts1 = db.prepare(`UPDATE players SET team = ? WHERE discord_id IN ('${team1Ids.join("', '")}')`);
    const stmts2 = db.prepare(`UPDATE players SET team = ? WHERE discord_id IN ('${team2Ids.join("', '")}')`);
    clearStmt.run();
    stmts1.run(1);
    stmts2.run(2);
  });
  transaction();
}

/**
 * Retrieves the teams from the database.
 * This function queries the players table for all players with a non-null team assignment,
 * and organizes them into two separate arrays based on their team number.
 * @returns An object containing two arrays: team1 and team2, each containing Player objects for the respective teams.
 */
export function getTeams(): { team1: Player[]; team2: Player[] } {
  const stmt = db.prepare<[], FlatPlayer>('SELECT * FROM players WHERE team IS NOT NULL');
  const rows: FlatPlayer[] = stmt.all();
  // select all hots accounts by first joining to the players where team is not null, then getting all accounts where is_primary = 1
  const accountsStmt = db.prepare<[], HotsAccountRow>(
    'SELECT discord_id, hots_battle_tag, is_primary FROM hots_accounts WHERE is_primary = 1;'
  );
  const accounts = accountsStmt.all();
  const team1: Player[] = [];
  const team2: Player[] = [];
  rows.forEach(row => {
    const player: Player = getPlayerFromRow(row, accounts);
    if (row.team === 1) {
      team1.push(player);
    } else if (row.team === 2) {
      team2.push(player);
    }
  });
  return { team1, team2 };
}

export async function loadPlayerDataIntoSqlite(): Promise<Player[] | undefined> {
  interface PlayerJSON extends Omit<Player, 'team'> {
    team: number | null;
  }
  try {
    const data = await import('./players.json');
    const playersMap = new Map<string, PlayerJSON>(Object.entries(data.default ?? {}));
    // transfer the loaded players to the sqlite database
    // const adaptedPlayersMap = Array.from(playersMap).map((player, discordId) => {
    const adaptedPlayersMap = Array.from(playersMap.entries()).map(([discordId, player]) => {
      const playerData: Player = {
        ...player,
        usernames: {
          ...player.usernames,
        },
        discordId,
        team: player.team ?? undefined, // Ensure team is undefined if null
      };
      const accounts = player.usernames.accounts ?? [];
      savePlayer(undefined, discordId, playerData, accounts[0]?.hotsBattleTag ?? '');
      return playerData;
    });
    return adaptedPlayersMap;
  } catch (error) {
    console.error('Error loading player data:', error);
    throw error; // Re-throw the error to handle it upstream
  }
}
