import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { ColumnDefinition, CSVRecord, HOTS_ACCOUNTS_COLUMNS, SQLiteColumnType } from '../types/csvSpreadsheet';

interface HotsAccount {
  hots_battle_tag: string;
  discord_id: string;
  is_primary: boolean;
}

class CSVImporter {
  private readonly db: Database.Database;

  constructor() {
    this.db = new Database('./store/nor_customs.db');
  }

  // Helper function to convert string values to appropriate types
  private parseValue(value: string | number): number | string | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    // Remove commas and parse as number if it's numeric
    const cleanValue = value.replace(/,/g, '');
    const numericValue = parseFloat(cleanValue);

    if (!isNaN(numericValue)) {
      return numericValue;
    }

    return value;
  }

  // Helper function to parse percentage values
  private parsePercentage(value: string | number): number | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null;
    }

    if (typeof value === 'number') {
      return value;
    }

    const cleanValue = value.replace('%', '');
    const numericValue = parseFloat(cleanValue);

    return !isNaN(numericValue) ? numericValue / 100 : null;
  }

  // Helper function to parse time values (MM:SS format)
  private parseTime(value: string): number | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null;
    }

    // Handle formats like "1:30", "00:45", etc.
    const parts = value.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]);
      const seconds = parseInt(parts[1]);
      return minutes * 60 + seconds; // Convert to total seconds
    }

    return null;
  }

  // Read and parse the CSV file
  private readCSV(): CSVRecord[] {
    try {
      const csvContent = readFileSync('./store/Heroes of the Storm WEEKLY FRIDAYS 9_30PM - Stats.csv', 'utf8');
      const records = parse<CSVRecord>(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });

      return records;
    } catch (error) {
      console.error('Error reading CSV file:', error);
      throw error;
    }
  }

  // Get all hots_accounts from database
  private getHotsAccounts(): HotsAccount[] {
    const stmt = this.db.prepare('SELECT hots_battle_tag, discord_id, is_primary FROM hots_accounts');
    return stmt.all() as HotsAccount[];
  }

  // Task 1: Find accounts in CSV but missing from database
  public findMissingFromDatabase(): CSVRecord[] {
    console.log('🔍 Task 1: Finding accounts in CSV but missing from database...\n');

    const csvRecords = this.readCSV();
    const dbAccounts = this.getHotsAccounts();

    const dbBattleTags = new Set(dbAccounts.map(account => account.hots_battle_tag));

    const missingFromDb = Array.from(csvRecords).filter(record => !dbBattleTags.has(record.Lookup));

    console.log(`Found ${missingFromDb.length} accounts in CSV but missing from database:`);
    missingFromDb.forEach((record, index) => console.log(` ${index + 1}: ${record.Lookup}\t\t${record.Sorting}`));
    console.log('');

    return missingFromDb;
  }

  // Task 2: Find accounts in database but not in CSV
  public findMissingFromCSV(): string[] {
    console.log('🔍 Task 2: Finding accounts in database but not in CSV...\n');

    const csvRecords = this.readCSV();
    const dbAccounts = this.getHotsAccounts();

    const csvLookups = new Set(csvRecords.map(record => record.Lookup));
    const dbBattleTags = dbAccounts.map(account => account.hots_battle_tag);

    const missingFromCsv = dbBattleTags.filter(battleTag => !csvLookups.has(battleTag));

    console.log(`Found ${missingFromCsv.length} accounts in database but not in CSV:`);
    missingFromCsv.forEach(battleTag => console.log(`  - ${battleTag}`));
    console.log('');

    return missingFromCsv;
  }

  public findMatchingRecords(): string[] {
    console.log('🔍 Task 3: Finding accounts with matching data...\n');

    const csvRecords = this.readCSV();
    const dbAccounts = this.getHotsAccounts();

    const matchingRecords = dbAccounts
      .filter(record => csvRecords.some(account => account.Lookup === record.hots_battle_tag))
      .map(record => record.hots_battle_tag);

    console.log(`Found ${matchingRecords.length} accounts with matching data:`);
    matchingRecords.forEach(battleTag => console.log(`  - ${battleTag}`));
    console.log('');

    return matchingRecords;
  }

  private parseBoolean(value: string | number) {
    return value === 'TRUE' ? 1 : 0;
  }

  public parseValueForColumn(record: CSVRecord, column: ColumnDefinition) {
    const csvColumnName = column.csvColumnName;
    if (column.name !== 'updated_at' && !csvColumnName) {
      console.warn(`No CSV mapping found for DB column: ${column.name}`);
      return null;
    }

    const rawValue = csvColumnName ? record[csvColumnName] : 'CURRENT_TIMESTAMP';

    // Handle empty/null values
    if (!rawValue || rawValue === '' || rawValue === 'None' || rawValue === undefined) {
      return null;
    }

    // Parse based on SQLite column type and special cases
    switch (column.type) {
      case SQLiteColumnType.INTEGER:
        // Check if this is actually a boolean stored as integer
        if (column.isBoolean) {
          return this.parseBoolean(rawValue);
        }
        return this.parseValue(rawValue);

      case SQLiteColumnType.REAL:
        // Check if this is a percentage column
        if (column.isPercentage) {
          return this.parsePercentage(rawValue);
        }
        return this.parseValue(rawValue);

      case SQLiteColumnType.TEXT:
        // Keep as string, but handle time formats if needed
        return rawValue;

      case SQLiteColumnType.DATETIME:
        // Handle datetime parsing if needed
        return 'CURRENT_TIMESTAMP';

      default:
        return rawValue;
    }
  }

  // Task 4: Transfer data from CSV to database for matching accounts
  public transferMatchingData(): number {
    console.log('🔄 Task 4: Transferring data for matching accounts...\n');

    const csvRecords = this.readCSV();
    const dbAccounts = this.getHotsAccounts();

    const dbBattleTags = new Set(dbAccounts.map(account => account.hots_battle_tag));

    // Find matching accounts
    const matchingRecords = csvRecords.filter(record => dbBattleTags.has(record.Lookup));

    console.log(`Found ${matchingRecords.length} matching accounts to transfer data for.`);

    if (matchingRecords.length === 0) {
      console.log('No matching accounts found. Nothing to transfer.');
      return 0;
    }

    // Prepare update statement
    const updateStmt = this.db.prepare(`
      UPDATE hots_accounts SET ${HOTS_ACCOUNTS_COLUMNS.filter(col => col.skipImport !== true)
        .map(col => `${col.name} = ?`)
        .join(', ')} WHERE hots_battle_tag = ?
    `);

    let updatedCount = 0;

    // Process each matching record
    for (const record of matchingRecords) {
      try {
        const result = updateStmt.run(
          ...HOTS_ACCOUNTS_COLUMNS.filter(col => col.skipImport !== true).map(col =>
            this.parseValueForColumn(record, col)
          ),
          record.Lookup
        );

        if (result.changes > 0) {
          updatedCount++;
          console.log(`  ✅ Updated: ${record.Lookup}`);
        } else {
          console.log(`  ⚠️  No changes: ${record.Lookup}`);
        }
      } catch (error) {
        console.error(`  ❌ Error updating ${record.Lookup}:`, error);
      }
    }

    console.log(`\n✅ Successfully updated ${updatedCount} out of ${matchingRecords.length} accounts.`);
    return updatedCount;
  }

  public close() {
    this.db.close();
  }
}

// Show usage information
function showUsage() {
  console.log('📋 CSV Import Tool Usage:');
  console.log('');
  console.log('Available commands:');
  console.log('  bun check:db                              - Find accounts in CSV but missing from database');
  console.log('  bun check:csv                             - Find accounts in database but not in CSV');
  console.log('  bun check:match                           - Find accounts with matching data');
  console.log('  bun utils/csvImport.ts transfer           - Transfer data for matching accounts');
  console.log('  bun utils/csvImport.ts all                - Run all three tasks');
  console.log('  bun csv:help                              - Show this help message');
  console.log('');
}

// Main execution function with command-line argument handling
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showUsage();
    return;
  }

  const importer = new CSVImporter();

  try {
    switch (command) {
      case 'missing-from-db':
        console.log('🚀 Running Task 1: Find Missing from Database...\n');
        console.log(
          `📊 Result: ${importer.findMissingFromDatabase().length} accounts found in CSV but missing from database.`
        );
        break;

      case 'missing-from-csv':
        console.log('🚀 Running Task 2: Find Missing from CSV...\n');
        console.log(`📊 Result: ${importer.findMissingFromCSV().length} accounts found in database but not in CSV.`);
        break;

      case 'check-matches':
        console.log('🚀 Running Task 3: Check Matching Data...\n');
        console.log(`📊 Result: ${importer.findMatchingRecords().length} accounts found with matching data.`);
        break;

      case 'import-csv':
        console.log('🚀 Running Task 4: Transfer Matching Data...\n');
        console.log(`📊 Result: ${importer.transferMatchingData()} accounts updated with CSV data.`);
        break;

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('');
        showUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error during CSV import process:', error);
    process.exit(1);
  } finally {
    importer.close();
  }
}

// Export for use in other files
export { CSVImporter };

// Run if this file is executed directly
main();
