import { writeFile, rename } from 'fs/promises'
import Database from 'better-sqlite3'
import { AccountSubstitution, AccountSubstitutionRow, DiscordUserNames, FlatPlayer, HotsAccount, HotsAccountRow, Player } from '../types/player'
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
} from 'discord.js'
import { updateLobbyMessage } from '../commands'
import { CommandIds, roleMap } from '../constants'
import { getHeroesProfileData } from './heroesProfile'
import { requireGuildId, safeReply, safeDeferUpdate } from '../utils/interaction'
import { validateBattleTag } from '../utils/heroesOfTheStorm'

const db = new Database('./store/nor_customs.db')
db.pragma('foreign_keys = ON')

export const interactionStore = new Map<string, ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>>()

const initSchema = db.transaction(() => {
  const playerCols = db.prepare<[], { name: string }>('PRAGMA table_info(players)').all()
  if (playerCols.length > 0 && playerCols.some(c => c.name === 'active')) {
    // migrate old players table to new players table without the columns: active, team, lobby_rank, draft_order
    db.exec('ALTER TABLE players RENAME TO players_old')
    db.exec(`
      CREATE TABLE players (
        discord_id TEXT PRIMARY KEY,
        discord_name TEXT NOT NULL,
        discord_global_name TEXT NOT NULL,
        discord_display_name TEXT NOT NULL,
        role TEXT,
        adjustment INTEGER,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    db.exec(`
      INSERT INTO players (discord_id, discord_name, discord_global_name, discord_display_name, role, adjustment, last_active)
      SELECT discord_id, discord_name, discord_global_name, discord_display_name, role, adjustment, last_active FROM players_old
    `)
    db.exec('DROP TABLE players_old')
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        discord_id TEXT PRIMARY KEY,
        discord_name TEXT NOT NULL,
        discord_global_name TEXT NOT NULL,
        discord_display_name TEXT NOT NULL,
        role TEXT,
        adjustment INTEGER,
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lobby_players (
      guild_id TEXT NOT NULL DEFAULT 'global',
      discord_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      team INTEGER CHECK(team IN (1, 2, NULL)),
      lobby_rank INTEGER,
      draft_order INTEGER,
      PRIMARY KEY (guild_id, discord_id),
      FOREIGN KEY (discord_id) REFERENCES players(discord_id) ON DELETE CASCADE
    )
  `)

  interface TableInfoCol {
    cid: number
    name: string
    type: string
    notnull: number
    dflt_value: string | null
    pk: number
  }

  const hotsAccountCols = db.prepare<[], TableInfoCol>('PRAGMA table_info(hots_accounts)').all()
  if (hotsAccountCols.length > 0 && !hotsAccountCols.some(c => c.name === 'real_id_name')) {
    db.exec('ALTER TABLE hots_accounts ADD COLUMN real_id_name TEXT')
  }
  if (hotsAccountCols.length > 0 && !hotsAccountCols.some(c => c.name === 'owner_discord_id')) {
    db.exec('ALTER TABLE hots_accounts ADD COLUMN owner_discord_id TEXT')
  }

  // Check if discord_id in hots_accounts has NOT NULL constraint and migrate if needed
  const discordIdCol = hotsAccountCols.find(c => c.name === 'discord_id')
  if (discordIdCol && discordIdCol.notnull === 1) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('ALTER TABLE hots_accounts RENAME TO hots_accounts_old')
    interface SqlRow {
      sql: string
    }
    const oldSqlRow = db
      .prepare<[string], SqlRow>("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?")
      .get('hots_accounts_old')
    if (oldSqlRow) {
      let newSql = oldSqlRow.sql.replace('hots_accounts_old', 'hots_accounts')
      newSql = newSql.replace('discord_id TEXT NOT NULL', 'discord_id TEXT')
      db.exec(newSql)
      const currentCols = db.prepare<[], TableInfoCol>('PRAGMA table_info(hots_accounts_old)').all()
      const colNames = currentCols.map(c => c.name).join(', ')
      db.exec(`INSERT INTO hots_accounts (${colNames}) SELECT ${colNames} FROM hots_accounts_old`)
      db.exec('DROP TABLE hots_accounts_old')
    }
    db.exec('PRAGMA foreign_keys = ON')
  }

  // Check if lobby_players needs migration to support non-Discord players and roles
  const lobbyPlayerCols = db.prepare<[], TableInfoCol>('PRAGMA table_info(lobby_players)').all()
  const lobbyNeedsMigration =
    lobbyPlayerCols.length > 0 &&
    (!lobbyPlayerCols.some(c => c.name === 'hots_account_id') ||
      !lobbyPlayerCols.some(c => c.name === 'role') ||
      lobbyPlayerCols.find(c => c.name === 'discord_id')?.notnull === 1)

  if (lobbyNeedsMigration) {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('ALTER TABLE lobby_players RENAME TO lobby_players_old')
    db.exec(`
      CREATE TABLE lobby_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL DEFAULT 'global',
        discord_id TEXT,
        hots_account_id INTEGER,
        active INTEGER NOT NULL DEFAULT 0,
        team INTEGER CHECK(team IN (1, 2, NULL)),
        lobby_rank INTEGER,
        draft_order INTEGER,
        role TEXT
      )
    `)
    const oldCols = lobbyPlayerCols.map(c => c.name)
    const colsToCopy = ['guild_id', 'discord_id', 'active', 'team', 'lobby_rank', 'draft_order']
    if (oldCols.includes('hots_account_id')) colsToCopy.push('hots_account_id')
    if (oldCols.includes('role')) colsToCopy.push('role')
    const colList = colsToCopy.join(', ')
    db.exec(`
      INSERT INTO lobby_players (${colList})
      SELECT ${colList} FROM lobby_players_old
    `)
    db.exec('DROP TABLE lobby_players_old')
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_discord 
      ON lobby_players(guild_id, discord_id);
    `)
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_account 
      ON lobby_players(guild_id, hots_account_id);
    `)
    // Backfill hots_account_id for existing rows
    db.exec(`
      UPDATE lobby_players 
      SET hots_account_id = (
        SELECT id FROM hots_accounts 
        WHERE discord_id = lobby_players.discord_id 
        ORDER BY is_primary DESC, id ASC 
        LIMIT 1
      )
      WHERE hots_account_id IS NULL AND discord_id IS NOT NULL;
    `)
    // Backfill role for existing rows
    db.exec(`
      UPDATE lobby_players 
      SET role = (
        SELECT role FROM players 
        WHERE discord_id = lobby_players.discord_id 
        LIMIT 1
      )
      WHERE role IS NULL AND discord_id IS NOT NULL;
    `)
    db.exec('PRAGMA foreign_keys = ON')
  }

  // Ensure lobby_players has clean unique indexes for upserts
  db.exec('DROP INDEX IF EXISTS idx_lobby_players_guild_discord;')
  db.exec('DROP INDEX IF EXISTS idx_lobby_players_guild_account;')
  db.exec(`
    DELETE FROM lobby_players 
    WHERE id NOT IN (
      SELECT MAX(id) FROM lobby_players WHERE discord_id IS NOT NULL GROUP BY guild_id, discord_id
    ) AND discord_id IS NOT NULL;
  `)
  db.exec(`
    DELETE FROM lobby_players 
    WHERE id NOT IN (
      SELECT MAX(id) FROM lobby_players WHERE hots_account_id IS NOT NULL GROUP BY guild_id, hots_account_id
    ) AND hots_account_id IS NOT NULL;
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_discord 
    ON lobby_players(guild_id, discord_id);
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_lobby_players_guild_account 
    ON lobby_players(guild_id, hots_account_id);
  `)

  // Create an index for better performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hots_accounts_discord_id 
    ON hots_accounts(discord_id)
  `)

  db.exec('DROP INDEX IF EXISTS idx_unique_hots_battle_tag;')

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_discord_hots_battle_tag 
    ON hots_accounts(discord_id, hots_battle_tag COLLATE NOCASE)
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_owner_battle_tag 
    ON hots_accounts(hots_battle_tag COLLATE NOCASE) WHERE owner_discord_id IS NULL
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS account_substitutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      hots_battle_tag TEXT NOT NULL,
      original_discord_id TEXT NOT NULL,
      substitute_discord_id TEXT NOT NULL,
      replay_id INTEGER,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      is_active INTEGER NOT NULL DEFAULT 1
    )
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_account_substitutions_lookup 
    ON account_substitutions(guild_id, hots_battle_tag COLLATE NOCASE, is_active)
  `)
})

// Execute the transaction
try {
  initSchema()
} catch (error) {
  console.error('Error initializing database schema:', error)
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
  const key = getInteractionKey(messageId, channelId)
  interactionStore.set(key, interaction)
}

/**
 * Removes a stored interaction from the interaction store.
 * @param messageId The ID of the message associated with the interaction.
 * @param channelId The ID of the channel where the interaction occurred.
 * @return {void}
 */
export function removeInteraction(messageId: string, channelId: string): void {
  const key = getInteractionKey(messageId, channelId)
  interactionStore.delete(key)
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
  const key = getInteractionKey(messageId, channelId)
  return interactionStore.get(key)
}

function getInteractionKey(messageId: string, channelId: string): string {
  return `${channelId}-${messageId}`
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
    INSERT INTO players (discord_id, discord_name, discord_global_name, discord_display_name, role)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      discord_name=excluded.discord_name,
      discord_global_name=excluded.discord_global_name,
      discord_display_name=excluded.discord_display_name,
      role=excluded.role,
      last_active=CURRENT_TIMESTAMP
  `)
  stmt.run(
    discordId,
    player.usernames.discordName,
    player.usernames.discordGlobalName,
    player.usernames.discordDisplayName,
    player.role
  )
  if (!hotsBattleTag) {
    return
  }
  // handle adding the hots account for this player
  await handleAddHotsAccount(interaction, discordId, hotsBattleTag)
}

export async function savePlayerData(players: Map<string, Player>): Promise<void> {
  try {
    const data = JSON.stringify(Object.fromEntries(players), null, 2)
    await writeFile('./store/players.tmp.json', data)
    await rename('./store/players.tmp.json', './store/players.json')
  } catch (error) {
    console.error('Error saving player data:', error)
  }
}

/**
 * Converts a database row into a Player object
 * @param flatPlayer The database row
 * @param hotsAccountsRow The database rows for the player's HotS accounts
 * @returns The Player object
 */
function getPlayerFromRow(flatPlayer: FlatPlayer, hotsAccountsRow: HotsAccountRow[]): Player {
  const accountsNew = hotsAccountsRow
    .filter(account => {
      if (flatPlayer.discord_id) {
        return account.discord_id === flatPlayer.discord_id
      }
      if (flatPlayer.hots_battle_tag) {
        return account.hots_battle_tag.toLowerCase() === flatPlayer.hots_battle_tag.toLowerCase()
      }
      return false
    })
    .map(account => getAccountFromAccountRow(account))

  return {
    discordId: flatPlayer.discord_id,
    usernames: {
      accounts: accountsNew,
      discordName: flatPlayer.discord_name,
      discordGlobalName: flatPlayer.discord_global_name,
      discordDisplayName: flatPlayer.discord_display_name,
    },
    role: flatPlayer.role,
    active: flatPlayer.active === 1,
    team: flatPlayer.team ?? null, // team can be null
    lobbyRank: flatPlayer.lobby_rank ?? NaN,
    draftOrder: flatPlayer.draft_order ?? NaN,
    adjustment: flatPlayer.adjustment,
    mmr:
      (accountsNew.reduce(
        (max: number | null, account) =>
          // find the highest MMR including QM, SL, and AR
          Math.max(max ?? 0, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0, account.hpArMMR ?? 0),
        0
      ) ?? 0) + (flatPlayer.adjustment ?? 0),
    lastActive: new Date(flatPlayer.last_active),
  }
}

function getAccountFromAccountRow(account: HotsAccountRow): HotsAccount {
  return {
    id: account.id,
    hotsBattleTag: account.hots_battle_tag,
    isPrimary: !!account.is_primary,
    realIdName: account.real_id_name ?? null,
    ownerDiscordId: account.owner_discord_id ?? null,
    hpQmMMR: account.HP_QM_MMR,
    hpSlMMR: account.HP_SL_MMR,
    hpArMMR: account.HP_AR_MMR,
    hpQmGames: account.HP_QM_Games,
    hpSlGames: account.HP_SL_Games,
    hpArGames: account.HP_AR_Games,
  }
}

/**
 * Retrieves all active players from the database, with their hots accounts
 * @returns Map<string, Player> a Map of active players, where the key is the Discord ID and the value is the Player object.
 */
export function getActivePlayers(guildId: string): Player[] {
  const stmt = db.prepare<[string], FlatPlayer>(`
    SELECT 
      lp.discord_id,
      COALESCE(ha.hots_battle_tag, '') AS hots_battle_tag,
      COALESCE(p.discord_name, ha.hots_battle_tag, 'Guest') AS discord_name,
      COALESCE(p.discord_global_name, ha.hots_battle_tag, 'Guest') AS discord_global_name,
      COALESCE(p.discord_display_name, ha.hots_battle_tag, 'Guest') AS discord_display_name,
      COALESCE(lp.role, p.role) AS role,
      lp.active,
      lp.team,
      p.adjustment,
      lp.lobby_rank,
      lp.draft_order,
      COALESCE(p.last_active, CURRENT_TIMESTAMP) AS last_active
    FROM lobby_players lp
    LEFT JOIN players p ON lp.discord_id = p.discord_id
    LEFT JOIN hots_accounts ha ON ha.id = COALESCE(
      lp.hots_account_id,
      (SELECT id FROM hots_accounts WHERE discord_id = lp.discord_id ORDER BY is_primary DESC, id ASC LIMIT 1)
    )
    WHERE lp.guild_id = ? AND lp.active = 1
    ORDER BY lp.lobby_rank, lp.active, lp.team;
  `)
  const rows: FlatPlayer[] = stmt.all(guildId)
  const accountsStmt = db.prepare<[], HotsAccountRow>(
    'SELECT id, discord_id, hots_battle_tag, is_primary, HP_QM_MMR, HP_SL_MMR, HP_AR_MMR, HP_QM_Games, HP_SL_Games, HP_AR_Games, real_id_name, owner_discord_id FROM hots_accounts;'
  )
  const allAccounts = accountsStmt.all()
  const validAccounts = filterActiveSubstitutedAccounts(allAccounts, guildId)
  const seenPlayerKeys = new Set<string>()
  const uniquePlayers: Player[] = []
  for (const row of rows) {
    const key = row.discord_id ?? (row.hots_battle_tag ? `tag:${row.hots_battle_tag.toLowerCase()}` : `guest:${uniquePlayers.length}`)
    if (seenPlayerKeys.has(key)) {
      continue
    }
    seenPlayerKeys.add(key)
    uniquePlayers.push(getPlayerFromRow(row, validAccounts))
  }
  return uniquePlayers
}

/**
 * Retrieves autocomplete choices for clearing active account substitutions in a guild.
 */
export function getAssignAccountClearChoices(
  guildId: string,
  query: string
): Array<{ name: string; value: string }> {
  interface ClearRow {
    hots_battle_tag: string
    lender_name: string
    borrower_name: string
  }

  const trimmed = query.trim()
  const rows = db
    .prepare<[string, string, string], ClearRow>(
      `SELECT 
        s.hots_battle_tag,
        COALESCE(p1.discord_display_name, p1.discord_global_name, p1.discord_name, 'owner') AS lender_name,
        COALESCE(p2.discord_display_name, p2.discord_global_name, p2.discord_name, 'borrower') AS borrower_name
      FROM account_substitutions s
      LEFT JOIN players p1 ON s.original_discord_id = p1.discord_id
      LEFT JOIN players p2 ON s.substitute_discord_id = p2.discord_id
      WHERE s.guild_id = ? AND s.is_active = 1
        AND (? = '' OR s.hots_battle_tag LIKE '%' || ? || '%' COLLATE NOCASE)
      ORDER BY s.date DESC
      LIMIT 25`
    )
    .all(guildId, trimmed, trimmed)

  return rows.map(r => ({
    name: `${r.hots_battle_tag} (loaned from ${r.lender_name} to ${r.borrower_name})`.slice(0, 100),
    value: r.hots_battle_tag,
  }))
}

/**
 * Retrieves autocomplete choices for assigning HotS accounts, prioritizing players active in the lobby.
 */
export function getAssignAccountChoices(
  guildId: string,
  query: string
): Array<{ name: string; value: string }> {
  interface AssignRow {
    hots_battle_tag: string
    display_name: string
    in_lobby: number
  }

  const trimmed = query.trim()
  const rows = db
    .prepare<[string, string, string, string, string], AssignRow>(
      `SELECT 
        ha.hots_battle_tag,
        COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, 'Unknown') AS display_name,
        CASE WHEN lp.discord_id IS NOT NULL THEN 1 ELSE 0 END AS in_lobby
      FROM hots_accounts ha
      JOIN players p ON ha.discord_id = p.discord_id
      LEFT JOIN lobby_players lp ON lp.discord_id = ha.discord_id AND lp.guild_id = ? AND lp.active = 1
      WHERE ha.owner_discord_id IS NULL
        AND (
          ? = ''
          OR ha.hots_battle_tag LIKE '%' || ? || '%' COLLATE NOCASE
          OR COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, '') LIKE '%' || ? || '%' COLLATE NOCASE
          OR COALESCE(ha.real_id_name, '') LIKE '%' || ? || '%' COLLATE NOCASE
        )
      ORDER BY in_lobby DESC, ha.hots_battle_tag COLLATE NOCASE ASC
      LIMIT 25`
    )
    .all(guildId, trimmed, trimmed, trimmed, trimmed)

  return rows.map(r => {
    const prefix = r.in_lobby ? '🎮 ' : ''
    return {
      name: `${prefix}${r.hots_battle_tag} (@${r.display_name})`.slice(0, 100),
      value: r.hots_battle_tag,
    }
  })
}

export interface RegisteredPlayerAccount {
  id: number
  discordId: string | null
  hotsBattleTag: string
  discordDisplayName: string
  discordName?: string
  discordGlobalName?: string
  realIdName: string | null
  ownerDiscordId?: string | null
}

export function getAllRegisteredHotSAccounts(guildId: string): RegisteredPlayerAccount[] {
  interface QueryRow {
    id: number
    discord_id: string | null
    hots_battle_tag: string
    discord_display_name: string | null
    discord_name: string | null
    discord_global_name: string | null
    real_id_name: string | null
    owner_discord_id: string | null
  }
  const stmt = db.prepare<[], QueryRow>(`
    SELECT ha.id, ha.discord_id, ha.hots_battle_tag, ha.real_id_name, ha.owner_discord_id, 
           COALESCE(p.discord_display_name, ha.hots_battle_tag) AS discord_display_name, 
           COALESCE(p.discord_name, ha.hots_battle_tag) AS discord_name, 
           COALESCE(p.discord_global_name, ha.hots_battle_tag) AS discord_global_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
  `)
  const rows: QueryRow[] = stmt.all()

  // If guildId is provided, check active substitutions
  const activeSubs = guildId ? getActiveSubstitutions(guildId) : []
  const subMap = new Map<string, string>() // lowerBattleTag -> substituteDiscordId
  for (const s of activeSubs) {
    subMap.set(s.hotsBattleTag.toLowerCase(), s.substituteDiscordId)
    const prefix = s.hotsBattleTag.split('#')[0].toLowerCase()
    subMap.set(prefix, s.substituteDiscordId)
  }

  const result: RegisteredPlayerAccount[] = []
  for (const r of rows) {
    const lowerTag = r.hots_battle_tag.toLowerCase()
    const prefix = lowerTag.split('#')[0]
    const subDiscordId = subMap.get(lowerTag) || subMap.get(prefix)

    const shouldInclude = subDiscordId ? r.discord_id === subDiscordId : !r.owner_discord_id
    if (shouldInclude) {
      result.push({
        id: r.id,
        discordId: r.discord_id,
        hotsBattleTag: r.hots_battle_tag,
        discordDisplayName: r.discord_display_name ?? r.hots_battle_tag,
        discordName: r.discord_name ?? r.hots_battle_tag,
        discordGlobalName: r.discord_global_name ?? r.hots_battle_tag,
        realIdName: r.real_id_name ?? null,
        ownerDiscordId: r.owner_discord_id ?? null,
      })
    }
  }

  return result
}

export interface HotSAccountMatch {
  player: Player
  matchedAccounts: HotsAccount[]
}

export function findPlayersByHotSAccount(query: string, guildId: string): HotSAccountMatch[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  let accounts: HotsAccountRow[] = []

  if (trimmed.includes('#')) {
    const exactStmt = db.prepare<[string], HotsAccountRow>(`
      SELECT *
      FROM hots_accounts
      WHERE hots_battle_tag = ? COLLATE NOCASE
    `)
    accounts = exactStmt.all(trimmed)

    if (accounts.length === 0) {
      const prefixStmt = db.prepare<[string], HotsAccountRow>(`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag LIKE ? || '%' COLLATE NOCASE
      `)
      accounts = prefixStmt.all(trimmed)
    }
  } else {
    // 1. Exact match on BattleTag prefix (before #), exact tag without #, or exact Real ID name
    const exactPrefixStmt = db.prepare<[string, string, string], HotsAccountRow>(`
      SELECT *
      FROM hots_accounts
      WHERE hots_battle_tag LIKE ? || '#%' COLLATE NOCASE
         OR hots_battle_tag = ? COLLATE NOCASE
         OR real_id_name = ? COLLATE NOCASE
    `)
    accounts = exactPrefixStmt.all(trimmed, trimmed, trimmed)

    // 2. If no exact match, try prefix match on BattleTag or Real ID
    if (accounts.length === 0) {
      const prefixStmt = db.prepare<[string, string], HotsAccountRow>(`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag LIKE ? || '%' COLLATE NOCASE
           OR real_id_name LIKE ? || '%' COLLATE NOCASE
      `)
      accounts = prefixStmt.all(trimmed, trimmed)
    }

    // 3. If still no match, try substring match
    if (accounts.length === 0) {
      const partialStmt = db.prepare<[string, string], HotsAccountRow>(`
        SELECT *
        FROM hots_accounts
        WHERE hots_battle_tag LIKE '%' || ? || '%' COLLATE NOCASE
           OR real_id_name LIKE '%' || ? || '%' COLLATE NOCASE
      `)
      accounts = partialStmt.all(trimmed, trimmed)
    }
  }

  accounts = filterActiveSubstitutedAccounts(accounts, guildId)

  const results: HotSAccountMatch[] = []
  const seenDiscordIds = new Set<string>()
  const seenAccountIds = new Set<number>()
  const qLower = trimmed.toLowerCase()

  for (const accRow of accounts) {
    if (accRow.discord_id) {
      if (seenDiscordIds.has(accRow.discord_id)) continue
      seenDiscordIds.add(accRow.discord_id)

      const player = getPlayerByDiscordId(accRow.discord_id, guildId)
      if (!player) continue

      const matchedAccounts = (player.usernames.accounts || []).filter(acc => {
        const tagLower = acc.hotsBattleTag.toLowerCase()
        const realLower = acc.realIdName?.toLowerCase()
        if (trimmed.includes('#')) {
          return tagLower === qLower || tagLower.startsWith(qLower)
        }
        const tagPrefix = tagLower.split('#')[0]
        return (
          tagPrefix === qLower ||
          tagLower === qLower ||
          realLower === qLower ||
          tagLower.includes(qLower) ||
          (realLower !== undefined && realLower !== null && realLower.includes(qLower))
        )
      })

      if (matchedAccounts.length === 0) continue

      results.push({
        player,
        matchedAccounts,
      })
    } else {
      if (seenAccountIds.has(accRow.id)) continue
      seenAccountIds.add(accRow.id)

      const hotsAcc = getAccountFromAccountRow(accRow)
      const guestPlayer = getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${accRow.id}`, guildId)
      if (guestPlayer) {
        results.push({
          player: guestPlayer,
          matchedAccounts: [hotsAcc],
        })
      }
    }
  }

  return results
}

export function getAllPlayers(page: number, sort: 'mmr' | 'alphabetical', ascending: boolean): Player[] {
  let stmt
  if (sort === 'mmr') {
    stmt = db.prepare<[number], FlatPlayer>(
      `SELECT p.* 
       FROM players p
       LEFT JOIN (
         SELECT 
           discord_id,
           MAX(
             CASE 
               WHEN COALESCE(HP_QM_MMR, 0) >= COALESCE(HP_SL_MMR, 0) AND COALESCE(HP_QM_MMR, 0) >= COALESCE(HP_AR_MMR, 0) 
                 THEN COALESCE(HP_QM_MMR, 0)
               WHEN COALESCE(HP_SL_MMR, 0) >= COALESCE(HP_AR_MMR, 0) 
                 THEN COALESCE(HP_SL_MMR, 0)
               ELSE COALESCE(HP_AR_MMR, 0)
             END
           ) as mmr
         FROM hots_accounts
         GROUP BY discord_id
       ) h ON p.discord_id = h.discord_id
       ORDER BY (COALESCE(h.mmr, 0) + COALESCE(p.adjustment, 0)) ${ascending ? 'DESC' : 'ASC'
      }, p.discord_display_name ASC
       LIMIT 20 OFFSET ?`
    )
  } else {
    stmt = db.prepare<[number], FlatPlayer>(
      `SELECT * FROM players ORDER BY discord_display_name ${ascending ? ' ASC' : ' DESC'} LIMIT 20 OFFSET ?;`
    )
  }

  // const stmt2 = db.prepare<[number], FlatPlayer>('SELECT * FROM players ORDER BY MMR LIMIT 20 OFFSET ?;');
  const rows: FlatPlayer[] = stmt.all((page ?? 0) * 20)
  const accountsStmt = db.prepare<[], HotsAccountRow>(
    'SELECT discord_id, hots_battle_tag, is_primary, HP_QM_MMR, HP_SL_MMR, HP_AR_MMR, HP_QM_Games, HP_SL_Games, HP_AR_Games, real_id_name FROM hots_accounts;'
  )
  const accounts = accountsStmt.all()
  return rows.map<Player>(row => getPlayerFromRow(row, accounts))
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
  let hotsAccountAlreadyExists = false
  let hasAccount = false
  let userIsSelf = false
  const validationResult = validateBattleTag(hotsBattleTag)
  if (!validationResult.isValid) {
    await safeReply(interaction, {
      content: `You must provide a valid Heroes of the Storm battle tag in the format \`Name#1234\`.\nYou provided: \`${hotsBattleTag}\`
${validationResult.errors.join('\n')}
${validationResult.rules}
      `,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  //check if the hots account is already in use by another player
  const existingAccountStmt = db.prepare<string[], HotsAccount & { discord_id: string }>(
    'SELECT discord_id, hots_battle_tag FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND discord_id IS NOT NULL AND discord_id != ?'
  )
  const existingAccount = existingAccountStmt.get(hotsBattleTag, discordId)
  if (existingAccount) {
    await safeReply(interaction, {
      content: `This HotS account is already in use by another player: <@${existingAccount.discord_id
        }>\nare you sure this is ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"} account...`,
      files: [
        {
          attachment: 'https://i.giphy.com/media/hPkJ9Q7dh6itMoMIMC/giphy.gif',
          name: 'is it.gif',
        },
      ],
      flags: MessageFlags.Ephemeral,
    })
    return false
  }
  const guildId = await requireGuildId(interaction)
  if (!guildId) return false

  const player = getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    await safeReply(interaction, {
      content: 'Player not found in database',
      flags: MessageFlags.Ephemeral,
    })
    return false // Player not found
  }

  try {
    await interaction?.deferReply({
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    })
  } catch (error) {
    if (!error) {
      console.error('Error deferring reply:', error)
    }
  }
  // await interaction?.editReply({
  //   content:
  //     '🔍 Fetching Heroes Profile data... This may take 30-60 seconds.\n<a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004><a:Dance:1058282988422570004>',
  // });
  // get their heroes profile data
  const profileData = await getHeroesProfileData(hotsBattleTag)
  // const profileData = await getHeroesProfileDataPuppeteer(hotsBattleTag);
  if (!profileData) {
    await safeReply(interaction, {
      content: `Failed to retrieve Heroes profile data for \`${hotsBattleTag}\`.\nAre you sure you typed it right?`,
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  if (profileData.qmGames === -1 && profileData.slGames === -1 && profileData.arGames === -1) {
    await handleAccountNotFound(interaction, discordId, hotsBattleTag)
    return false
  }

  userIsSelf = discordId === interaction?.user.id

  interface ExistingAccountRow {
    id: number
    discord_id: string | null
    is_primary: number
  }

  const currentAccount = db
    .prepare<[string], ExistingAccountRow>(
      'SELECT id, discord_id, is_primary FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
    )
    .get(hotsBattleTag)

  if (currentAccount && currentAccount.discord_id === discordId) {
    hotsAccountAlreadyExists = true
  }

  try {
    const isPrimary =
      currentAccount && currentAccount.discord_id === discordId
        ? currentAccount.is_primary
        : !player.usernames.accounts || player.usernames.accounts.length <= 1
          ? 1
          : 0

    const syncAccountTransaction = db.transaction(() => {
      let accountId: number

      if (currentAccount) {
        db.prepare(`
          UPDATE hots_accounts SET
            discord_id = ?,
            hots_battle_tag = ?,
            is_primary = ?,
            HP_Region = ?,
            HP_Blizz_ID = ?,
            HP_QM_MMR = ?,
            HP_SL_MMR = ?,
            HP_AR_MMR = ?,
            HP_QM_Games = ?,
            HP_SL_Games = ?,
            HP_AR_Games = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          discordId,
          hotsBattleTag,
          isPrimary,
          profileData.region,
          profileData.blizz_id,
          profileData.qmMmr,
          profileData.slMmr,
          profileData.arMmr,
          profileData.qmGames,
          profileData.slGames,
          profileData.arGames,
          currentAccount.id
        )
        accountId = currentAccount.id
      } else {
        const info = db.prepare(`
          INSERT INTO hots_accounts (
            discord_id, hots_battle_tag, is_primary, HP_Region, HP_Blizz_ID,
            HP_QM_MMR, HP_SL_MMR, HP_AR_MMR, HP_QM_Games, HP_SL_Games, HP_AR_Games
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          discordId,
          hotsBattleTag,
          isPrimary,
          profileData.region,
          profileData.blizz_id,
          profileData.qmMmr,
          profileData.slMmr,
          profileData.arMmr,
          profileData.qmGames,
          profileData.slGames,
          profileData.arGames
        )
        accountId = Number(info.lastInsertRowid)
      }

      // Link lobby player entry if this account was in the lobby as a guest
      db.prepare(`
        UPDATE lobby_players
        SET hots_account_id = ?
        WHERE discord_id = ? AND (hots_account_id IS NULL OR hots_account_id = ?)
      `).run(accountId, discordId, accountId)

      db.prepare(`
        DELETE FROM lobby_players
        WHERE hots_account_id = ? AND discord_id IS NULL
          AND guild_id IN (SELECT guild_id FROM lobby_players WHERE discord_id = ?)
      `).run(accountId, discordId)

      db.prepare(`
        UPDATE lobby_players
        SET discord_id = ?
        WHERE hots_account_id = ? AND discord_id IS NULL
      `).run(accountId, discordId)

      // Link replay game stats
      db.prepare(`
        UPDATE hots_replay_player_game_stats
        SET hots_account_id = ?, discord_id = ?
        WHERE hots_account_id = ? OR (hots_account_id IS NULL AND hots_battle_tag = ? COLLATE NOCASE)
      `).run(accountId, discordId, accountId, hotsBattleTag)
    })

    syncAccountTransaction()
    if (profileData.detectedRoles && !player.role) {
      setPlayerRole(discordId, guildId, profileData.detectedRoles)
      player.role = profileData.detectedRoles
    }
    if (interaction) {
      await updateLobbyMessage(guildId, interaction)
    }
    if (hotsAccountAlreadyExists) {
      const reasonText = profileData.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      const content = `${userIsSelf ? 'You' : '<@' + discordId + '>'} already ${userIsSelf ? 'have' : 'has'
        } this HotS account linked: \`${hotsBattleTag}\`\n\nHowever, ${userIsSelf ? 'your' : '<@' + discordId + '>' + "'s"
        } Heroes profile data and BattleTag formatting have been updated.${roleText}`
      try {
        await interaction?.editReply({
          content,
        })
      } catch (error) {
        await safeReply(interaction, {
          content,
          flags: MessageFlags.Ephemeral,
        })
      }
    } else {
      const reasonText = profileData.detectedRolesReason ? `\n(${profileData.detectedRolesReason})` : ''
      const roleText =
        profileData.detectedRoles && player.role === profileData.detectedRoles
          ? `\nAuto-populated role: ${getPlayerRolesFormatted(player.role)}${reasonText}`
          : ''
      await safeReply(interaction, {
        content: `${discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
          } HotS account has been added: \`${hotsBattleTag}\`${roleText}`,
        flags: MessageFlags.Ephemeral,
      })
    }
  } catch (error) {
    console.error('Error adding HotS account:', error)
    await safeReply(interaction, {
      content: `Failed to add HotS account \`${hotsBattleTag}\`.\nPlease try again later.`,
      flags: MessageFlags.Ephemeral,
    })
    await safeReply(interaction, {
      content: `<@${discordId}> Failed to add HotS account \`${hotsBattleTag}\``,
    })
    return false
  }
  return player
}

export async function handleDeleteHotsAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  discordId: string,
  hotsBattleTag: string | null
) {
  if (!hotsBattleTag) {
    // delete all hots accounts associated with the discordId
    deletePlayerHotsAccounts(discordId)
    const hotsAccountStmt = db.prepare('DELETE FROM hots_accounts WHERE discord_id = ?')
    hotsAccountStmt.run(discordId)
    await safeReply(interaction, {
      content: `ALL Heroes of the Storm accounts associated with <@${discordId}> have been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  const deleted = deleteHotsAccount(hotsBattleTag)
  if (deleted > 0) {
    await safeReply(interaction, {
      content: `Heroes of the Storm account \`${hotsBattleTag}\` has been deleted.`,
      flags: MessageFlags.Ephemeral,
    })
  } else {
    await safeReply(interaction, {
      content: `Failed to delete Heroes of the Storm account \`${hotsBattleTag}\`. It may not exist.`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

async function handleAccountNotFound(
  interaction:
    | ChatInputCommandInteraction<CacheType>
    | ButtonInteraction<CacheType>
    | ModalSubmitInteraction<CacheType>
    | undefined,
  discordId: string,
  hotsBattleTag: string
) {
  const guildId = interaction ? await requireGuildId(interaction) : null
  if (!guildId) return
  deletePlayerHotsAccounts(discordId)
  interaction && (await updateLobbyMessage(guildId, interaction))
  const joinBtn = new ButtonBuilder()
    .setCustomId(`${CommandIds.JOIN_WITH_BATTLE_TAG}_${hotsBattleTag}`)
    .setLabel('Try Again')
    .setStyle(ButtonStyle.Primary)
  await safeReply(interaction, {
    content: `heroesprofile could not find data for \`${hotsBattleTag}\`\nare you sure this is the right battle tag for ${discordId === interaction?.user.id ? 'your' : '<@' + discordId + ">'s"
      } account?`,
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn)],
  })
}

export async function deletePlayer(
  discordId: string
): Promise<{ playersDeleted: number; hotsAccountsDeleted: number }> {
  // first delete the player's hots accounts
  let deletedPlayer = 0
  let deletedAccounts = 0

  const transaction = db.transaction(() => {
    deletedAccounts = deletePlayerHotsAccounts(discordId)
    // get the number of hots accounts deleted
    const deletePlayerStmt = db.prepare('DELETE FROM players WHERE discord_id = ?')
    deletedPlayer = deletePlayerStmt.run(discordId).changes
  })
  transaction()

  return {
    playersDeleted: deletedPlayer,
    hotsAccountsDeleted: deletedAccounts,
  }
}

export function deletePlayerHotsAccounts(discordId: string): number {
  const stmt = db.prepare('DELETE FROM hots_accounts WHERE discord_id = ?')
  const result = stmt.run(discordId)
  return result.changes
}

export function deleteHotsAccount(hotsBattleTag: string) {
  const stmt = db.prepare('DELETE FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE')
  const result = stmt.run(hotsBattleTag)
  return result.changes
}

export function setHotsAccountRealIdName(hotsBattleTag: string, realIdName: string | null): boolean {
  const stmt = db.prepare<[string | null, string]>(
    'UPDATE hots_accounts SET real_id_name = ? WHERE hots_battle_tag = ? COLLATE NOCASE'
  )
  const result = stmt.run(realIdName, hotsBattleTag)
  return result.changes > 0
}

export function getHotsAccountByBattleTag(
  hotsBattleTag: string
): (HotsAccountRow & { discord_display_name?: string }) | undefined {
  const stmt = db.prepare<[string], HotsAccountRow & { discord_display_name?: string }>(`
    SELECT ha.*, p.discord_display_name
    FROM hots_accounts ha
    LEFT JOIN players p ON ha.discord_id = p.discord_id
    WHERE ha.hots_battle_tag = ? COLLATE NOCASE
  `)
  return stmt.get(hotsBattleTag)
}

export async function setPrimaryAccount(
  interaction: ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string,
  messageId: string,
  channelId: string
) {
  const { success, message, player } = await updatePrimaryAccountInDb(guildId, discordId, hotsBattleTag)
  if (!success || !player?.usernames.accounts) {
    await safeReply(interaction, {
      content: message,
      flags: MessageFlags.Ephemeral,
    })
    return false // Failed to set primary account
  }

  // Handle non-button interactions (slash commands)
  if (!interaction.isButton()) {
    await safeReply(interaction, {
      content: `${discordId === interaction?.user.id ? 'Your' : '<@' + discordId + ">'s"
        } primary HotS account has been set to \`${hotsBattleTag}\`.`,
      flags: MessageFlags.Ephemeral,
    })
    return true // Primary account set successfully
  }
  const buttonUpdateSuccess = await updateButtonInterface(interaction, player, discordId, messageId, channelId)
  if (!buttonUpdateSuccess.success) {
    await safeReply(interaction, {
      ...buttonUpdateSuccess.messageOptions,
      flags: MessageFlags.Ephemeral,
    })
    return false // Failed to update button interface
  }

  return true
}

async function updateButtonInterface(
  interaction: ButtonInteraction<CacheType>,
  player: Player,
  discordId: string,
  messageId: string,
  channelId: string
): Promise<{ success: boolean; messageOptions: InteractionReplyOptions }> {
  const accounts = player.usernames.accounts
  if (!accounts?.length) {
    return {
      success: false,
      messageOptions: { content: 'No accounts to update' },
    }
  }
  // Try to delete the original message with proper error handling
  try {
    const prevInteraction = getStoredInteraction(messageId, channelId)
    if (!prevInteraction) {
      throw new Error('Previous interaction not found')
    }
    await prevInteraction.editReply({
      components: getAccountButtons(accounts, discordId, messageId, channelId),
    })
    await safeDeferUpdate(interaction) // Acknowledge the button interaction without showing loading
    return { success: true, messageOptions: { content: '' } }
  } catch (error: unknown) {
    removeInteraction(messageId, channelId) // if we can't find the interaction, remove it from the store
    console.error('Error updating button interface:', error)
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        const message = await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        })
        storeInteraction(message.id, interaction.channelId, interaction)
      }
      await safeReply(interaction, {
        content:
          'Previous interaction not found to update buttons\nPlease select the account to set as primary using the buttons below.',
        components: getAccountButtons(accounts, discordId, messageId, channelId),
      })
    } catch (fallbackError) {
      console.error('Failed fallback deferReply/safeReply:', fallbackError)
    }
    return { success: true, messageOptions: { content: '' } }
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
      .setStyle(account.isPrimary ? ButtonStyle.Primary : ButtonStyle.Secondary)
  })
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]
}

/**
 * Updates the primary Heroes of the Storm account for a player in the database.
 * @param discordId The Discord ID of the player.
 * @param hotsBattleTag The Heroes of the Storm battle tag to set as primary.
 * @returns An object containing the success status, optional error message, and updated player data.
 */
async function updatePrimaryAccountInDb(
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): Promise<{ success: boolean; message?: string; player?: Player }> {
  const stmt = db.prepare(
    'UPDATE hots_accounts SET is_primary = CASE WHEN hots_battle_tag = ? COLLATE NOCASE THEN 1 ELSE 0 END WHERE discord_id = ?'
  )
  const result = stmt.run(hotsBattleTag, discordId)
  if (result.changes === 0) {
    return {
      success: false,
      message: `The specified Heroes of the Storm account \`${hotsBattleTag}\` was not found for this player.`,
    }
  }
  const player = getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return {
      success: false,
      message: 'Player not found in database',
    }
  }
  if (!player.usernames.accounts || player.usernames.accounts.length === 0) {
    return {
      success: false,
      message: 'This player has no Heroes of the Storm accounts linked.',
    }
  }
  return { success: true, player }
}

/**
 * Marks all players as inactive in the database.
 * @returns void
 */
export function markAllPlayersInactive(guildId: string): void {
  const stmt = db.prepare('DELETE FROM lobby_players WHERE guild_id = ?')
  stmt.run(guildId)
}

/**
 * Gets a player by their Discord ID, optionally joining lobby state for a guild.
 * @param discordId The Discord ID of the player to retrieve.
 * @param guildId Optional Discord guild ID to populate active/team/lobby_rank/draft_order.
 * @returns Player object if found, undefined otherwise.
 */
export function getPlayerByDiscordId(discordId: string | null | undefined, guildId: string): Player | undefined {
  if (!discordId) return undefined
  const stmt = db.prepare<[string, string], FlatPlayer>(`
    SELECT p.*,
           COALESCE(lp.active, 0) as active,
           lp.team,
           lp.lobby_rank,
           lp.draft_order
    FROM players p
    LEFT JOIN lobby_players lp ON p.discord_id = lp.discord_id AND lp.guild_id = ?
    WHERE p.discord_id = ?;
  `)

  const row = stmt.get(guildId, discordId)
  if (!row) {
    return undefined // Player not found
  }
  const accountsStmt = db.prepare<[string], HotsAccountRow>('SELECT * FROM hots_accounts WHERE discord_id = ?')
  const accounts = accountsStmt.all(discordId)
  const validAccounts = filterActiveSubstitutedAccounts(accounts, guildId)

  return getPlayerFromRow(row, validAccounts)
}

export enum PlayerIdPrefix {
  HOTS_ROW_ID = 'hotsRowId:',
  TAG = 'tag:',
}

/**
 * Extracts numeric account ID from an identifier if it's 'hotsRowId:<id>' or 'tag:<tag>'.
 */
function getAccountRowIdFromIdentifier(identifier: string): number | null {
  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const id = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    return isNaN(id) ? null : id
  }
  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    const cleanTag = identifier.slice(PlayerIdPrefix.TAG.length)
    const accRow = db
      .prepare<[string], { id: number }>(
        'SELECT id FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
      )
      .get(cleanTag)
    return accRow?.id ?? null
  }
  return null
}

/**
 * Returns a unique string identifier for a Player (discordId, 'hotsRowId:<id>', or 'tag:<tag>').
 */
export function getPlayerIdentifier(player: Player): string {
  if (player.discordId) return player.discordId
  const accId = player.usernames?.accounts?.[0]?.id
  if (accId) return `${PlayerIdPrefix.HOTS_ROW_ID}${accId}`
  const tag = player.usernames?.accounts?.[0]?.hotsBattleTag
  return tag ? `${PlayerIdPrefix.TAG}${tag}` : ''
}

interface GuestLobbyInfo {
  role: string | null
  active: number
  team: number | null
  lobby_rank: number | null
  draft_order: number | null
}

function buildGuestPlayer(account: HotsAccountRow, guildId: string): Player {
  const lp = db
    .prepare<[string, number], GuestLobbyInfo>(
      'SELECT role, active, team, lobby_rank, draft_order FROM lobby_players WHERE guild_id = ? AND hots_account_id = ? LIMIT 1'
    )
    .get(guildId, account.id)

  const hotsAcc: HotsAccount = getAccountFromAccountRow(account)
  const mmr = Math.max(account.HP_QM_MMR ?? 0, account.HP_SL_MMR ?? 0, account.HP_AR_MMR ?? 0)

  return {
    discordId: null,
    usernames: {
      accounts: [hotsAcc],
      discordName: account.hots_battle_tag,
      discordDisplayName: account.hots_battle_tag,
      discordGlobalName: account.hots_battle_tag,
    },
    role: lp?.role ?? undefined,
    active: lp?.active === 1,
    team: lp?.team ?? null,
    lobbyRank: lp?.lobby_rank ?? NaN,
    draftOrder: lp?.draft_order ?? NaN,
    adjustment: null,
    mmr,
    lastActive: new Date(),
  }
}

/**
 * Gets a player by either hotsRowId ('hotsRowId:<id>'), BattleTag ('tag:<tag>'), or Discord ID.
 */
export function getPlayerByIdentifier(identifier: string, guildId: string): Player | undefined {
  if (!identifier) return undefined

  // 1. Explicit hotsRowId (hotsRowId:<id>)
  if (identifier.startsWith(PlayerIdPrefix.HOTS_ROW_ID)) {
    const rowId = parseInt(identifier.slice(PlayerIdPrefix.HOTS_ROW_ID.length), 10)
    if (isNaN(rowId)) return undefined

    const account = db
      .prepare<[number], HotsAccountRow>('SELECT * FROM hots_accounts WHERE id = ? LIMIT 1')
      .get(rowId)
    if (!account) return undefined
    return account.discord_id ? getPlayerByDiscordId(account.discord_id, guildId) : buildGuestPlayer(account, guildId)
  }

  // 2. Explicit tag prefix (tag:<tag>)
  if (identifier.startsWith(PlayerIdPrefix.TAG)) {
    return getPlayerByBattleTag(identifier.slice(PlayerIdPrefix.TAG.length), guildId)
  }

  // 3. Default: Discord ID
  return getPlayerByDiscordId(identifier, guildId)
}

/**
 * Gets a player by their BattleTag. This is used for guest players who are not logged into the bot.
 * @param battleTag The BattleTag of the player to retrieve.
 * @param guildId The guild ID to retrieve the player for.
 * @returns The player if found, undefined otherwise.
 */
function getPlayerByBattleTag(battleTag: string, guildId: string): Player | undefined {
  const account = db
    .prepare<[string], { id: number; discord_id: string | null }>(
      'SELECT id, discord_id FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
    )
    .get(battleTag)
  if (!account) return undefined
  return account.discord_id
    ? getPlayerByDiscordId(account.discord_id, guildId)
    : getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${account.id}`, guildId)
}

/**
 * Sets the player role in the database.
 * @param identifier The Discord ID or account:id of the player to set the role for.
 * @param role The role to set for the player.
 * @returns Player object if the player was found and the role was set, false otherwise.
 */
export function setPlayerRole(identifier: string, guildId: string, role: string | null | undefined): false | Player {
  const roleToSet = role && role.trim() !== '' ? role : null
  const accId = getAccountRowIdFromIdentifier(identifier)
  if (accId !== null) {
    db.prepare('UPDATE lobby_players SET role = ? WHERE guild_id = ? AND hots_account_id = ?').run(roleToSet, guildId, accId)
    const player = getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${accId}`, guildId)
    if (player) {
      player.role = roleToSet ?? undefined
      return player
    }
    return false
  }

  const player = getPlayerByDiscordId(identifier, guildId)
  if (!player) {
    return false // Player not found
  }
  const stmt = db.prepare('UPDATE players SET role = ? WHERE discord_id = ?')
  stmt.run(roleToSet, identifier)
  db.prepare('UPDATE lobby_players SET role = ? WHERE guild_id = ? AND discord_id = ?').run(roleToSet, guildId, identifier)
  player.role = roleToSet ?? undefined
  return player
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
    ChatInputCommandInteraction<CacheType> | ButtonInteraction<CacheType> | ModalSubmitInteraction<CacheType>,
  guildId: string,
  discordId: string,
  hotsBattleTag: string
): false | Player {
  if (!hotsBattleTag) {
    return false // Invalid name
  }
  const player = getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false // Player not found
  }
  savePlayer(interaction, discordId, player, hotsBattleTag)
  return player
}

/**
 * Sets the Discord user names for a player in the database.
 * @param discordId The Discord ID of the player to set Discord names for.
 * @param discordData The Discord user names data to set for the player.
 * @returns boolean true if the player was found and the names were set, false otherwise.
 */
export function setPlayerDiscordNames(discordId: string, guildId: string, discordData: DiscordUserNames) {
  const { discordName, discordGlobalName, discordDisplayName } = discordData
  const player = getPlayerByDiscordId(discordId, guildId)
  if (!player) {
    return false // Player not found
  }
  const stmt = db.prepare(`
    UPDATE players
    SET discord_name = ?, discord_global_name = ?, discord_display_name = ?
    WHERE discord_id = ?
  `)
  stmt.run(discordName, discordGlobalName, discordDisplayName, discordId)
  return true
}

/**
 * Sets the MMR adjustment for a player in the database.
 * @param discordId The Discord ID of the player to set adjustment for.
 * @param guildId The Discord guild ID.
 * @param adjustment The new MMR adjustment value (or 0 to clear).
 * @returns An object containing previousAdjustment and updatedPlayer, or false if player not found.
 */
export function setPlayerAdjustment(
  discordId: string,
  guildId: string,
  adjustment: number
): false | { previousAdjustment: number | null; updatedPlayer: Player } {
  const existingPlayer = getPlayerByDiscordId(discordId, guildId)
  if (!existingPlayer) {
    return false
  }
  const previousAdjustment = existingPlayer.adjustment
  const valueToStore = adjustment === 0 ? null : adjustment
  const stmt = db.prepare<[number | null, string]>('UPDATE players SET adjustment = ? WHERE discord_id = ?')
  stmt.run(valueToStore, discordId)
  activePlayersCache.delete(guildId)
  const updatedPlayer = getPlayerByDiscordId(discordId, guildId)
  if (!updatedPlayer) {
    return false
  }
  return { previousAdjustment, updatedPlayer }
}

/**
 * Resolves a Player by identifier or BattleTag, creating a new guest account if active and valid.
 */
function resolvePlayerForActive(
  identifier: string,
  guildId: string,
  active: boolean,
  hotsBattleTag?: string
): Player | undefined {
  let player = getPlayerByIdentifier(identifier, guildId)
  if (player) return player

  const tag =
    hotsBattleTag ??
    (identifier.startsWith(PlayerIdPrefix.TAG) ? identifier.slice(PlayerIdPrefix.TAG.length) : undefined)
  if (!tag) return undefined

  player = getPlayerByIdentifier(`${PlayerIdPrefix.TAG}${tag}`, guildId)
  if (player || !active) return player

  if (validateBattleTag(tag).isValid) {
    const insertStmt = db.prepare(`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (NULL, ?, 1)
    `)
    const info = insertStmt.run(tag)
    const newAccId = Number(info.lastInsertRowid)
    return getPlayerByIdentifier(`${PlayerIdPrefix.HOTS_ROW_ID}${newAccId}`, guildId)
  }

  return undefined
}

function activatePlayerInLobby(guildId: string, player: Player, accId: number | null): void {
  if (player.discordId) {
    const stmt = db.prepare(`
      INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, lobby_rank, team, draft_order, role)
      VALUES (?, ?, ?, 1, NULL, NULL, NULL, ?)
      ON CONFLICT(guild_id, discord_id) DO UPDATE SET
        active = 1,
        hots_account_id = COALESCE(excluded.hots_account_id, lobby_players.hots_account_id),
        role = COALESCE(excluded.role, lobby_players.role),
        lobby_rank = NULL,
        team = NULL,
        draft_order = NULL
    `)
    stmt.run(guildId, player.discordId, accId, player.role ?? null)
  } else if (accId) {
    const stmt = db.prepare(`
      INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, lobby_rank, team, draft_order, role)
      VALUES (?, NULL, ?, 1, NULL, NULL, NULL, ?)
      ON CONFLICT(guild_id, hots_account_id) DO UPDATE SET
        active = 1,
        role = COALESCE(excluded.role, lobby_players.role),
        lobby_rank = NULL,
        team = NULL,
        draft_order = NULL
    `)
    stmt.run(guildId, accId, player.role ?? null)
  }
}

function deactivatePlayerInLobby(guildId: string, player: Player, accId: number | null): void {
  if (player.lobbyRank > 0) {
    const updateStmt = db.prepare(
      'UPDATE lobby_players SET lobby_rank = lobby_rank - 1 WHERE guild_id = ? AND lobby_rank > ?'
    )
    updateStmt.run(guildId, player.lobbyRank)
  }
  if (player.discordId) {
    const deleteStmt = db.prepare('DELETE FROM lobby_players WHERE guild_id = ? AND discord_id = ?')
    deleteStmt.run(guildId, player.discordId)
  } else if (accId) {
    const deleteStmt = db.prepare('DELETE FROM lobby_players WHERE guild_id = ? AND hots_account_id = ?')
    deleteStmt.run(guildId, accId)
  }
}

/**
 * Sets the active status of a player in the database.
 * @param identifier The Discord ID, BattleTag, or account:id of the player to set active status for.
 * @param active Whether the player should be set as active (true) or inactive (false).
 * @returns ({ updated: boolean; player?: Player }) An object indicating whether the player was updated and the updated player object if applicable.
 */
export function setPlayerActive(
  identifier: string,
  active: boolean,
  guildId: string,
  hotsBattleTag?: string
): { updated: boolean; player?: Player } {
  const player = resolvePlayerForActive(identifier, guildId, active, hotsBattleTag)
  if (!player) {
    return { updated: false, player } // Player not found
  }

  if (player.discordId && player.usernames.accounts?.length === 0 && hotsBattleTag) {
    addDummyHotsAccount(player.discordId, hotsBattleTag)
  }

  if (player.active === active) {
    return { updated: false, player } // No change needed
  }

  const matchedAcc = hotsBattleTag
    ? player.usernames.accounts?.find(a => a.hotsBattleTag.toLowerCase() === hotsBattleTag.toLowerCase())
    : undefined
  const accId =
    matchedAcc?.id ??
    player.usernames.accounts?.find(a => a.isPrimary)?.id ??
    player.usernames.accounts?.[0]?.id ??
    null

  const transaction = db.transaction(() => {
    if (active) {
      activatePlayerInLobby(guildId, player, accId)
    } else {
      deactivatePlayerInLobby(guildId, player, accId)
    }

    if (player.discordId) {
      const lastActive = db.prepare('UPDATE players SET last_active = CURRENT_TIMESTAMP WHERE discord_id = ?')
      lastActive.run(player.discordId)
    }

    recalculateLobbyRanks(guildId)
  })
  transaction()

  player.active = active
  return { updated: true, player }
}

/**
 * Recalculates the lobby ranks for all players in a guild.
 * @param guildId The Discord guild ID
 * It should be called within a db.transaction.
 * @returns void
 */
export function recalculateLobbyRanks(guildId: string) {
  const allPlayers = getSortedActivePlayers(guildId, true)

  let currentRank = 1
  for (let i = 0; i < allPlayers.length; i++) {
    const player = allPlayers[i]
    if (player.active) {
      const lobbyRank = currentRank++
      if (player.lobbyRank !== lobbyRank) {
        player.lobbyRank = lobbyRank
        const accId = player.usernames.accounts?.[0]?.id
        if (player.discordId) {
          const updateStmt = db.prepare('UPDATE lobby_players SET lobby_rank = ? WHERE guild_id = ? AND discord_id = ?')
          updateStmt.run(lobbyRank, guildId, player.discordId)
        } else if (accId) {
          const updateStmt = db.prepare('UPDATE lobby_players SET lobby_rank = ? WHERE guild_id = ? AND hots_account_id = ?')
          updateStmt.run(lobbyRank, guildId, accId)
        }
      }
    }
  }
}

function addDummyHotsAccount(discordId: string, hotsBattleTag: string) {
  const hotsAccountStmt = db.prepare(
    'REPLACE INTO hots_accounts (discord_id, hots_battle_tag, is_primary) VALUES (?, ?, ?)'
  )
  hotsAccountStmt.run(discordId, hotsBattleTag, 1)
}

/**
 * clears the team assignments for all players in a specific guild.
 * @param guildId The Discord guild ID
 * @returns void
 */
export function clearTeams(guildId: string): void {
  const stmt = db.prepare('UPDATE lobby_players SET team = NULL, lobby_rank = NULL WHERE guild_id = ?')
  stmt.run(guildId)
}

/**
 * Sets the teams for the players in a specific guild.
 * @param guildId The Discord guild ID
 * @param team1 Array of Player objects for team 1.
 * @param team2 Array of Player objects for team 2.
 * @param spectators Array of Player objects for spectators.
 * @returns void
 */
export function setTeamsFromPlayers(guildId: string, team1: Player[], team2: Player[], spectators: Player[]): void {
  const transaction = db.transaction(() => {
    const clearStmt = db.prepare(
      'UPDATE lobby_players SET team = NULL, lobby_rank = NULL, draft_order = NULL WHERE guild_id = ?'
    )
    clearStmt.run(guildId)

    const insertOrUpdatePlayer = (p: Player, teamVal: number | null) => {
      const lRank = Number.isNaN(p.lobbyRank) || p.lobbyRank === undefined ? null : p.lobbyRank
      const dOrder = Number.isNaN(p.draftOrder) || p.draftOrder === undefined ? null : p.draftOrder
      const accId = p.usernames.accounts?.find(a => a.isPrimary)?.id ?? p.usernames.accounts?.[0]?.id ?? null
      if (p.discordId) {
        db.prepare(`
          INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, team, lobby_rank, draft_order, role)
          VALUES (?, ?, ?, 1, ?, ?, ?, ?)
          ON CONFLICT(guild_id, discord_id) DO UPDATE SET
            active = 1,
            team = excluded.team,
            lobby_rank = excluded.lobby_rank,
            draft_order = excluded.draft_order,
            role = COALESCE(excluded.role, lobby_players.role)
        `).run(guildId, p.discordId, accId, teamVal, lRank, dOrder, p.role ?? null)
      } else if (accId) {
        db.prepare(`
          INSERT INTO lobby_players (guild_id, discord_id, hots_account_id, active, team, lobby_rank, draft_order, role)
          VALUES (?, NULL, ?, 1, ?, ?, ?, ?)
          ON CONFLICT(guild_id, hots_account_id) DO UPDATE SET
            active = 1,
            team = excluded.team,
            lobby_rank = excluded.lobby_rank,
            draft_order = excluded.draft_order,
            role = COALESCE(excluded.role, lobby_players.role)
        `).run(guildId, accId, teamVal, lRank, dOrder, p.role ?? null)
      }
    }

    team1.forEach(p => insertOrUpdatePlayer(p, 1))
    team2.forEach(p => insertOrUpdatePlayer(p, 2))
    spectators.forEach(p => insertOrUpdatePlayer(p, null))
  })
  transaction()
  activePlayersCache.delete(guildId)
}

export function changeTeams(guildId: string, playerChanges: { discordId: string; newTeam: number | null }[]): boolean {
  const transaction = db.transaction(() => {
    playerChanges.forEach(({ discordId, newTeam }) => {
      const accId = getAccountRowIdFromIdentifier(discordId)
      if (accId !== null) {
        db.prepare('UPDATE lobby_players SET team = ? WHERE guild_id = ? AND hots_account_id = ?').run(newTeam, guildId, accId)
      } else {
        const stmt = db.prepare(`
          INSERT INTO lobby_players (guild_id, discord_id, active, team)
          VALUES (?, ?, 1, ?)
          ON CONFLICT(guild_id, discord_id) DO UPDATE SET team = excluded.team
        `)
        stmt.run(guildId, discordId, newTeam)
      }
    })
  })
  transaction()
  activePlayersCache.delete(guildId)
  return true
}

/**
 * Assigns a specific player to a team (1, 2, or null) and draft_order in a specific guild.
 * If a non-null draftOrder is specified and another player already occupies it,
 * the previous occupant is bumped to the next available draft order.
 */
export function assignPlayerToTeam(
  guildId: string,
  identifier: string,
  team: number | null,
  draftOrder: number | null = null
): void {
  const transaction = db.transaction(() => {
    const accId = getAccountRowIdFromIdentifier(identifier)

    if (draftOrder !== null) {
      const existingStmt = db.prepare<[string, number], { discord_id: string | null; hots_account_id: number | null }>(
        'SELECT discord_id, hots_account_id FROM lobby_players WHERE guild_id = ? AND active = 1 AND draft_order = ?'
      )
      const existingPlayer = existingStmt.get(guildId, draftOrder)
      if (
        existingPlayer &&
        ((existingPlayer.discord_id && existingPlayer.discord_id !== identifier) ||
          (existingPlayer.hots_account_id && (accId === null || existingPlayer.hots_account_id !== accId)))
      ) {
        const nextRank = getNextDraftOrder(guildId)
        if (existingPlayer.discord_id) {
          const bumpStmt = db.prepare('UPDATE lobby_players SET draft_order = ? WHERE guild_id = ? AND discord_id = ?')
          bumpStmt.run(nextRank, guildId, existingPlayer.discord_id)
        } else if (existingPlayer.hots_account_id) {
          const bumpStmt = db.prepare('UPDATE lobby_players SET draft_order = ? WHERE guild_id = ? AND hots_account_id = ?')
          bumpStmt.run(nextRank, guildId, existingPlayer.hots_account_id)
        }
      }
    }

    if (accId !== null) {
      const stmt = db.prepare(`
        UPDATE lobby_players
        SET team = ?, draft_order = ?
        WHERE guild_id = ? AND hots_account_id = ?
      `)
      stmt.run(team, draftOrder, guildId, accId)
    } else {
      const stmt = db.prepare(`
        INSERT INTO lobby_players (guild_id, discord_id, active, team, draft_order)
        VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(guild_id, discord_id) DO UPDATE SET team = excluded.team, draft_order = excluded.draft_order
      `)
      stmt.run(guildId, identifier, team, draftOrder)
    }
  })
  transaction()
}

/**
 * Resets team and draft_order for all active players in a specific guild.
 */
export function resetActivePlayerTeams(guildId: string): void {
  const stmt = db.prepare('UPDATE lobby_players SET team = NULL, draft_order = NULL WHERE guild_id = ? AND active = 1')
  stmt.run(guildId)
}

/**
 * Calculates the next available draft order number for a specific guild draft.
 * Captain 1 = 1, Captain 2 = 2, Picks start at 3.
 */
export function getNextDraftOrder(guildId: string): number {
  const stmt = db.prepare<[string], { maxOrder: number | null }>(
    'SELECT MAX(draft_order) as maxOrder FROM lobby_players WHERE guild_id = ? AND active = 1 AND draft_order IS NOT NULL'
  )
  const row = stmt.get(guildId)
  const maxOrder = row?.maxOrder ?? 0
  return Math.max(2, maxOrder) + 1
}

/**
 * Returns the count of non-captain picked players on Team 1 or Team 2 for a specific guild.
 */
export function getDraftPickedCount(guildId: string, t1CaptainId?: string, t2CaptainId?: string): number {
  if (t1CaptainId && t2CaptainId) {
    const stmt = db.prepare<[string, string, string], { count: number }>(
      'SELECT COUNT(*) as count FROM lobby_players WHERE guild_id = ? AND active = 1 AND (team = 1 OR team = 2) AND discord_id NOT IN (?, ?)'
    )
    const row = stmt.get(guildId, t1CaptainId, t2CaptainId)
    return row?.count ?? 0
  }
  const stmt = db.prepare<[string], { count: number }>(
    'SELECT COUNT(*) as count FROM lobby_players WHERE guild_id = ? AND active = 1 AND (team = 1 OR team = 2) AND (draft_order > 2 OR draft_order IS NULL)'
  )
  const row = stmt.get(guildId)
  return row?.count ?? 0
}

const activePlayersCache = new Map<string, { data: Player[]; timestamp: number }>()
/**
 * Retrieves sorted active players for a specific guild, with per-guild caching.
 * @returns {Player[]}
 */
export function getSortedActivePlayers(guildId: string, forceRefresh = false): Player[] {
  const cacheEntry = activePlayersCache.get(guildId)
  if (forceRefresh || !cacheEntry || Date.now() - cacheEntry.timestamp >= 5000) {
    const data = getActivePlayers(guildId).sort((a, b) => getPlayerMMR(b) - getPlayerMMR(a))
    data.forEach((p, index) => {
      p.lobbyRank = index
    })
    activePlayersCache.set(guildId, { data, timestamp: Date.now() })
    return data
  }
  return cacheEntry.data
}

/**
 * Gets the teams from the active players for a specific guild.
 *
 * @param guildId The Discord guild ID
 * @param activePlayers - The array of active players to get teams from. If not provided, the sorted active players will be used.
 *
 * @returns ({ team1: Player[], team2: Player[], spectators: Player[], t1Captain: Player, t2Captain: Player })
 **/
export function getTeams(guildId: string, activePlayers = getSortedActivePlayers(guildId)) {
  const team1 = activePlayers.filter(p => p.team === 1)
  const team2 = activePlayers.filter(p => p.team === 2)
  const spectators = activePlayers.filter(p => p.team !== 1 && p.team !== 2)
  const t1Captain = team1.find(p => p.draftOrder === 1) ?? team1[0] ?? activePlayers[0]
  const t2Captain =
    team2.find(p => p.draftOrder === 2) ??
    team2[0] ??
    (t1Captain === activePlayers[0] ? activePlayers[1] : activePlayers[0])
  return { team1, team2, spectators, t1Captain, t2Captain }
}

/**
 * Calculates the MMR for a player (including any adjustments).
 *
 * @param player The player to calculate the MMR for.
 * @returns The MMR of the player.
 */
export function getPlayerMMR(player: Player): number {
  return (
    (player.usernames.accounts?.reduce(
      (bestMMR, account) => Math.max(bestMMR, account.hpQmMMR ?? 0, account.hpSlMMR ?? 0, account.hpArMMR ?? 0),
      0
    ) ?? 0) + (player.adjustment ?? 0)
  )
}

/**
 * Gets the roles of the player as a pretty string
 * @param role The role string to format.
 * @returns A string of the player's roles, formatted as a list.
 */
export function getPlayerRolesFormatted(role?: string): string {
  if (!role) {
    return 'role not set'
  }
  return role
    .split('')
    .map(r => roleMap[r])
    .join(', ')
}

export interface FormatPlayerDisplayOptions {
  includeBattleTag?: boolean
  includeRole?: boolean
}

/**
 * Formats a player's display representation (e.g. `1: 3167` <@123456789> Battletag `Assassin, Flex`).
 * @param player The player to format.
 * @param options Display options: whether to include BattleTag and roles.
 * @returns The formatted string representation of the player.
 */
export function formatPlayerDisplay(
  player: Player,
  guildId: string,
  options: FormatPlayerDisplayOptions = {}
): string {
  const mmr = player.mmr ?? getPlayerMMR(player)
  const rank =
    player.lobbyRank !== undefined && !Number.isNaN(player.lobbyRank) ? `${player.lobbyRank + 1}: ${mmr}` : `${mmr}`

  let result = `\`${rank}\` <@${player.discordId}>`

  if (options.includeBattleTag) {
    const subAccount = player.usernames.accounts?.find(account => account.ownerDiscordId)
    const primaryAccount = subAccount ?? player.usernames.accounts?.find(account => account.isPrimary)
    if (primaryAccount) {
      result += ` ${primaryAccount.hotsBattleTag.replace(/#.*$/, '')}`
      if (primaryAccount.ownerDiscordId) {
        result += getSubstitutedAccountOwnerTag(primaryAccount.ownerDiscordId, guildId)
      }
    }
  }

  if (options.includeRole) {
    result += ` \`${getPlayerRolesFormatted(player.role)}\``
  }

  return result
}

/**
 * Retrieves all currently active account substitutions for a specific guild.
 */
export function getActiveSubstitutions(guildId: string): AccountSubstitution[] {
  const rows = db
    .prepare<[string], AccountSubstitutionRow>(
      `SELECT * FROM account_substitutions WHERE guild_id = ? AND is_active = 1 ORDER BY date DESC`
    )
    .all(guildId)

  return rows.map<AccountSubstitution>(r => ({
    id: r.id,
    guildId: r.guild_id,
    hotsBattleTag: r.hots_battle_tag,
    originalDiscordId: r.original_discord_id,
    substituteDiscordId: r.substitute_discord_id,
    replayId: r.replay_id,
    date: r.date,
    isActive: r.is_active === 1,
  }))
}

/**
 * Filters out substituted/loaned accounts unless their substitution is currently active in the guild.
 */
export function filterActiveSubstitutedAccounts(
  accounts: HotsAccountRow[],
  guildId: string
): HotsAccountRow[] {
  const activeSubs = getActiveSubstitutions(guildId)
  if (activeSubs.length === 0) {
    return accounts.filter(acc => !acc.owner_discord_id)
  }
  const activeSubKeys = new Set(
    activeSubs.map(s => `${s.substituteDiscordId}:${s.hotsBattleTag.toLowerCase()}`)
  )
  const activeSubTagPrefixes = new Set(
    activeSubs.map(s => `${s.substituteDiscordId}:${s.hotsBattleTag.split('#')[0].toLowerCase()}`)
  )
  return accounts.filter(acc => {
    if (!acc.owner_discord_id) return true
    const prefix = acc.hots_battle_tag.split('#')[0].toLowerCase()
    return (
      activeSubKeys.has(`${acc.discord_id}:${acc.hots_battle_tag.toLowerCase()}`) ||
      activeSubTagPrefixes.has(`${acc.discord_id}:${prefix}`)
    )
  })
}

/**
 * Formats the owner tag for a substituted/loaned account (e.g. " [not @OwnerName]").
 */
export function getSubstitutedAccountOwnerTag(ownerDiscordId: string, guildId: string): string {
  const owner = getPlayerByDiscordId(ownerDiscordId, guildId)
  const ownerName =
    owner?.usernames.discordDisplayName ??
    owner?.usernames.discordGlobalName ??
    owner?.usernames.discordName ??
    'unknown'
  return ` [not @${ownerName}]`
}

/**
 * Retrieves a substitution for a specific battle tag (either historical for a replay or active).
 */
export function getSubstitutionForAccount(
  battleTag: string,
  guildId?: string,
  replayId?: number
): AccountSubstitution | undefined {
  let row: AccountSubstitutionRow | undefined

  // 1. Check historical substitution if this replay was previously imported
  if (replayId !== undefined) {
    row = db
      .prepare<[number, string, string], AccountSubstitutionRow>(
        `SELECT * FROM account_substitutions 
         WHERE replay_id = ? AND (hots_battle_tag = ? COLLATE NOCASE OR ? LIKE (hots_battle_tag || '#%'))
         LIMIT 1`
      )
      .get(replayId, battleTag, battleTag)
  }

  // 2. Otherwise check currently active substitution
  if (!row) {
    if (guildId) {
      row = db
        .prepare<[string, string, string], AccountSubstitutionRow>(
          `SELECT * FROM account_substitutions 
           WHERE guild_id = ? AND is_active = 1 AND (hots_battle_tag = ? COLLATE NOCASE OR hots_battle_tag LIKE ? COLLATE NOCASE)
           ORDER BY date DESC LIMIT 1`
        )
        .get(guildId, battleTag, battleTag + '#%')
    } else {
      row = db
        .prepare<[string, string], AccountSubstitutionRow>(
          `SELECT * FROM account_substitutions 
           WHERE is_active = 1 AND (hots_battle_tag = ? COLLATE NOCASE OR hots_battle_tag LIKE ? COLLATE NOCASE)
           ORDER BY date DESC LIMIT 1`
        )
        .get(battleTag, battleTag + '#%')
    }
  }

  if (!row) return undefined
  return {
    id: row.id,
    guildId: row.guild_id,
    hotsBattleTag: row.hots_battle_tag,
    originalDiscordId: row.original_discord_id,
    substituteDiscordId: row.substitute_discord_id,
    replayId: row.replay_id,
    date: row.date,
    isActive: row.is_active === 1,
  }
}

/**
 * Sets a temporary account substitution: assigns an account normally owned by originalDiscordId to substituteDiscordId.
 * Creates a duplicate row in hots_accounts for the substitute user with owner_discord_id set.
 */
export function setAccountSubstitution(
  guildId: string,
  battleTag: string,
  substituteDiscordId: string,
  originalDiscordId?: string
): { success: boolean; accountId: number; originalDiscordId: string; hotsBattleTag: string } {
  let ownerId = originalDiscordId
  let fullBattleTag = battleTag

  if (!ownerId) {
    const existing = db
      .prepare<[string], { discord_id: string; hots_battle_tag: string }>(
        'SELECT discord_id, hots_battle_tag FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
      )
      .get(battleTag)

    if (existing) {
      ownerId = existing.discord_id
      fullBattleTag = existing.hots_battle_tag
    } else {
      const prefixExisting = db
        .prepare<[string], { discord_id: string; hots_battle_tag: string }>(
          'SELECT discord_id, hots_battle_tag FROM hots_accounts WHERE hots_battle_tag LIKE ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
        )
        .get(battleTag + '#%')
      if (prefixExisting) {
        ownerId = prefixExisting.discord_id
        fullBattleTag = prefixExisting.hots_battle_tag
      }
    }
  }

  if (!ownerId) {
    return { success: false, accountId: 0, originalDiscordId: '', hotsBattleTag: '' }
  }

  // Deactivate any existing active substitution for this battleTag in this guild
  db.prepare(
    `UPDATE account_substitutions SET is_active = 0 WHERE guild_id = ? AND hots_battle_tag = ? COLLATE NOCASE AND is_active = 1`
  ).run(guildId, fullBattleTag)

  // Insert active substitution record
  db.prepare(
    `INSERT INTO account_substitutions (guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, is_active)
     VALUES (?, ?, ?, ?, 1)`
  ).run(guildId, fullBattleTag, ownerId, substituteDiscordId)

  // Create or get the duplicate hots_accounts row for the substitute
  const accountId = getOrCreateSubstituteAccount(substituteDiscordId, fullBattleTag, ownerId)

  activePlayersCache.delete(guildId)

  return {
    success: true,
    accountId,
    originalDiscordId: ownerId,
    hotsBattleTag: fullBattleTag,
  }
}

/**
 * Retrieves existing or creates a new duplicate hots_accounts row for a substitute player.
 */
export function getOrCreateSubstituteAccount(
  substituteDiscordId: string,
  fullBattleTag: string,
  ownerId: string
): number {
  const checkSubAccount = db
    .prepare<[string, string], { id: number }>(
      'SELECT id FROM hots_accounts WHERE discord_id = ? AND hots_battle_tag = ? COLLATE NOCASE'
    )
    .get(substituteDiscordId, fullBattleTag)

  if (checkSubAccount) {
    db.prepare('UPDATE hots_accounts SET owner_discord_id = ? WHERE id = ?').run(ownerId, checkSubAccount.id)
    return checkSubAccount.id
  }

  const origAccount = db
    .prepare<[string, string], HotsAccountRow>(
      'SELECT * FROM hots_accounts WHERE discord_id = ? AND hots_battle_tag = ? COLLATE NOCASE LIMIT 1'
    )
    .get(ownerId, fullBattleTag)

  const insertStmt = db.prepare(`
    INSERT INTO hots_accounts (
      discord_id, hots_battle_tag, is_primary, owner_discord_id,
      HP_Region, HP_Blizz_ID, HP_QM_MMR, HP_SL_MMR, HP_AR_MMR, HP_QM_Games, HP_SL_Games, HP_AR_Games
    ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const info = insertStmt.run(
    substituteDiscordId,
    fullBattleTag,
    ownerId,
    origAccount?.HP_Region ?? null,
    origAccount?.HP_Blizz_ID ?? null,
    origAccount?.HP_QM_MMR ?? null,
    origAccount?.HP_SL_MMR ?? null,
    origAccount?.HP_AR_MMR ?? null,
    origAccount?.HP_QM_Games ?? null,
    origAccount?.HP_SL_Games ?? null,
    origAccount?.HP_AR_Games ?? null
  )
  return Number(info.lastInsertRowid)
}

export interface ResolvedHotsAccount {
  /** The ID of the hots_accounts row that this account refers to.
   * This will be the substitute's row if there is an active substitution,
   * or the original account's row if there is no active substitution.
   */
  hotsAccountId: number
  /** The Discord ID of the user who owns this account (primary if null) */
  ownerDiscordId: string | null
  /** The Discord ID of the user who is currently using this account (the "substitute" if not null) */
  discordId: string | null
  /** The HotS battle tag */
  battleTag: string
}

/**
 * Retrieves the effective HotS account information for a BattleTag, taking any active
 * or historical substitution (for a specific replay) into account.
 * If the account does not exist in hots_accounts, a new row is inserted and returned.
 */
export function getAccountWithSubstitution(
  battleTag: string,
  guildId: string,
  replayId?: number
): ResolvedHotsAccount {
  // 1. Check if there is an active or historical substitution for this BattleTag
  const sub = getSubstitutionForAccount(battleTag, guildId, replayId)
  if (sub) {
    const hotsAccountId = getOrCreateSubstituteAccount(
      sub.substituteDiscordId,
      battleTag,
      sub.originalDiscordId
    )
    return {
      hotsAccountId,
      discordId: sub.substituteDiscordId,
      ownerDiscordId: sub.originalDiscordId,
      battleTag,
    }
  }

  // 2. Normal account lookup (permanent owner)
  let accountRow = db
    .prepare<[string], { id: number; discord_id: string | null }>(
      'SELECT id, discord_id FROM hots_accounts WHERE hots_battle_tag = ? COLLATE NOCASE AND owner_discord_id IS NULL LIMIT 1'
    )
    .get(battleTag)

  if (!accountRow) {
    const insertStmt = db.prepare(`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (NULL, ?, 1)
    `)
    const info = insertStmt.run(battleTag)
    accountRow = {
      id: Number(info.lastInsertRowid),
      discord_id: null,
    }
  }

  return {
    hotsAccountId: accountRow.id,
    discordId: accountRow.discord_id,
    ownerDiscordId: null,
    battleTag,
  }
}

/**
 * Clears active substitutions in a guild, either for a specific account or for all accounts.
 */
export function clearAccountSubstitutions(guildId: string, battleTag?: string): number {
  activePlayersCache.delete(guildId)
  if (battleTag) {
    const info = db
      .prepare(
        `UPDATE account_substitutions SET is_active = 0 
         WHERE guild_id = ? AND is_active = 1 AND (hots_battle_tag = ? COLLATE NOCASE OR hots_battle_tag LIKE ? COLLATE NOCASE)`
      )
      .run(guildId, battleTag, battleTag + '#%')
    return info.changes
  }

  const info = db
    .prepare(`UPDATE account_substitutions SET is_active = 0 WHERE guild_id = ? AND is_active = 1`)
    .run(guildId)
  return info.changes
}

export async function loadPlayerDataIntoSqlite() {
  //: Promise<Player[] | undefined> {
  interface PlayerJSON extends Omit<Player, 'team'> {
    team: number | null
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
  //       team: player.team ?? null, // team can be null
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
