import { HPData, HPPlayerData, HPPlayerStatsData } from '../types/heroesProfile'; // Assuming you have a types.ts file for type definitions
import Database from 'better-sqlite3';
import { puppeteerRefreshXsrfTokenAndCookies } from './heroesProfilePuppeteer';
import { Browser, Page } from 'puppeteer';

const db = new Database('./store/nor_customs.db');
export const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

let isInitialized = false;

// Initialize tokens on module load
async function initialize() {
  if (!isInitialized) {
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

    let blizz_id = row?.HP_Blizz_ID;
    let region = row?.HP_Region;
    const { xsrfToken, page, browser } = await initializeHPPage();
    if (!xsrfToken || !page) {
      browser.close();
      throw new Error('XSRF token or page instance is missing.');
    }
    if (!blizz_id || !region) {
      // we don't know their blizz_id or region, so we need to look it up
      const bestMatch = await getBestHpAccount(battleTag, xsrfToken, page, browser);
      if (!bestMatch) {
        browser.close();
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

    const hpDataReturned: HPPlayerStatsData = await page.evaluate(
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
          browser.close();
          throw new Error(`${response.status}`);
        }

        return response.json();
      },
      xsrfToken,
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
    browser.close();
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
async function getBestHpAccount(
  battleTag: string,
  decodedToken: string,
  page: Page,
  browser: Browser,
): Promise<HPPlayerData | undefined> {
  if (!page) {
    console.error('Page instance not available');
    return undefined;
  }

  try {
    const data = await page.evaluate(
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
          browser.close();
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
      browser.close();
      return undefined;
    }

    data.sort((a, b) => b.totalGamesPlayed - a.totalGamesPlayed);
    return data[0];
  } catch (error) {
    browser.close();
    console.error(`Error fetching getBestHpAccount data:`, error);
    return undefined;
  }
}

async function initializeHPPage(): Promise<{
  xsrfToken: string;
  page: Page;
  browser: Browser;
}> {
  const { xsrfToken, page, browser } = await puppeteerRefreshXsrfTokenAndCookies('https://www.heroesprofile.com/');
  if (!page) {
    throw new Error('No page instance received from server!');
  }
  // We need to find the specific "XSRF-TOKEN" cookie string
  if (!xsrfToken) {
    throw new Error('XSRF-TOKEN cookie not found!');
  }

  const decodedToken = decodeURIComponent(xsrfToken);

  const tokenFetchedAt = new Date();
  console.log(`XSRF token and cookies refreshed successfully at ${tokenFetchedAt.toISOString()}`);
  return { xsrfToken: decodedToken, page, browser };
}
