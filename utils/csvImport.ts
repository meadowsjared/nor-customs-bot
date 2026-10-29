import { parse } from 'csv-parse/sync'
import { readFileSync } from 'fs'
import { sql } from '../store/db'
import { CSVColumnDefinition, CSVRecord, HOTS_ACCOUNTS_COLUMNS } from '../types/csvSpreadsheet'
import { HotsAccountRow } from '../types/player'
import { SQLiteColumnType } from './sql'

class CSVImporter {
  private readonly db = sql

  // Helper function to convert string values to appropriate types
  private parseValue(value: string | number): number | string | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null
    }

    if (typeof value === 'number') {
      return value
    }

    // Remove commas and parse as number if it's numeric
    const cleanValue = value.replace(/,/g, '')
    const numericValue = parseFloat(cleanValue)

    if (!isNaN(numericValue)) {
      return numericValue
    }

    return value
  }

  // Helper function to parse percentage values
  private parsePercentage(value: string | number): number | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null
    }

    if (typeof value === 'number') {
      return value
    }

    const cleanValue = value.replace('%', '')
    const numericValue = parseFloat(cleanValue)

    return !isNaN(numericValue) ? numericValue / 100 : null
  }

  // Read and parse the CSV file
  private readCSV(): CSVRecord[] {
    try {
      const csvContent = readFileSync('./store/Heroes of the Storm WEEKLY FRIDAYS 9_30PM - Stats.csv', 'utf8')
      const records = parse<CSVRecord>(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })

      return records
    } catch (error) {
      console.error('Error reading CSV file:', error)
      throw error
    }
  }

  // Get all hots_accounts from database
  private async getHotsAccounts(): Promise<HotsAccountRow[]> {
    return await this.db<HotsAccountRow[]>`
      SELECT
        id,
        hots_battle_tag,
        discord_id,
        is_primary,
        real_id_name,
        hp_qm_mmr,
        hp_sl_mmr,
        hp_ar_mmr,
        hp_qm_games,
        hp_sl_games,
        hp_ar_games
      FROM hots_accounts
    `
  }

  // Task 1: Find accounts in CSV but missing from database
  public async findMissingFromDatabase(): Promise<CSVRecord[]> {
    console.log('🔍 Task 1: Finding accounts in CSV but missing from database...\n')

    const csvRecords = this.readCSV()
    const dbAccounts = await this.getHotsAccounts()

    const dbBattleTags = new Set(dbAccounts.map(account => account.hots_battle_tag))

    const missingFromDb = Array.from(csvRecords).filter(record => !dbBattleTags.has(record.Lookup))

    console.log(`Found ${missingFromDb.length} accounts in CSV but missing from database:`)
    missingFromDb.forEach((record, index) => console.log(` ${index + 1}: ${record.Lookup}\t\t${record.Sorting}`))
    console.log('')

    return missingFromDb
  }

  // Task 2: Find accounts in database but not in CSV
  public async findMissingFromCSV(): Promise<string[]> {
    console.log('🔍 Task 2: Finding accounts in database but not in CSV...\n')

    const csvRecords = this.readCSV()
    const dbAccounts = await this.getHotsAccounts()

    const csvLookups = new Set(csvRecords.map(record => record.Lookup))
    const dbBattleTags = dbAccounts.map(account => account.hots_battle_tag)

    const missingFromCsv = dbBattleTags.filter(battleTag => !csvLookups.has(battleTag))

    console.log(`Found ${missingFromCsv.length} accounts in database but not in CSV:`)
    missingFromCsv.forEach(battleTag => console.log(`  - ${battleTag}`))
    console.log('')

    return missingFromCsv
  }

  public async findMatchingRecords(): Promise<string[]> {
    console.log('🔍 Task 3: Finding accounts with matching data...\n')

    const csvRecords = this.readCSV()
    const dbAccounts = await this.getHotsAccounts()

    const matchingRecords = dbAccounts
      .filter(record => csvRecords.some(account => account.Lookup === record.hots_battle_tag))
      .map(record => record.hots_battle_tag)

    console.log(`Found ${matchingRecords.length} accounts with matching data:`)
    matchingRecords.forEach(battleTag => console.log(`  - ${battleTag}`))
    console.log('')

    return matchingRecords
  }

  private parseBoolean(value: string | number): number {
    return value === 'TRUE' ? 1 : 0
  }

  public parseValueForColumn(record: CSVRecord, column: CSVColumnDefinition): number | string | null {
    const csvColumnName = column.csvColumnName
    if (column.name !== 'updated_at' && !csvColumnName) {
      console.warn(`No CSV mapping found for DB column: ${column.name}`)
      return null
    }

    const rawValue = csvColumnName ? record[csvColumnName] : null

    // Handle empty/null values
    if (!rawValue || rawValue === '' || rawValue === 'None' || rawValue === undefined) {
      return null
    }

    // Parse based on column type and special cases
    switch (column.dbType) {
      case SQLiteColumnType.INTEGER:
        if (column.isBoolean) {
          return this.parseBoolean(rawValue)
        }
        return this.parseValue(rawValue)

      case SQLiteColumnType.REAL:
        if (column.isPercentage) {
          return this.parsePercentage(rawValue)
        }
        return this.parseValue(rawValue)

      case SQLiteColumnType.TEXT:
        return rawValue

      default:
        return rawValue
    }
  }

  // Task 4: Transfer data from CSV to database for matching accounts
  public async transferMatchingData(): Promise<number> {
    console.log('🔄 Task 4: Transferring data for matching accounts...\n')

    const csvRecords = this.readCSV()
    const dbAccounts = await this.getHotsAccounts()

    const dbBattleTags = new Set(dbAccounts.map(account => account.hots_battle_tag))

    // Find matching accounts
    const matchingRecords = csvRecords.filter(record => dbBattleTags.has(record.Lookup))

    console.log(`Found ${matchingRecords.length} matching accounts to transfer data for.`)

    if (matchingRecords.length === 0) {
      console.log('No matching accounts found. Nothing to transfer.')
      return 0
    }

    let updatedCount = 0

    // Process each matching record
    for (const record of matchingRecords) {
      try {
        const qmMmr = this.parseValue(record['QM MMR'] ?? '')
        const slMmr = this.parseValue(record['SL MMR'] ?? '')
        const arMmr = this.parseValue(record['AR MMR'] ?? '')
        const qmGames = this.parseValue(record['QM Games'] ?? '')
        const slGames = this.parseValue(record['SL Games'] ?? '')
        const arGames = this.parseValue(record['AR Games'] ?? '')

        const result = await this.db`
          UPDATE hots_accounts
          SET
            hp_qm_mmr = ${typeof qmMmr === 'number' ? Math.round(qmMmr) : null},
            hp_sl_mmr = ${typeof slMmr === 'number' ? Math.round(slMmr) : null},
            hp_ar_mmr = ${typeof arMmr === 'number' ? Math.round(arMmr) : null},
            hp_qm_games = ${typeof qmGames === 'number' ? Math.round(qmGames) : null},
            hp_sl_games = ${typeof slGames === 'number' ? Math.round(slGames) : null},
            hp_ar_games = ${typeof arGames === 'number' ? Math.round(arGames) : null},
            updated_at = NOW()
          WHERE hots_battle_tag = ${record.Lookup}
        `

        if (result.count > 0) {
          updatedCount++
          console.log(`  ✅ Updated: ${record.Lookup}`)
        } else {
          console.log(`  ⚠️  No changes: ${record.Lookup}`)
        }
      } catch (error) {
        console.error(`  ❌ Error updating ${record.Lookup}:`, error)
      }
    }

    console.log(`\n✅ Successfully updated ${updatedCount} out of ${matchingRecords.length} accounts.`)
    return updatedCount
  }

  public async close(): Promise<void> {
    await this.db.end()
  }
}

// Show usage information
function showUsage() {
  console.log('📋 CSV Import Tool Usage:')
  console.log('')
  console.log('Available commands:')
  console.log('  bun csv:help                              - Show this help message')
  console.log('  bun check:db                              - Find accounts in CSV but missing from database')
  console.log('  bun check:csv                             - Find accounts in database but not in CSV')
  console.log('  bun check:match                           - Find accounts with matching data')
  console.log('  bun import:csv                            - Transfer data for matching accounts')
  console.log('')
}

// Main execution function with command-line argument handling
async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === '--help' || command === '-h') {
    showUsage()
    return
  }

  const importer = new CSVImporter()

  try {
    switch (command) {
      case 'missing-from-db': {
        console.log('🚀 Running Task 1: Find Missing from Database...\n')
        const missingDb = await importer.findMissingFromDatabase()
        console.log(`📊 Result: ${missingDb.length} accounts found in CSV but missing from database.`)
        break
      }

      case 'missing-from-csv': {
        console.log('🚀 Running Task 2: Find Missing from CSV...\n')
        const missingCsv = await importer.findMissingFromCSV()
        console.log(`📊 Result: ${missingCsv.length} accounts found in database but not in CSV.`)
        break
      }

      case 'check-matches': {
        console.log('🚀 Running Task 3: Check Matching Data...\n')
        const matches = await importer.findMatchingRecords()
        console.log(`📊 Result: ${matches.length} accounts found with matching data.`)
        break
      }

      case 'import-csv': {
        console.log('🚀 Running Task 4: Transfer Matching Data...\n')
        const count = await importer.transferMatchingData()
        console.log(`📊 Result: ${count} accounts updated with CSV data.`)
        break
      }

      default:
        console.error(`❌ Unknown command: ${command}`)
        console.log('')
        showUsage()
        process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error during CSV import process:', error)
    process.exit(1)
  } finally {
    await importer.close()
  }
}

export { CSVImporter }
export { HOTS_ACCOUNTS_COLUMNS }

main()
