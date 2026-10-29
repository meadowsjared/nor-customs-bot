import fs from 'fs'
import path from 'path'
import {
  AccountSubstitution,
  AccountSubstitutionRow,
  HotsAccount,
  HotsAccountRow,
  ResolvedHotsAccount,
} from '../types/player'
import { sql } from './db'
import { cachePlayerDisplayName, clearActivePlayersCache, getCachedPlayerDisplayName } from './playerCache'

function mapSubstitutionRow(r: AccountSubstitutionRow): AccountSubstitution {
  return {
    id: r.id,
    guildId: r.guild_id,
    hotsBattleTag: r.hots_battle_tag,
    originalDiscordId: r.original_discord_id,
    substituteDiscordId: r.substitute_discord_id,
    replayId: r.replay_id,
    date: r.date instanceof Date ? r.date.toISOString() : r.date,
    isActive: Boolean(r.is_active),
  }
}

/**
 * Retrieves autocomplete choices for clearing active account substitutions in a guild.
 */
export async function getAssignAccountClearChoices(
  guildId: string,
  query: string
): Promise<Array<{ name: string; value: string }>> {
  type ClearRow = {
    hots_battle_tag: string
    lender_name: string
    borrower_name: string
  }

  const trimmed = query.trim()
  const pattern = `%${trimmed}%`
  const rows = await sql<ClearRow[]>`
    SELECT
      s.hots_battle_tag,
      COALESCE(p1.discord_display_name, p1.discord_global_name, p1.discord_name, 'owner') AS lender_name,
      COALESCE(p2.discord_display_name, p2.discord_global_name, p2.discord_name, 'borrower') AS borrower_name
    FROM account_substitutions s
    LEFT JOIN players p1 ON s.original_discord_id = p1.discord_id
    LEFT JOIN players p2 ON s.substitute_discord_id = p2.discord_id
    WHERE s.guild_id = ${guildId} AND s.is_active = TRUE
      AND (${trimmed} = '' OR s.hots_battle_tag ILIKE ${pattern})
    ORDER BY s.date DESC
    LIMIT 25
  `

  return rows.map(r => ({
    name: `${r.hots_battle_tag} (loaned from ${r.lender_name} to ${r.borrower_name})`.slice(0, 100),
    value: r.hots_battle_tag,
  }))
}

/**
 * Retrieves autocomplete choices for assigning HotS accounts, prioritizing players active in the lobby.
 */
export async function getAssignAccountChoices(
  guildId: string,
  query: string
): Promise<Array<{ name: string; value: string }>> {
  type AssignRow = {
    hots_battle_tag: string
    display_name: string
    in_lobby: number
  }

  const trimmed = query.trim()
  const pattern = `%${trimmed}%`
  const rows = await sql<AssignRow[]>`
    SELECT
      ha.hots_battle_tag,
      COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, 'Unknown') AS display_name,
      CASE WHEN lp.discord_id IS NOT NULL THEN 1 ELSE 0 END AS in_lobby
    FROM hots_accounts ha
    JOIN players p ON ha.discord_id = p.discord_id
    LEFT JOIN lobby_players lp ON lp.discord_id = ha.discord_id AND lp.guild_id = ${guildId} AND lp.active = TRUE
    WHERE ha.owner_discord_id IS NULL
      AND (
        ${trimmed} = ''
        OR ha.hots_battle_tag ILIKE ${pattern}
        OR COALESCE(p.discord_display_name, p.discord_global_name, p.discord_name, '') ILIKE ${pattern}
        OR COALESCE(ha.real_id_name, '') ILIKE ${pattern}
      )
    ORDER BY in_lobby DESC, LOWER(ha.hots_battle_tag) ASC
    LIMIT 25
  `

  return rows.map(r => {
    const prefix = r.in_lobby ? '🎮 ' : ''
    return {
      name: `${prefix}${r.hots_battle_tag} (@${r.display_name})`.slice(0, 100),
      value: r.hots_battle_tag,
    }
  })
}

/**
 * Retrieves all currently active account substitutions for a specific guild.
 */
export async function getActiveSubstitutions(guildId: string): Promise<AccountSubstitution[]> {
  const rows = await sql<AccountSubstitutionRow[]>`
    SELECT *
    FROM account_substitutions
    WHERE guild_id = ${guildId} AND is_active = TRUE
    ORDER BY date DESC
  `

  return rows.map(mapSubstitutionRow)
}

/**
 * Filters out substituted/loaned accounts unless their substitution is currently active in the guild.
 */
export async function filterActiveSubstitutedAccounts(
  accounts: HotsAccountRow[],
  guildId: string
): Promise<HotsAccountRow[]> {
  const activeSubs = await getActiveSubstitutions(guildId)
  if (activeSubs.length === 0) {
    return accounts.filter(acc => !acc.owner_discord_id)
  }
  const activeSubKeys = new Set(activeSubs.map(s => `${s.substituteDiscordId}:${s.hotsBattleTag.toLowerCase()}`))
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
export function getSubstitutedAccountOwnerTag(ownerDiscordId: string, _guildId?: string): string {
  const ownerName = getCachedPlayerDisplayName(ownerDiscordId) ?? 'unknown'
  return ` [not @${ownerName}]`
}

/**
 * Formats a label describing the loan status of an account (e.g. " (owned by @Owner)" or " (loaned to @Borrower)").
 */
export function getAccountLoanStatusTag(
  account: HotsAccount,
  _guildId: string,
  playerDiscordId?: string | null,
  activeSubs: AccountSubstitution[] = []
): string {
  if (account.ownerDiscordId) {
    return ` (owned by <@${account.ownerDiscordId}>)`
  }

  if (playerDiscordId) {
    const activeSub = activeSubs.find(
      s =>
        s.originalDiscordId === playerDiscordId &&
        s.hotsBattleTag.toLowerCase() === account.hotsBattleTag.toLowerCase()
    )
    if (activeSub) {
      return ` (loaned to <@${activeSub.substituteDiscordId}>)`
    }
  }

  return ''
}

/**
 * Retrieves a substitution for a specific battle tag (either historical for a replay or active).
 */
export async function getSubstitutionForAccount(
  battleTag: string,
  guildId?: string,
  replayId?: number
): Promise<AccountSubstitution | undefined> {
  let row: AccountSubstitutionRow | undefined
  const hashPrefixPattern = `${battleTag}#%`

  if (replayId !== undefined) {
    const rows = await sql<AccountSubstitutionRow[]>`
      SELECT *
      FROM account_substitutions
      WHERE replay_id = ${replayId} AND (
        LOWER(hots_battle_tag) = LOWER(${battleTag})
        OR LOWER(${battleTag}) LIKE LOWER(hots_battle_tag || '#%')
        OR hots_battle_tag ILIKE ${hashPrefixPattern}
      )
      LIMIT 1
    `
    row = rows[0]
  }

  if (!row) {
    const rows = await sql<AccountSubstitutionRow[]>`
      SELECT *
      FROM account_substitutions
      WHERE (${guildId ?? null}::text IS NULL OR guild_id = ${guildId ?? null})
        AND is_active = TRUE
        AND (
          LOWER(hots_battle_tag) = LOWER(${battleTag})
          OR LOWER(${battleTag}) LIKE LOWER(hots_battle_tag || '#%')
          OR hots_battle_tag ILIKE ${hashPrefixPattern}
        )
      ORDER BY date DESC
      LIMIT 1
    `
    row = rows[0]
  }

  return row ? mapSubstitutionRow(row) : undefined
}

/**
 * Sets a temporary account substitution: assigns an account normally owned by originalDiscordId to substituteDiscordId.
 * Creates a duplicate row in hots_accounts for the substitute user with owner_discord_id set.
 */
export async function setAccountSubstitution(
  guildId: string,
  battleTag: string,
  substituteDiscordId: string,
  originalDiscordId?: string
): Promise<{ success: boolean; accountId: number; originalDiscordId: string; hotsBattleTag: string }> {
  let ownerId = originalDiscordId
  let fullBattleTag = battleTag
  const hashPrefixPattern = `${battleTag}#%`

  if (!ownerId) {
    const existingRows = await sql<Array<{ discord_id: string; hots_battle_tag: string }>>`
      SELECT discord_id, hots_battle_tag
      FROM hots_accounts
      WHERE (LOWER(hots_battle_tag) = LOWER(${battleTag}) OR hots_battle_tag ILIKE ${hashPrefixPattern})
        AND owner_discord_id IS NULL
        AND discord_id IS NOT NULL
      ORDER BY CASE WHEN LOWER(hots_battle_tag) = LOWER(${battleTag}) THEN 0 ELSE 1 END
      LIMIT 1
    `
    const existing = existingRows[0]
    if (existing) {
      ownerId = existing.discord_id
      fullBattleTag = existing.hots_battle_tag
    }
  }

  if (!ownerId) {
    return { success: false, accountId: 0, originalDiscordId: '', hotsBattleTag: '' }
  }

  const ownerPlayerRows = await sql<
    Array<{ discord_display_name: string; discord_global_name: string; discord_name: string }>
  >`
    SELECT discord_display_name, discord_global_name, discord_name
    FROM players
    WHERE discord_id = ${ownerId}
    LIMIT 1
  `
  if (ownerPlayerRows[0]) {
    cachePlayerDisplayName(
      ownerId,
      ownerPlayerRows[0].discord_display_name,
      ownerPlayerRows[0].discord_global_name,
      ownerPlayerRows[0].discord_name
    )
  }

  await sql`
    UPDATE account_substitutions
    SET is_active = FALSE
    WHERE guild_id = ${guildId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
      AND is_active = TRUE
  `

  await sql`
    INSERT INTO account_substitutions (guild_id, hots_battle_tag, original_discord_id, substitute_discord_id, is_active)
    VALUES (${guildId}, ${fullBattleTag}, ${ownerId}, ${substituteDiscordId}, TRUE)
  `

  const accountId = await getOrCreateSubstituteAccount(substituteDiscordId, fullBattleTag, ownerId)

  clearActivePlayersCache(guildId)

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
export async function getOrCreateSubstituteAccount(
  substituteDiscordId: string,
  fullBattleTag: string,
  ownerId: string
): Promise<number> {
  const existingRows = await sql<Array<{ id: number }>>`
    SELECT id
    FROM hots_accounts
    WHERE discord_id = ${substituteDiscordId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
    LIMIT 1
  `
  const checkSubAccount = existingRows[0]

  if (checkSubAccount) {
    await sql`UPDATE hots_accounts SET owner_discord_id = ${ownerId} WHERE id = ${checkSubAccount.id}`
    return checkSubAccount.id
  }

  const origRows = await sql<HotsAccountRow[]>`
    SELECT *
    FROM hots_accounts
    WHERE discord_id = ${ownerId}
      AND LOWER(hots_battle_tag) = LOWER(${fullBattleTag})
    LIMIT 1
  `
  const origAccount = origRows[0]

  const inserted = await sql<Array<{ id: number }>>`
    INSERT INTO hots_accounts (
      discord_id, hots_battle_tag, is_primary, owner_discord_id,
      hp_region, hp_blizz_id, hp_qm_mmr, hp_sl_mmr, hp_ar_mmr, hp_qm_games, hp_sl_games, hp_ar_games
    ) VALUES (
      ${substituteDiscordId},
      ${fullBattleTag},
      FALSE,
      ${ownerId},
      ${origAccount?.hp_region ?? origAccount?.HP_Region ?? null},
      ${origAccount?.hp_blizz_id !== undefined && origAccount?.hp_blizz_id !== null ? String(origAccount.hp_blizz_id) : origAccount?.HP_Blizz_ID !== undefined && origAccount?.HP_Blizz_ID !== null ? String(origAccount.HP_Blizz_ID) : null},
      ${origAccount?.hp_qm_mmr ?? origAccount?.HP_QM_MMR ?? null},
      ${origAccount?.hp_sl_mmr ?? origAccount?.HP_SL_MMR ?? null},
      ${origAccount?.hp_ar_mmr ?? origAccount?.HP_AR_MMR ?? null},
      ${origAccount?.hp_qm_games ?? origAccount?.HP_QM_Games ?? null},
      ${origAccount?.hp_sl_games ?? origAccount?.HP_SL_Games ?? null},
      ${origAccount?.hp_ar_games ?? origAccount?.HP_AR_Games ?? null}
    )
    RETURNING id
  `
  return inserted[0].id
}

const resolvedAccountCache = new Map<string, { id: number; discordId: string | null }>()

export function clearResolvedAccountCache(): void {
  resolvedAccountCache.clear()
}

/**
 * Retrieves the effective HotS account information for a BattleTag, taking any active
 * or historical substitution (for a specific replay) into account.
 */
export async function getAccountWithSubstitution(
  battleTag: string,
  guildId: string,
  replayId?: number
): Promise<ResolvedHotsAccount> {
  const sub = await getSubstitutionForAccount(battleTag, guildId, replayId)
  if (sub) {
    const hotsAccountId = await getOrCreateSubstituteAccount(sub.substituteDiscordId, battleTag, sub.originalDiscordId)
    return {
      hotsAccountId,
      discordId: sub.substituteDiscordId,
      ownerDiscordId: sub.originalDiscordId,
      battleTag,
    }
  }

  const cacheKey = battleTag.toLowerCase()
  const cached = resolvedAccountCache.get(cacheKey)
  if (cached) {
    return {
      hotsAccountId: cached.id,
      discordId: cached.discordId,
      ownerDiscordId: null,
      battleTag,
    }
  }

  const accountRows = await sql<Array<{ id: number; discord_id: string | null }>>`
    SELECT id, discord_id
    FROM hots_accounts
    WHERE LOWER(hots_battle_tag) = LOWER(${battleTag}) AND owner_discord_id IS NULL
    LIMIT 1
  `
  let accountRow = accountRows[0]

  if (!accountRow) {
    const inserted = await sql<Array<{ id: number; discord_id: string | null }>>`
      INSERT INTO hots_accounts (discord_id, hots_battle_tag, is_primary)
      VALUES (NULL, ${battleTag}, TRUE)
      ON CONFLICT (LOWER(hots_battle_tag)) WHERE owner_discord_id IS NULL DO UPDATE SET
        hots_battle_tag = EXCLUDED.hots_battle_tag
      RETURNING id, discord_id
    `
    accountRow = inserted[0]
  }

  resolvedAccountCache.set(cacheKey, { id: accountRow.id, discordId: accountRow.discord_id })

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
export async function clearAccountSubstitutions(guildId: string, battleTag?: string): Promise<number> {
  clearActivePlayersCache(guildId)
  if (battleTag) {
    const hashPrefixPattern = `${battleTag}#%`
    const result = await sql`
      UPDATE account_substitutions
      SET is_active = FALSE
      WHERE guild_id = ${guildId}
        AND is_active = TRUE
        AND (LOWER(hots_battle_tag) = LOWER(${battleTag}) OR hots_battle_tag ILIKE ${hashPrefixPattern})
    `
    return result.count
  }

  const result = await sql`
    UPDATE account_substitutions
    SET is_active = FALSE
    WHERE guild_id = ${guildId} AND is_active = TRUE
  `
  return result.count
}

interface SqliteFilenameRow {
  filename: string | null
}

interface SqliteSubReplayIdRow {
  replay_id: number | null
}

interface SqliteReader {
  getFilename(replayId: number): string | null
  getOrigReplayId(subId: number): number | null
  close(): void
}

async function openSqliteReader(filePath: string): Promise<SqliteReader | null> {
  if (typeof process !== 'undefined' && process.versions?.bun) {
    const { Database } = await import('bun:sqlite')
    const db = new Database(filePath, { readonly: true })
    const filenameQuery = db.query<SqliteFilenameRow, [number]>('SELECT filename FROM hots_replays WHERE id = ?')
    const subQuery = db.query<SqliteSubReplayIdRow, [number]>('SELECT replay_id FROM account_substitutions WHERE id = ?')

    return {
      getFilename(replayId: number): string | null {
        const row = filenameQuery.get(replayId)
        return row?.filename ?? null
      },
      getOrigReplayId(subId: number): number | null {
        const row = subQuery.get(subId)
        return row?.replay_id ?? null
      },
      close(): void {
        db.close()
      },
    }
  }

  const { createRequire } = await import('module')
  const require = createRequire(import.meta.url)
  const DatabaseConstructor = require('better-sqlite3')
  const db = new DatabaseConstructor(filePath, { readonly: true })
  const filenameStmt = db.prepare('SELECT filename FROM hots_replays WHERE id = ?')
  const subStmt = db.prepare('SELECT replay_id FROM account_substitutions WHERE id = ?')

  return {
    getFilename(replayId: number): string | null {
      const row: unknown = filenameStmt.get(replayId)
      if (typeof row === 'object' && row !== null && 'filename' in row) {
        const fn = row.filename
        return typeof fn === 'string' ? fn : null
      }
      return null
    },
    getOrigReplayId(subId: number): number | null {
      const row: unknown = subStmt.get(subId)
      if (typeof row === 'object' && row !== null && 'replay_id' in row) {
        const id = row.replay_id
        return typeof id === 'number' ? id : null
      }
      return null
    },
    close(): void {
      db.close()
    },
  }
}

/**
 * Re-links any historical account_substitutions whose replay_id points to an old/missing replay ID
 * (e.g. after re-importing replays into a fresh PostgreSQL database) by matching original replay filenames.
 */
export async function relinkAccountSubstitutions(): Promise<number> {
  const orphaned = await sql<Array<{ id: number; replay_id: number; hots_battle_tag: string }>>`
    SELECT a.id, a.replay_id, a.hots_battle_tag
    FROM account_substitutions a
    LEFT JOIN replays r ON a.replay_id = r.id
    WHERE a.replay_id IS NOT NULL AND r.id IS NULL
  `

  if (orphaned.length === 0) {
    return 0
  }

  let remappedCount = 0
  const sqliteCandidate = 'store/customs_cruncher.db'
  if (fs.existsSync(sqliteCandidate)) {
    try {
      const reader = await openSqliteReader(sqliteCandidate)
      if (!reader) return 0

      for (const sub of orphaned) {
        let replayFilename = reader.getFilename(sub.replay_id)
        if (!replayFilename) {
          const origReplayId = reader.getOrigReplayId(sub.id)
          if (origReplayId) {
            replayFilename = reader.getFilename(origReplayId)
          }
        }

        if (replayFilename) {
          const baseName = path.basename(replayFilename)
          const searchPattern = `%${baseName}`
          const matches = await sql<Array<{ id: number }>>`
            SELECT id
            FROM replays
            WHERE file LIKE ${searchPattern} OR filename LIKE ${searchPattern}
            LIMIT 1
          `
          if (matches[0]) {
            await sql`
              UPDATE account_substitutions
              SET replay_id = ${matches[0].id}
              WHERE id = ${sub.id}
            `
            remappedCount++
          }
        }
      }
      reader.close()
    } catch (err) {
      console.error('Error re-linking account substitutions from SQLite:', err)
    }
  }

  return remappedCount
}

