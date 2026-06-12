import { HPData, HPPlayerData, HPPlayerStatsData } from '../types/heroesProfile'; // Assuming you have a types.ts file for type definitions
import Database from 'better-sqlite3';
import { puppeteerRefreshXsrfTokenAndCookies } from './heroesProfilePuppeteer';
import { Browser, Page } from 'puppeteer';

const db = new Database('./store/nor_customs.db');
export const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

let CACHED_XSRF_TOKEN: string | null = null;
let PAGE_INSTANCE: Page | null = null;
let BROWSER_INSTANCE: Browser | null = null;
let isInitialized = false;

// Initialize tokens on module load
async function initialize() {
  if (!isInitialized) {
    await refreshXsrfTokenAndCookies();
    isInitialized = true;
  }
}

initialize().catch(err => {
  console.error('Failed to initialize HP tokens:', err);
  console.error('Bot may not be able to fetch Heroes Profile data!');
});

export async function getHeroesProfileData(battleTag: string): Promise<HPData | undefined> {
  try {
    const startTime = Date.now();
    // first check if we have their region and blizz_id stored already
    const hpRegionStmt = db.prepare<string, { HP_Blizz_ID: string; HP_Region: number }>(
      'SELECT HP_Blizz_ID, HP_Region FROM hots_accounts WHERE hots_battle_tag = ?',
    );
    const row = hpRegionStmt.get(battleTag);
    console.log(`Getting HP Data for ${battleTag}`);

    if (!CACHED_XSRF_TOKEN || !PAGE_INSTANCE) {
      BROWSER_INSTANCE?.close();
      throw new Error('XSRF token or page instance is missing.');
    }

    let blizz_id = row?.HP_Blizz_ID;
    let region = row?.HP_Region;
    if (!blizz_id || !region) {
      // we don't know their blizz_id or region, so we need to look it up
      const bestMatch = await getBestHpAccount(battleTag, CACHED_XSRF_TOKEN);
      if (!bestMatch) {
        BROWSER_INSTANCE?.close();
        return undefined;
      }
      blizz_id = bestMatch.blizz_id;
      region = bestMatch.region;
      // store blizz_id, region for the first item in the array
      const hpUpdateStmt = db.prepare(
        'UPDATE hots_accounts SET HP_Blizz_ID = ?, HP_Region = ? WHERE hots_battle_tag = ?',
      );
      hpUpdateStmt.run(blizz_id, region, battleTag);
    }

    const hpDataReturned: HPPlayerStatsData = await PAGE_INSTANCE.evaluate(
      async (token: string, battleTag: string, region: number, blizz_id: string) => {
        const response = await fetch('https://www.heroesprofile.com/api/v1/player', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-XSRF-TOKEN': token,
          },
          body: JSON.stringify({ battletag: battleTag, region, blizz_id }),
        });

        if (!response.ok) {
          BROWSER_INSTANCE?.close();
          throw new Error(`${response.status}`);
        }

        return response.json();
      },
      CACHED_XSRF_TOKEN,
      battleTag,
      region,
      blizz_id,
    );

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
    console.log(
      `qm: ${hpData.qmMmr}/${hpData.qmGames}, sl: ${hpData.slMmr}/${hpData.slGames}, ar: ${hpData.arMmr}/${hpData.arGames}`,
    );
    console.log(`Elapsed time: ${elapsedTime.toFixed(2)} seconds`);
    BROWSER_INSTANCE?.close();
    return hpData;
  } catch (error) {
    console.error('An error occurred:', error);
    BROWSER_INSTANCE?.close();
  }
}

/**
 * Fetches the best matching Heroes Profile account based on total games played.
 * @param battleTag The BattleTag of the player to search for
 * @returns The best matching HPPlayerData or undefined if not found
 */
async function getBestHpAccount(battleTag: string, decodedToken: string): Promise<HPPlayerData | undefined> {
  if (!PAGE_INSTANCE) {
    console.error('Page instance not available');
    return undefined;
  }

  try {
    const data = await PAGE_INSTANCE.evaluate(
      async (token: string, tag: string) => {
        const response = await fetch('https://www.heroesprofile.com/api/v1/battletag/search', {
          method: 'POST',
          headers: {
            'X-XSRF-TOKEN': token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userinput: tag }),
        });

        if (!response.ok) {
          BROWSER_INSTANCE?.close();
          throw new Error(`WHOA! ${response.status}`);
        }
        console.log('response.json:', await response.clone().json());
        return response.json();
      },
      decodedToken,
      battleTag,
    );

    if (!Array.isArray(data) || data.length === 0) {
      console.log(`No data found for BattleTag: ${battleTag}`);
      BROWSER_INSTANCE?.close();
      return undefined;
    }

    data.sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed);
    return data[0];
  } catch (error) {
    BROWSER_INSTANCE?.close();
    console.error(`Error fetching getBestHpAccount data:`, error);
    return undefined;
  }
}

async function refreshXsrfTokenAndCookies(): Promise<void> {
  const {
    xsrfToken,
    cookies: rawCookies,
    page,
    browser,
  } = await puppeteerRefreshXsrfTokenAndCookies('https://www.heroesprofile.com/');
  if (rawCookies?.length === 0) {
    throw new Error('No cookies received from server!');
  }
  // We need to find the specific "XSRF-TOKEN" cookie string
  if (!xsrfToken) {
    throw new Error('XSRF-TOKEN cookie not found!');
  }

  const decodedToken = decodeURIComponent(xsrfToken);

  CACHED_XSRF_TOKEN = decodedToken;
  PAGE_INSTANCE = page;
  BROWSER_INSTANCE = browser;
  const tokenFetchedAt = new Date();
  console.log(`XSRF token and cookies refreshed successfully at ${tokenFetchedAt.toISOString()}`);
}
