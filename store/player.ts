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
  InteractionReplyOptions,
  MessageFlags,
  ModalSubmitInteraction,
} from 'discord.js';
import { safeReply } from '../commands';
import { CommandIds } from '../constants';
import { getHeroesProfileData } from './heroesProfile';
import { ColumnDefinition, HOTS_ACCOUNTS_COLUMNS } from '../types/csvSpreadsheet';

const db = new Database('./store/nor_customs.db');

export const interactionStore = new Map<
  string,
  ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
>();

const initSchema = db.transaction(() => {
  // Ensure the players table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      discord_id TEXT PRIMARY KEY,
      discord_name TEXT NOT NULL,
      discord_global_name TEXT NOT NULL,
      discord_display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      active INTEGER NOT NULL,
      team INTEGER CHECK(team IN (1, 2, 3)),
      draft_rank INTEGER,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Helper function to generate CREATE TABLE SQL from column definitions
  function generateCreateTableSQL(tableName: string, columns: ColumnDefinition[]): string {
    const columnDefinitions = columns
      .map(col => {
        let definition = `${col.name} ${col.type}`;

        if (col.primaryKey) definition += ' PRIMARY KEY';
        if (col.autoIncrement) definition += ' AUTOINCREMENT';
        if (col.nullable === false) definition += ' NOT NULL';
        if (col.unique) definition += ' UNIQUE';
        if (col.defaultValue !== undefined) {
          if (typeof col.defaultValue === 'string' && col.defaultValue !== 'CURRENT_TIMESTAMP') {
            definition += ` DEFAULT '${col.defaultValue}'`;
          } else {
            definition += ` DEFAULT ${col.defaultValue}`;
          }
        }

        return definition;
      })
      .join(',\n      ');

    return `CREATE TABLE IF NOT EXISTS ${tableName} (\n      ${columnDefinitions}\n    )`;
  }

  const createHotsAccountsSQL = generateCreateTableSQL('hots_accounts', HOTS_ACCOUNTS_COLUMNS);
  db.exec(createHotsAccountsSQL);

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
 * Stores an interaction in the interaction store.
 * @param messageId The ID of the message associated with the interaction.
 * @param channelId The ID of the channel where the interaction occurred.
 * @param interaction The interaction object to store.
 */
export function storeInteraction(
  messageId: string,
  channelId: string,
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>
) {
  const key = getInteractionKey(messageId, channelId);
  interactionStore.set(key, interaction);
}

/**
 * Removes a stored interaction from the interaction store.
 * @param messageId The ID of the message associated with the interaction.
 * @param channelId The ID of the channel where the interaction occurred.
 * @return {void}
 */
export function removeInteraction(messageId: string, channelId: string): void {
  const key = getInteractionKey(messageId, channelId);
  interactionStore.delete(key);
}

/**
 * Retrieves a stored interaction from the interaction store.
 * @param messageId The ID of the message associated with the interaction.
 * @param channelId The ID of the channel where the interaction occurred.
 * @returns The stored interaction object, or undefined if not found.
 */
export function getStoredInteraction(
  messageId: string,
  channelId: string
): ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | undefined {
  const key = getInteractionKey(messageId, channelId);
  return interactionStore.get(key);
}

function getInteractionKey(messageId: string, channelId: string): string {
  return `${channelId}-${messageId}`;
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
      discord_global_name=excluded.discord_global_name,
      discord_display_name=excluded.discord_display_name,
      role=excluded.role,
      active=excluded.active,
      last_active=CASE WHEN excluded.active = 1 THEN CURRENT_TIMESTAMP ELSE last_active END
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
  // handle adding the hots account for this player
  await handleAddHotsAccount(interaction, discordId, hotsBattleTag);
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
  const accountsNew = accounts
    .filter(account => account.discord_id === row.discord_id)
    .map(account => getAccountFromAccountRow(account));
  return {
    discordId: row.discord_id,
    usernames: {
      accounts: accountsNew,
      discordName: row.discord_name,
      discordGlobalName: row.discord_global_name,
      discordDisplayName: row.discord_display_name,
    },
    role: row.role,
    active: row.active === 1,
    team: row.team ?? undefined, // Ensure team is undefined if null
    draftRank: row.draft_rank ?? NaN,
    mmr: accountsNew.reduce(
      (max: number | null, account) =>
        // find the highest MMR including both QM and SL
        Math.max(max ?? 0, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0),
      0
    ),
  };
}

function getAccountFromAccountRow(account: HotsAccountRow): HotsAccount {
  return {
    id: account.id,
    hotsBattleTag: account.hots_battle_tag,
    isPrimary: !!account.is_primary,
    hpQmMMR: account.HP_QM_MMR,
    hpSlMMR: account.HP_SL_MMR,
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
    'SELECT discord_id, hots_battle_tag, is_primary, HP_QM_MMR, HP_SL_MMR FROM hots_accounts;'
  );
  const accounts = accountsStmt.all();
  return rows.map<Player>(row => getPlayerFromRow(row, accounts));
}

export async function handleAddHotsAccount(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
): Promise<false | Player> {
  const battleTagRegex = /^.+#\d+$/;
  if (!battleTagRegex.test(hotsBattleTag)) {
    await safeReply(interaction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\``,
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
      content: `This HotS account is already in use by another player: <@${
        existingAccount.discord_id
      }>\nare you sure this is ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"} account...`,
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
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found',
      flags: MessageFlags.Ephemeral,
    });
    return false; // Player not found
  }

  try {
    await interaction?.deferReply({ flags: MessageFlags.Ephemeral, withResponse: true });
  } catch (error) {
    if (!error) {
      console.error('Error deferring reply:', error);
    }
  }
  // await interaction?.editReply({
  //   content:
  //     '🔍 Fetching Heroes Profile data... This may take 30-60 seconds.\n<a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004>',
  // });
  // get their heroes profile data
  const profileData = await getHeroesProfileData(hotsBattleTag);
  if (!profileData) {
    await safeReply(interaction, {
      content: `Failed to retrieve Heroes profile data for \`${hotsBattleTag}\`.\nAre you sure you typed it right?`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  // check if the player already has this hots account
  const hasAccount = player.usernames.accounts?.some(
    account => account.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase()
  );
  if (hasAccount) {
    const userIsSelf = discordId === interaction?.user.id;
    //update their heroes profile data anyway
    const updateProfileStmt = db.prepare(
      `UPDATE hots_accounts SET
        HP_Region = ?,
        HP_Blizz_ID = ?,
        HP_QM_MMR = ?,
        HP_SL_MMR = ?,
        HP_QM_Games = ?,
        HP_SL_Games = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE discord_id = ? AND hots_battle_tag = ?`
    );
    updateProfileStmt.run(
      profileData.region,
      profileData.blizz_id,
      profileData.qmMmr,
      profileData.slMmr,
      profileData.qmGames,
      profileData.slGames,
      discordId,
      hotsBattleTag
    );
    await interaction?.editReply({
      content: `${userIsSelf ? 'You' : '<@' + discordId + '>'} already ${
        userIsSelf ? 'have' : 'has'
      } this HotS account linked: \`${
        player.usernames.accounts?.find(account => account.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
          ?.hotsBattleTag
      }\`\n\nHowever, ${userIsSelf ? 'your' : '<@' + discordId + '>' + "'s"} Heroes profile data has been updated.`,
    });
    return false;
  }

  const hotsAccountStmt = db.prepare(
    'INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary, HP_Region, HP_Blizz_ID, HP_QM_MMR, HP_SL_MMR, HP_QM_Games, HP_SL_Games) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  hotsAccountStmt.run(
    discordId,
    hotsBattleTag,
    player.usernames.accounts && player.usernames.accounts.length === 0 ? 1 : 0,
    profileData.region,
    profileData.blizz_id,
    profileData.qmMmr,
    profileData.slMmr,
    profileData.qmGames,
    profileData.slGames
  );
  await safeReply(interaction, {
    content: `${
      discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
    } HotS account has been added: \`${hotsBattleTag}\``,
    flags: MessageFlags.Ephemeral,
  });
  return player;
}

export async function setPrimaryAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string,
  messageId: string,
  channelId: string
) {
  const { success, message, player } = await updatePrimaryAccountInDb(discordId, hotsBattleTag);
  if (!success || !player?.usernames.accounts) {
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    });
    return false; // Failed to set primary account
  }

  // Handle non-button interactions (slash commands)
  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: `${
        discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
      } primary HotS account has been set to \`${hotsBattleTag}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return true; // Primary account set successfully
  }
  const buttonUpdateSuccess = await updateButtonInterface(interaction, player, discordId, messageId, channelId);
  if (!buttonUpdateSuccess.success) {
    await safeReply(interaction, {
      ...buttonUpdateSuccess.messageOptions,
      flags: MessageFlags.Ephemeral,
    });
    return false; // Failed to update button interface
  }

  return true;
}

async function updateButtonInterface(
  interaction: ButtonInteraction<CacheType>,
  player: Player,
  discordId: string,
  messageId: string,
  channelId: string
): Promise<{ success: boolean; messageOptions: InteractionReplyOptions }> {
  const accounts = player.usernames.accounts;
  if (!accounts?.length) {
    return { success: false, messageOptions: { content: 'No accounts to update' } };
  }
  // Try to delete the original message with proper error handling
  try {
    const prevInteraction = getStoredInteraction(messageId, channelId);
    if (!prevInteraction) {
      throw new Error('Previous interaction not found');
    }
    await prevInteraction.editReply({
      components: getAccountButtons(accounts, discordId, messageId, channelId),
    });
    await interaction.deferUpdate(); // Acknowledge the button interaction without showing loading
    return { success: true, messageOptions: { content: '' } };
  } catch (error: unknown) {
    removeInteraction(messageId, channelId); // if we can't find the interaction, remove it from the store
    console.error('Error updating button interface:', error);
    const message = await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    storeInteraction(message.id, interaction.channelId, interaction);
    await safeReply(interaction, {
      content:
        'Previous interaction not found to update buttons\nPlease select the account to set as primary using the buttons below.',
      components: getAccountButtons(accounts, discordId, message.id, channelId),
    });
    return { success: true, messageOptions: { content: '' } };
  }
}

/**
 * get the account buttons for a player
 * @param player the player to get the buttons for
 * @param discordId the discord id of the player
 * @param messageId the message id where the buttons will be displayed
 * @param channelId the channel id where the buttons will be displayed
 */
export function getAccountButtons(
  accounts: HotsAccount[],
  discordId: string,
  messageId: string,
  channelId: string
): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = accounts.map(account => {
    return new ButtonBuilder()
      .setCustomId(
        `${CommandIds.ADMIN}_${CommandIds.PRIMARY}_${discordId}_${account.hotsBattleTag}_${messageId}_${channelId}`
      )
      .setLabel(account.hotsBattleTag)
      .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary);
  });
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)];
}

/**
 * Updates the primary Heroes of the Storm account for a player in the database.
 * @param discordId The Discord ID of the player.
 * @param hotsBattleTag The Heroes of the Storm battle tag to set as primary.
 * @returns An object containing the success status, optional error message, and updated player data.
 */
async function updatePrimaryAccountInDb(
  discordId: string,
  hotsBattleTag: string
): Promise<{ success: boolean; message?: string; player?: Player }> {
  const stmt = db.prepare(
    'UPDATE hots_accounts SET is_primary = CASE WHEN hots_battle_tag = ? THEN 1 ELSE 0 END WHERE discord_id = ?'
  );
  const result = stmt.run(hotsBattleTag, discordId);
  if (result.changes === 0) {
    return {
      success: false,
      message: `The specified Heroes of the Storm account \`${hotsBattleTag}\` was not found for this player.`,
    };
  }
  const player = getPlayerByDiscordId(discordId);
  if (!player) {
    return {
      success: false,
      message: 'Player not found',
    };
  }
  if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    return {
      success: false,
      message: 'This player has no Heroes of the Storm accounts linked.',
    };
  }
  return { success: true, player };
}

/**
 * Marks all players as inactive in the database.
 * @returns void
 */
export function markAllPlayersInactive(): void {
  const stmt = db.prepare(
    'UPDATE players SET active = 0, team = NULL, draft_rank = NULL WHERE active = 1 OR team IS NOT NULL'
  );
  stmt.run();
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
  const stmt = db.prepare(
    `UPDATE players SET active = ?${active ? ', last_active = CURRENT_TIMESTAMP' : ''} WHERE discord_id = ?`
  );
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
  const stmt = db.prepare('UPDATE players SET team = NULL, draft_rank = NULL');
  stmt.run();
}

/**
 * Sets the teams for the players in the database using player objects.
 * This function first clears any existing team assignments and draft ranks,
 * then assigns players to team 1 and team 2 based on the provided arrays.
 * @param team1 Array of Player objects for team 1.
 * @param team2 Array of Player objects for team 2.
 * @returns void
 */
export function setTeamsFromPlayers(
  team1: { player: Player; index: number }[],
  team2: { player: Player; index: number }[],
  spectators: { player: Player; index: number }[]
): void {
  const transaction = db.transaction(() => {
    const clearStmt = db.prepare('UPDATE players SET team = NULL, draft_rank = NULL');
    clearStmt.run();
    team1.forEach(p => {
      const updateStmt = db.prepare('UPDATE players SET team = ?, draft_rank = ? WHERE discord_id = ?');
      updateStmt.run(1, p.index, p.player.discordId);
    });
    team2.forEach(p => {
      const updateStmt = db.prepare('UPDATE players SET team = ?, draft_rank = ? WHERE discord_id = ?');
      updateStmt.run(2, p.index, p.player.discordId);
    });
    spectators.forEach(p => {
      const updateStmt = db.prepare('UPDATE players SET team = ?, draft_rank = ? WHERE discord_id = ?');
      updateStmt.run(null, p.index, p.player.discordId);
    });
  });
  transaction();
}

export function changeTeams(playerChanges: { playerId: string; newTeam: number | null }[]): boolean {
  const transaction = db.transaction(() => {
    playerChanges.forEach(({ playerId, newTeam }) => {
      const stmt = db.prepare('UPDATE players SET team = ? WHERE discord_id = ?');
      stmt.run(newTeam, playerId);
    });
  });
  transaction();
  return true;
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
    'SELECT discord_id, hots_battle_tag, is_primary, HP_QM_MMR, HP_SL_MMR FROM hots_accounts WHERE is_primary = 1;'
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
  team1.sort((a, b) => (a.draftRank ?? 0) - (b.draftRank ?? 0));
  team2.sort((a, b) => (a.draftRank ?? 0) - (b.draftRank ?? 0));
  return { team1, team2 };
}

export async function loadPlayerDataIntoSqlite() {
  //: Promise<Player[] | undefined> {
  interface PlayerJSON extends Omit<Player, 'team'> {
    team: number | null;
  }
  // try {
  //   const data = await import('./players.json');
  //   const playersMap = new Map<string, PlayerJSON>(Object.entries(data.default ?? {}));
  //   // transfer the loaded players to the sqlite database
  //   // const adaptedPlayersMap = Array.from(playersMap).map((player, discordId) => {
  //   const adaptedPlayersMap = Array.from(playersMap.entries()).map(([discordId, player]) => {
  //     const playerData: Player = {
  //       ...player,
  //       usernames: {
  //         ...player.usernames,
  //       },
  //       discordId,
  //       team: player.team ?? undefined, // Ensure team is undefined if null
  //     };
  //     const accounts = player.usernames.accounts ?? [];
  //     savePlayer(undefined, discordId, playerData, accounts[0]?.hotsBattleTag ?? '');
  //     return playerData;
  //   });
  //   return adaptedPlayersMap;
  // } catch (error) {
  //   console.error('Error loading player data:', error);
  //   throw error; // Re-throw the error to handle it upstream
  // }
}
