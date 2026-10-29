import { Database } from 'bun:sqlite'
import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { resolve } from 'path'
import postgres from 'postgres'
import { CHANNELS_TABLE_SCHEMA_SQL } from '../types/channel'
import { MAP_VOTE_TABLE_SCHEMA_SQL } from '../types/mapVote'
import { PLAYERS_TABLES_SCHEMA_SQL } from '../types/player'
import { SETTINGS_TABLE_SCHEMA_SQL } from '../types/settings'

dotenv.config()

// Always connect to development database (discord_bot_dev) for safety
const devConnectionString = process.env.DATABASE_URL_DEV
if (!devConnectionString) {
  throw new Error('Missing DATABASE_URL_DEV in environment / .env')
}

const sql = postgres(devConnectionString, { onnotice: () => {} })

type SQLitePlayerRow = {
  discord_id: string
  discord_name: string
  discord_global_name: string
  discord_display_name: string
  role: string | null
  adjustment: number | null
  last_active: string
}

type SQLiteHotsAccountRow = {
  id: number
  discord_id: string | null
  is_primary: number
  updated_at: string
  hots_battle_tag: string
  HP_Region: number | null
  HP_Blizz_ID: number | string | null
  HP_QM_MMR: number | null
  HP_SL_MMR: number | null
  HP_AR_MMR: number | null
  HP_QM_Games: number | null
  HP_SL_Games: number | null
  HP_AR_Games: number | null
  real_id_name: string | null
  owner_discord_id: string | null
}

type SQLiteSettingRow = {
  guild_id: string
  key: string
  value: string
  updated_at?: string
}

type SQLiteChannelRow = {
  guild_id: string
  channelType: string
  channelId: string
  channelName: string
}

type SQLiteAccountSubstitutionRow = {
  id: number
  guild_id: string
  hots_battle_tag: string
  original_discord_id: string
  substitute_discord_id: string
  replay_id: number | null
  date: string
  is_active: number
}

type SQLiteMapVoteSessionRow = {
  id: string
  channel_id?: string
  channelId?: string
  message_ids?: string
  messageIds?: string
  created_by?: string
  createdBy?: string
  created_at?: string
  createdAt?: string
  active: number
  title: string | null
  guild_id?: string | null
}

type SQLiteMapVoteRow = {
  id: number
  session_id: string
  user_id: string
  user_name: string
  map_id: string
  voted_at: string
}

function parseMessageIds(raw: string | undefined): string[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string')
    }
  } catch {
    // fallback if raw was comma-separated or plain text
    return raw.split(',').map(s => s.trim()).filter(Boolean)
  }
  return []
}

async function initializePostgresSchemas(): Promise<void> {
  console.log('📦 Initializing PostgreSQL schemas...')
  await sql.unsafe(PLAYERS_TABLES_SCHEMA_SQL)
  await sql.unsafe(SETTINGS_TABLE_SCHEMA_SQL)
  await sql.unsafe(CHANNELS_TABLE_SCHEMA_SQL)
  await sql.unsafe(MAP_VOTE_TABLE_SCHEMA_SQL)
  console.log('✅ PostgreSQL schemas verified.\n')
}

export async function migrateFromSqlite(sqlitePath: string): Promise<void> {
  const resolvedPath = resolve(sqlitePath)
  if (!existsSync(resolvedPath)) {
    throw new Error(`SQLite database not found at path: ${resolvedPath}`)
  }

  console.log(`🚀 Starting migration from SQLite: ${resolvedPath}`)

  const dbInfo = await sql<Array<{ current_user: string; current_database: string }>>`
    SELECT current_user, current_database()
  `
  const targetUser = dbInfo[0]?.current_user ?? 'unknown'
  const targetDb = dbInfo[0]?.current_database ?? 'unknown'
  console.log(`🎯 Target PostgreSQL: ${targetDb} (connected as ${targetUser}) [DEV ONLY]\n`)

  const sqlite = new Database(resolvedPath, { readonly: true })

  try {
    await initializePostgresSchemas()

    // 1. Migrate players
    console.log('⏳ Migrating players...')
    const players = sqlite.query<SQLitePlayerRow, []>('SELECT * FROM players').all()
    for (const p of players) {
      await sql`
        INSERT INTO players (
          discord_id,
          discord_name,
          discord_global_name,
          discord_display_name,
          role,
          adjustment,
          last_active
        ) VALUES (
          ${p.discord_id},
          ${p.discord_name},
          ${p.discord_global_name},
          ${p.discord_display_name},
          ${p.role},
          ${p.adjustment},
          ${p.last_active ? new Date(p.last_active) : new Date()}
        )
        ON CONFLICT (discord_id) DO UPDATE SET
          discord_name = EXCLUDED.discord_name,
          discord_global_name = EXCLUDED.discord_global_name,
          discord_display_name = EXCLUDED.discord_display_name,
          role = EXCLUDED.role,
          adjustment = EXCLUDED.adjustment,
          last_active = EXCLUDED.last_active
      `
    }
    console.log(`  ✓ players migrated (${players.length} rows)`)

    // 2. Migrate hots_accounts (only current columns, skipping legacy SotS_* stats)
    console.log('⏳ Migrating hots_accounts...')
    const accounts = sqlite
      .query<
        SQLiteHotsAccountRow,
        []
      >(
        'SELECT id, discord_id, is_primary, updated_at, hots_battle_tag, HP_Region, HP_Blizz_ID, HP_QM_MMR, HP_SL_MMR, HP_AR_MMR, HP_QM_Games, HP_SL_Games, HP_AR_Games, real_id_name, owner_discord_id FROM hots_accounts'
      )
      .all()

    for (const a of accounts) {
      const blizzId = a.HP_Blizz_ID !== null && a.HP_Blizz_ID !== undefined ? String(a.HP_Blizz_ID) : null
      await sql`
        INSERT INTO hots_accounts (
          id,
          discord_id,
          hots_battle_tag,
          is_primary,
          real_id_name,
          owner_discord_id,
          hp_region,
          hp_blizz_id,
          hp_qm_mmr,
          hp_sl_mmr,
          hp_ar_mmr,
          hp_qm_games,
          hp_sl_games,
          hp_ar_games,
          updated_at
        ) VALUES (
          ${a.id},
          ${a.discord_id},
          ${a.hots_battle_tag},
          ${Boolean(a.is_primary)},
          ${a.real_id_name},
          ${a.owner_discord_id},
          ${a.HP_Region},
          ${blizzId},
          ${a.HP_QM_MMR},
          ${a.HP_SL_MMR},
          ${a.HP_AR_MMR},
          ${a.HP_QM_Games},
          ${a.HP_SL_Games},
          ${a.HP_AR_Games},
          ${a.updated_at ? new Date(a.updated_at) : new Date()}
        )
        ON CONFLICT (id) DO UPDATE SET
          discord_id = EXCLUDED.discord_id,
          hots_battle_tag = EXCLUDED.hots_battle_tag,
          is_primary = EXCLUDED.is_primary,
          real_id_name = EXCLUDED.real_id_name,
          owner_discord_id = EXCLUDED.owner_discord_id,
          hp_region = EXCLUDED.hp_region,
          hp_blizz_id = EXCLUDED.hp_blizz_id,
          hp_qm_mmr = EXCLUDED.hp_qm_mmr,
          hp_sl_mmr = EXCLUDED.hp_sl_mmr,
          hp_ar_mmr = EXCLUDED.hp_ar_mmr,
          hp_qm_games = EXCLUDED.hp_qm_games,
          hp_sl_games = EXCLUDED.hp_sl_games,
          hp_ar_games = EXCLUDED.hp_ar_games,
          updated_at = EXCLUDED.updated_at
      `
    }
    // Update serial sequence so future inserts do not collide
    await sql`SELECT setval(pg_get_serial_sequence('hots_accounts', 'id'), COALESCE((SELECT MAX(id) FROM hots_accounts), 1))`
    console.log(`  ✓ hots_accounts migrated (${accounts.length} rows) & sequence reset`)

    // 3. Migrate settings
    console.log('⏳ Migrating settings...')
    const settings = sqlite.query<SQLiteSettingRow, []>('SELECT * FROM settings').all()
    for (const s of settings) {
      await sql`
        INSERT INTO settings (
          guild_id,
          key,
          value,
          updated_at
        ) VALUES (
          ${s.guild_id},
          ${s.key},
          ${s.value},
          ${s.updated_at ? new Date(s.updated_at) : new Date()}
        )
        ON CONFLICT (guild_id, key) DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at
      `
    }
    console.log(`  ✓ settings migrated (${settings.length} rows)`)

    // 4. Migrate channels (camelCase -> snake_case)
    console.log('⏳ Migrating channels...')
    const channels = sqlite.query<SQLiteChannelRow, []>('SELECT * FROM channels').all()
    for (const c of channels) {
      await sql`
        INSERT INTO channels (
          guild_id,
          channel_type,
          channel_id,
          channel_name,
          updated_at
        ) VALUES (
          ${c.guild_id},
          ${c.channelType},
          ${c.channelId},
          ${c.channelName},
          NOW()
        )
        ON CONFLICT (guild_id, channel_type) DO UPDATE SET
          channel_id = EXCLUDED.channel_id,
          channel_name = EXCLUDED.channel_name,
          updated_at = NOW()
      `
    }
    console.log(`  ✓ channels migrated (${channels.length} rows)`)

    // 5. Migrate account_substitutions
    console.log('⏳ Migrating account_substitutions...')
    const subs = sqlite.query<SQLiteAccountSubstitutionRow, []>('SELECT * FROM account_substitutions').all()
    for (const sub of subs) {
      await sql`
        INSERT INTO account_substitutions (
          id,
          guild_id,
          hots_battle_tag,
          original_discord_id,
          substitute_discord_id,
          replay_id,
          date,
          is_active
        ) VALUES (
          ${sub.id},
          ${sub.guild_id},
          ${sub.hots_battle_tag},
          ${sub.original_discord_id},
          ${sub.substitute_discord_id},
          ${sub.replay_id},
          ${sub.date ? new Date(sub.date) : new Date()},
          ${Boolean(sub.is_active)}
        )
        ON CONFLICT (id) DO UPDATE SET
          guild_id = EXCLUDED.guild_id,
          hots_battle_tag = EXCLUDED.hots_battle_tag,
          original_discord_id = EXCLUDED.original_discord_id,
          substitute_discord_id = EXCLUDED.substitute_discord_id,
          replay_id = EXCLUDED.replay_id,
          date = EXCLUDED.date,
          is_active = EXCLUDED.is_active
      `
    }
    await sql`SELECT setval(pg_get_serial_sequence('account_substitutions', 'id'), COALESCE((SELECT MAX(id) FROM account_substitutions), 1))`
    console.log(`  ✓ account_substitutions migrated (${subs.length} rows) & sequence reset`)

    // 6. Migrate map_vote_sessions (parent required by map_votes foreign key)
    console.log('⏳ Migrating map_vote_sessions...')
    const sessions = sqlite.query<SQLiteMapVoteSessionRow, []>('SELECT * FROM map_vote_sessions').all()
    for (const sess of sessions) {
      const channelId = sess.channel_id ?? sess.channelId ?? ''
      const rawMessageIds = sess.message_ids ?? sess.messageIds
      const messageIds = parseMessageIds(rawMessageIds)
      const createdBy = sess.created_by ?? sess.createdBy ?? 'unknown'
      const createdAtRaw = sess.created_at ?? sess.createdAt
      const createdAt = createdAtRaw ? new Date(createdAtRaw) : new Date()

      await sql`
        INSERT INTO map_vote_sessions (
          id,
          guild_id,
          channel_id,
          message_ids,
          created_by,
          created_at,
          active,
          title
        ) VALUES (
          ${sess.id},
          ${sess.guild_id ?? 'global'},
          ${channelId},
          ${messageIds},
          ${createdBy},
          ${createdAt},
          ${Boolean(sess.active)},
          ${sess.title}
        )
        ON CONFLICT (id) DO UPDATE SET
          guild_id = EXCLUDED.guild_id,
          channel_id = EXCLUDED.channel_id,
          message_ids = EXCLUDED.message_ids,
          created_by = EXCLUDED.created_by,
          created_at = EXCLUDED.created_at,
          active = EXCLUDED.active,
          title = EXCLUDED.title
      `
    }
    console.log(`  ✓ map_vote_sessions migrated (${sessions.length} rows)`)

    // 7. Migrate map_votes
    console.log('⏳ Migrating map_votes...')
    const votes = sqlite.query<SQLiteMapVoteRow, []>('SELECT * FROM map_votes').all()
    for (const v of votes) {
      await sql`
        INSERT INTO map_votes (
          id,
          session_id,
          user_id,
          user_name,
          map_id,
          voted_at
        ) VALUES (
          ${v.id},
          ${v.session_id},
          ${v.user_id},
          ${v.user_name},
          ${v.map_id},
          ${v.voted_at ? new Date(v.voted_at) : new Date()}
        )
        ON CONFLICT (session_id, user_id) DO UPDATE SET
          user_name = EXCLUDED.user_name,
          map_id = EXCLUDED.map_id,
          voted_at = EXCLUDED.voted_at
      `
    }
    await sql`SELECT setval(pg_get_serial_sequence('map_votes', 'id'), COALESCE((SELECT MAX(id) FROM map_votes), 1))`
    console.log(`  ✓ map_votes migrated (${votes.length} rows) & sequence reset`)

    // Verification Summary
    console.log('\n📊 Migration Verification Summary:')
    console.log('──────────────────────────────────────────────────────')
    console.log('Table                     | SQLite Count | PG Count')
    console.log('──────────────────────────────────────────────────────')

    const tableCounts = [
      { name: 'players', sqlite: players.length, query: sql<Array<{ count: string }>>`SELECT count(*) FROM players` },
      {
        name: 'hots_accounts',
        sqlite: accounts.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM hots_accounts`,
      },
      {
        name: 'settings',
        sqlite: settings.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM settings`,
      },
      {
        name: 'channels',
        sqlite: channels.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM channels`,
      },
      {
        name: 'account_substitutions',
        sqlite: subs.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM account_substitutions`,
      },
      {
        name: 'map_vote_sessions',
        sqlite: sessions.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM map_vote_sessions`,
      },
      {
        name: 'map_votes',
        sqlite: votes.length,
        query: sql<Array<{ count: string }>>`SELECT count(*) FROM map_votes`,
      },
    ]

    for (const tc of tableCounts) {
      const res = await tc.query
      const pgCount = res[0]?.count ?? '0'
      const match = Number(pgCount) >= tc.sqlite ? '✅' : '⚠️'
      console.log(
        `${match} ${tc.name.padEnd(24)} | ${String(tc.sqlite).padStart(12)} | ${String(pgCount).padStart(8)}`
      )
    }
    console.log('──────────────────────────────────────────────────────\n')
    console.log('🎉 Migration finished successfully!')
  } finally {
    sqlite.close()
  }
}

// Direct CLI invocation
if (import.meta.main) {
  const sqliteFile = process.argv[2] ?? './store/customs_cruncher.db'
  migrateFromSqlite(sqliteFile)
    .then(async () => {
      await sql.end()
      process.exit(0)
    })
    .catch(async err => {
      console.error('❌ Migration failed:', err)
      await sql.end()
      process.exit(1)
    })
}

