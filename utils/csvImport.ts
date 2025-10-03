import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { CSVRecord } from '../types/csvSpreadsheet';

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
  private parseValue(value: string): number | string | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null;
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
  private parsePercentage(value: string): number | null {
    if (value === '' || value === 'None' || value === undefined) {
      return null;
    }

    const cleanValue = value.replace('%', '');
    const numericValue = parseFloat(cleanValue);

    return !isNaN(numericValue) ? numericValue : null;
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
    missingFromDb.forEach(record => console.log(`  - ${record.Lookup}\t\t${record.Player}`));
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
      UPDATE hots_accounts SET
        HP_url = ?,
        HP_QM_MMR = ?,
        HP_SL_MMR = ?,
        HP_QM_Games = ?,
        HP_SL_Games = ?,
        HP_MMR = ?,
        \`SotS_Win_%\` = ?,
        SotS_Games = ?,
        SotS_Takedowns = ?,
        SotS_Kills = ?,
        SotS_Assists = ?,
        SotS_Deaths = ?,
        SotS_Kill_Participation = ?,
        SotS_KDA_Ratio = ?,
        SotS_Highest_Kill_Streak = ?,
        SotS_Vengeances = ?,
        SotS_Time_Dead = ?,
        \`SotS_Time_Dead_%\` = ?,
        SotS_Deaths_While_Outnumbered = ?,
        SotS_Escapes = ?,
        SotS_Team_Fight_Escapes = ?,
        SotS_Hero_Damage = ?,
        SotS_DPM = ?,
        SotS_Physical_Damage = ?,
        SotS_Ability_Damage = ?,
        SotS_Damage_per_Death = ?,
        SotS_Team_Fight_Hero_Damage = ?,
        SotS_Siege_Damage = ?,
        SotS_Structure_Damage = ?,
        SotS_Minion_Damage = ?,
        SotS_Summon_Damage = ?,
        SotS_Creep_Damage = ?,
        SotS_Healing = ?,
        SotS_HPM = ?,
        SotS_Healing_per_Death = ?,
        SotS_Team_Fight_Healing = ?,
        SotS_Self_Healing = ?,
        SotS_Allied_Shields = ?,
        SotS_Clutch_Heals = ?,
        SotS_Damage_Taken = ?,
        SotS_Damage_Soaked = ?,
        SotS_Damage_Taken_per_Death = ?,
        SotS_Team_Fight_Damage_Taken = ?,
        SotS_CC_Time = ?,
        SotS_Root_Time = ?,
        SotS_Silence_Time = ?,
        SotS_Stun_Time = ?,
        SotS_Time_on_Fire = ?,
        SotS_XP_Contribution = ?,
        SotS_XPM = ?,
        SotS_Merc_Camp_Captures = ?,
        SotS_Watch_Tower_Captures = ?,
        SotS_Aces = ?,
        SotS_Wipes = ?,
        \`SotS_%_of_Game_with_Level_Adv\` = ?,
        \`SotS_%_of_Game_with_Hero_Adv\` = ?,
        \`SotS_Passive_XP/Second\` = ?,
        SotS_Passive_XP_Gained = ?,
        SotS_Altar_Damage_Done = ?,
        SotS_Damage_to_Immortal = ?,
        SotS_Dragon_Knights_Captured = ?,
        SotS_Shrines_Captured = ?,
        SotS_Dubloons_Held_At_End = ?,
        SotS_Dubloons_Turned_In = ?,
        SotS_Skulls_Collected = ?,
        SotS_Shrine_Minion_Damage = ?,
        SotS_Plant_Damage = ?,
        SotS_Seeds_Collected = ?,
        SotS_Garden_Seeds_Collected = ?,
        SotS_Gems_Turned_In = ?,
        SotS_Nuke_Damage = ?,
        SotS_Curse_Damage = ?,
        SotS_Time_On_Temple = ?,
        SotS_Damage_Done_to_Zerg = ?,
        SotS_Cage_Unlocks_Interrupted = ?,
        SotS_Hero_Pool = ?,
        SotS_Damage_Ratio = ?,
        \`SotS_%_of_Team_Damage\` = ?,
        \`SotS_%_of_Team_Damage_Taken\` = ?,
        \`SotS_%_of_Team_Damage_Healed\` = ?,
        \`SotS_%_of_Time_Slow_CC\` = ?,
        \`SotS_%_of_Time_Non-Slow_CC\` = ?,
        SotS_Votes = ?,
        SotS_Awards = ?,
        \`SotS_Award_%\` = ?,
        SotS_MVP = ?,
        \`SotS_MVP_%\` = ?,
        SotS_Bsteps = ?,
        SotS_Bstep_TD = ?,
        SotS_Bstep_Deaths = ?,
        SotS_Taunts = ?,
        SotS_Taunt_TD = ?,
        SotS_Taunt_Deaths = ?,
        SotS_Sprays = ?,
        SotS_Spray_TD = ?,
        SotS_Spray_Deaths = ?,
        SotS_Dances = ?,
        SotS_Dance_TD = ?,
        SotS_Dance_Deaths = ?
      WHERE hots_battle_tag = ?
    `);

    let updatedCount = 0;

    // Process each matching record
    for (const record of matchingRecords) {
      try {
        const result = updateStmt.run(
          record['HP url'],
          this.parseValue(record['QM MMR']),
          this.parseValue(record['SL MMR']),
          this.parseValue(record['QM Games']),
          this.parseValue(record['SL Games']),
          this.parseValue(record.MMR),
          this.parsePercentage(record['Win %']),
          this.parseValue(record.Games),
          this.parseValue(record.Takedowns),
          this.parseValue(record.Kills),
          this.parseValue(record.Assists),
          this.parseValue(record.Deaths),
          this.parsePercentage(record['Kill Participation']),
          this.parseValue(record.KDA),
          this.parseValue(record['Highest Kill Streak']),
          this.parseValue(record.Vengeances),
          record['Time Dead'],
          this.parsePercentage(record['Time Dead %']),
          this.parseValue(record['Deaths While Outnumbered']),
          this.parseValue(record.Escapes),
          this.parseValue(record['Team Fight Escapes']),
          this.parseValue(record['Hero Damage']),
          this.parseValue(record.DPM),
          this.parseValue(record['Physical Damage']),
          this.parseValue(record['Ability Damage']),
          this.parseValue(record['Damage per Death']),
          this.parseValue(record['Team Fight Hero Damage']),
          this.parseValue(record['Siege Damage']),
          this.parseValue(record['Structure Damage']),
          this.parseValue(record['Minion Damage']),
          this.parseValue(record['Summon Damage']),
          this.parseValue(record['Creep Damage']),
          this.parseValue(record.Healing),
          this.parseValue(record.HPM),
          this.parseValue(record['Healing per Death']),
          this.parseValue(record['Team Fight Healing']),
          this.parseValue(record['Self Healing']),
          this.parseValue(record['Allied Shields']),
          this.parseValue(record['Clutch Heals']),
          this.parseValue(record['Damage Taken']),
          this.parseValue(record['Damage Soaked']),
          this.parseValue(record['Damage Taken per Death']),
          this.parseValue(record['Team Fight Damage Taken']),
          record['CC Time'],
          record['Root Time'],
          record['Silence Time'],
          record['Stun Time'],
          record['Time on Fire'],
          this.parseValue(record['XP Contribution']),
          this.parseValue(record.XPM),
          this.parseValue(record['Merc Camp Captures']),
          this.parseValue(record['Watch Tower Captures']),
          this.parseValue(record.Aces),
          this.parseValue(record.Wipes),
          this.parsePercentage(record['% of Game with Level Adv.']),
          this.parsePercentage(record['% of Game with Hero Adv.']),
          this.parseValue(record['Passive XP/Second']),
          this.parseValue(record['Passive XP Gained']),
          this.parseValue(record['Altar Damage Done']),
          this.parseValue(record['Damage to Immortal']),
          this.parseValue(record['Dragon Knights Captured']),
          this.parseValue(record['Shrines Captured']),
          this.parseValue(record['Dubloons Held At End']),
          this.parseValue(record['Dubloons Turned In']),
          this.parseValue(record['Skulls Collected']),
          this.parseValue(record['Shrine Minion Damage']),
          this.parseValue(record['Plant Damage']),
          this.parseValue(record['Seeds Collected']),
          this.parseValue(record['Garden Seeds Collected']),
          this.parseValue(record['Gems Turned In']),
          this.parseValue(record['Nuke Damage']),
          this.parseValue(record['Curse Damage']),
          record['Time On Temple'],
          this.parseValue(record['Damage Done to Zerg']),
          this.parseValue(record['Cage Unlocks Interrupted']),
          this.parseValue(record['Hero Pool']),
          this.parseValue(record['Damage Ratio']),
          this.parsePercentage(record['% of Team Damage']),
          this.parsePercentage(record['% of Team Damage Taken']),
          this.parsePercentage(record['% of Team Damage Healed']),
          this.parsePercentage(record['% of Time Slow CC']),
          this.parsePercentage(record['% of Time Non-Slow CC']),
          this.parseValue(record.Votes),
          this.parseValue(record.Awards),
          this.parsePercentage(record['Award %']),
          this.parseValue(record.MVP),
          this.parsePercentage(record['MVP %']),
          this.parseValue(record.Bsteps),
          this.parseValue(record['Bstep TD']),
          this.parseValue(record['Bstep Deaths']),
          this.parseValue(record.Taunts),
          this.parseValue(record['Taunt TD']),
          this.parseValue(record['Taunt Deaths']),
          this.parseValue(record.Sprays),
          this.parseValue(record['Spray TD']),
          this.parseValue(record['Spray Deaths']),
          this.parseValue(record.Dances),
          this.parseValue(record['Dance TD']),
          this.parseValue(record['Dance Deaths']),
          record.Lookup // WHERE clause - hots_battle_tag
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
