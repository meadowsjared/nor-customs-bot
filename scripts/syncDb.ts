import { spawn } from 'child_process'
import readline from 'readline/promises'
import dotenv from 'dotenv'

dotenv.config()

type SyncDirection = 'dev-to-prod' | 'prod-to-dev'

function printHelp(): void {
  console.log(`
Database Sync Tool for Customs Cruncher

Usage:
  bun run db:sync <direction> [options]
  bun run db:dev-to-prod [options]
  bun run db:prod-to-dev [options]

Directions:
  dev-to-prod   Copy development database to production (overwrites prod)
  prod-to-dev   Pull production database into development (overwrites dev)

Options:
  --yes, -y     Skip confirmation prompt
  --help, -h    Show this help message

Examples:
  bun run db:dev-to-prod
  bun run db:prod-to-dev --yes
`)
}

function parseDbName(connectionUrl: string, fallback: string): string {
  try {
    const parsed = new URL(connectionUrl)
    return parsed.pathname.replace(/^\//, '') || fallback
  } catch {
    return fallback
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  const rawDirection = args.find(arg => !arg.startsWith('-'))
  let direction: SyncDirection | null = null

  if (rawDirection === 'dev-to-prod') {
    direction = 'dev-to-prod'
  } else if (rawDirection === 'prod-to-dev') {
    direction = 'prod-to-dev'
  }

  if (!direction) {
    console.error('Error: Please specify a sync direction: "dev-to-prod" or "prod-to-dev"')
    printHelp()
    process.exit(1)
  }

  const devUrl = process.env.DATABASE_URL_DEV
  const prodUrl = process.env.DATABASE_URL_PROD

  if (!devUrl || !prodUrl) {
    console.error('Error: Both DATABASE_URL_DEV and DATABASE_URL_PROD must be set in .env')
    process.exit(1)
  }

  const devDbName = parseDbName(devUrl, 'dev')
  const prodDbName = parseDbName(prodUrl, 'prod')

  const isDevToProd = direction === 'dev-to-prod'
  const sourceUrl = isDevToProd ? devUrl : prodUrl
  const destUrl = isDevToProd ? prodUrl : devUrl
  const sourceDbName = isDevToProd ? devDbName : prodDbName
  const destDbName = isDevToProd ? prodDbName : devDbName

  console.log(`\n📦 Database Sync: ${isDevToProd ? 'Development -> Production' : 'Production -> Development'}`)
  console.log(`   Source:      ${sourceDbName}`)
  console.log(`   Destination: ${destDbName}\n`)

  const isConfirmed = args.includes('--yes') || args.includes('-y')

  if (!isConfirmed) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const promptMessage = isDevToProd
      ? `⚠️  CRITICAL WARNING: This will overwrite the PRODUCTION database (${destDbName}) with data from dev (${sourceDbName}).\n   Are you sure you want to proceed? (y/N): `
      : `⚠️  WARNING: This will overwrite your local DEVELOPMENT database (${destDbName}) with data from prod (${sourceDbName}).\n   Are you sure you want to proceed? (y/N): `

    const answer = await rl.question(promptMessage)
    rl.close()

    if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
      console.log('Operation cancelled. No changes were made.')
      process.exit(0)
    }
  }

  console.log('\n🚀 Starting streaming copy (pg_dump | psql)...')
  const startTime = Date.now()

  const dump = spawn('pg_dump', ['--clean', '--if-exists', '--no-owner', '--no-privileges', sourceUrl], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })

  const restore = spawn('psql', [destUrl], {
    stdio: ['pipe', 'inherit', 'inherit'],
  })

  dump.stdout.pipe(restore.stdin)

  await new Promise<void>((resolve, reject) => {
    let dumpError: Error | null = null
    let restoreError: Error | null = null

    dump.on('error', err => {
      dumpError = err
    })

    restore.on('error', err => {
      restoreError = err
    })

    restore.on('close', code => {
      if (restoreError) {
        reject(restoreError)
      } else if (dumpError) {
        reject(dumpError)
      } else if (code !== 0) {
        reject(new Error(`psql process exited with code ${code}`))
      } else {
        resolve()
      }
    })
  })

  if (isDevToProd) {
    console.log('🧹 Clearing active test lobby in production...')
    await new Promise<void>((resolve, reject) => {
      const truncate = spawn('psql', [destUrl, '-c', 'TRUNCATE TABLE lobby_players;'], {
        stdio: ['ignore', 'inherit', 'inherit'],
      })

      truncate.on('close', code => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Failed to truncate lobby_players in prod (code ${code})`))
        }
      })
    })
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n✅ Database successfully synchronized (${sourceDbName} -> ${destDbName}) in ${durationSec}s!`)
  console.log(`   - All tables, constraints, GIN indexes, and replays copied.`)
  console.log(`   - Materialized view and serial sequences updated.`)
  if (isDevToProd) {
    console.log(`   - Active lobby_players table cleared for fresh prod usage.`)
  }
  console.log('')
}

main().catch(err => {
  console.error('\n❌ Database sync failed:', err)
  process.exit(1)
})

