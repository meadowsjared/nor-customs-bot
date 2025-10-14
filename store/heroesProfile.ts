import { HPData, HPPlayerData, HPPlayerStatsData } from '../types/heroesProfile'; // Assuming you have a types.ts file for type definitions
import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

export async function getHeroesProfileData(battleTag: string): Promise<HPData | undefined> {
  try {
    const startTime = Date.now();
    // first check if we have their region and blizz_id stored already
    const hpRegionStmt = db.prepare<string, { HP_Blizz_ID: string; HP_Region: number }>(
      'SELECT HP_Blizz_ID, HP_Region FROM hots_accounts WHERE hots_battle_tag = ?'
    );
    const row = hpRegionStmt.get(battleTag);
    console.log(`Getting HP Data for ${battleTag}`);
    let blizz_id = row?.HP_Blizz_ID;
    let region = row?.HP_Region;
    if (!blizz_id || !region) {
      // we don't know their blizz_id or region, so we need to look it up
      const bestMatch = await getBestHpAccount(battleTag);
      if (!bestMatch) return undefined;
      blizz_id = bestMatch.blizz_id;
      region = bestMatch.region;
      // store blizz_id, region for the first item in the array
      const hpUpdateStmt = db.prepare(
        'UPDATE hots_accounts SET HP_Blizz_ID = ?, HP_Region = ? WHERE hots_battle_tag = ?'
      );
      hpUpdateStmt.run(blizz_id, region, battleTag);
    }

    const response = await fetch('https://www.heroesprofile.com/api/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ battletag: battleTag, region, blizz_id }),
    });
    if (!response.ok) {
      console.error(`Error fetching data: ${response.statusText}`);
      return undefined;
    }

    const hpDataReturned: HPPlayerStatsData = await response.json();
    const hpData: HPData = {
      region,
      blizz_id,
      qmMmr: hpDataReturned.qm_mmr_data?.mmr ?? NaN,
      slMmr: hpDataReturned.sl_mmr_data?.mmr ?? NaN,
      arMmr: hpDataReturned.ar_mmr_data?.mmr ?? NaN,
      qmGames: (hpDataReturned.qm_mmr_data?.win ?? 0) + (hpDataReturned.qm_mmr_data?.loss ?? 0),
      slGames: (hpDataReturned.sl_mmr_data?.win ?? 0) + (hpDataReturned.sl_mmr_data?.loss ?? 0),
      arGames: (hpDataReturned.ar_mmr_data?.win ?? 0) + (hpDataReturned.ar_mmr_data?.loss ?? 0),
    };

    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) / 1000;
    console.log(`Elapsed time: ${elapsedTime.toFixed(2)} seconds`);
    return hpData;
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

/**
 * Fetches the best matching Heroes Profile account based on total games played.
 * @param battleTag The BattleTag of the player to search for
 * @returns The best matching HPPlayerData or undefined if not found
 */
async function getBestHpAccount(battleTag: string): Promise<HPPlayerData | undefined> {
  // execute a post request
  const response = await fetch('https://www.heroesprofile.com/api/v1/battletag/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userinput: battleTag }),
  });

  if (!response.ok) {
    console.error(`Error fetching data: ${response.statusText}`);
    return undefined;
  }

  const data: HPPlayerData[] = await response.json();
  data.sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed); // Sort by totalGamesPlayed descending
  if (data.length === 0) {
    console.log(`No data found for BattleTag: ${battleTag}`);
    return undefined;
  }
  return data[0];
}
