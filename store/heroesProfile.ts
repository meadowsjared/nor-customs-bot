import { HPData, HPPlayerData, HPPlayerStatsData } from '../types/heroesProfile'; // Assuming you have a types.ts file for type definitions
import Database from 'better-sqlite3';

const db = new Database('./store/nor_customs.db');

let CACHED_XSRF_TOKEN: string | null = null;
let CACHED_COOKIE_HEADER: string | null = null;
let TOKEN_FETCHED_AT: Date | null = null;
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
      'SELECT HP_Blizz_ID, HP_Region FROM hots_accounts WHERE hots_battle_tag = ?'
    );
    const row = hpRegionStmt.get(battleTag);
    console.log(`Getting HP Data for ${battleTag}`);

    // await initialize();
    if (!CACHED_XSRF_TOKEN || !CACHED_COOKIE_HEADER) {
      throw new Error('XSRF token or cookie header is missing. Please refresh them before making the request.');
    }

    let blizz_id = row?.HP_Blizz_ID;
    let region = row?.HP_Region;
    if (!blizz_id || !region) {
      // we don't know their blizz_id or region, so we need to look it up
      const bestMatch = await getBestHpAccount(battleTag, CACHED_XSRF_TOKEN, CACHED_COOKIE_HEADER);
      if (!bestMatch) return undefined;
      blizz_id = bestMatch.blizz_id;
      region = bestMatch.region;
      // store blizz_id, region for the first item in the array
      const hpUpdateStmt = db.prepare(
        'UPDATE hots_accounts SET HP_Blizz_ID = ?, HP_Region = ? WHERE hots_battle_tag = ?'
      );
      hpUpdateStmt.run(blizz_id, region, battleTag);
    }

    const response = await fetchWithRetry('https://www.heroesprofile.com/api/v1/player', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'X-XSRF-TOKEN': CACHED_XSRF_TOKEN,
        Cookie: CACHED_COOKIE_HEADER,
      },
      body: JSON.stringify({ battletag: battleTag, region, blizz_id }),
    });
    if (!response.ok) {
      console.error(`Error fetching data: ${response.status}`);
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
    console.log(
      `qm: ${hpData.qmMmr}/${hpData.qmGames}, sl: ${hpData.slMmr}/${hpData.slGames}, ar: ${hpData.arMmr}/${hpData.arGames}`
    );
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
async function getBestHpAccount(
  battleTag: string,
  decodedToken: string,
  cookieHeaderValue: string
): Promise<HPPlayerData | undefined> {
  // execute a post request
  const response = await fetchWithRetry('https://www.heroesprofile.com/api/v1/battletag/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
      'X-XSRF-TOKEN': decodedToken,
      Cookie: cookieHeaderValue,
    },
    body: JSON.stringify({ userinput: battleTag }),
  });

  if (!response.ok) {
    console.error(`Error fetching data: ${response.status}`);
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

async function refreshXsrfTokenAndCookies(): Promise<void> {
  // get the XSRF token
  const getResponse = await fetch('https://www.heroesprofile.com/', {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    },
  });
  // Extract the XSRF token from the response cookies
  const rawCookies = getResponse.headers.getSetCookie();
  if (rawCookies?.length === 0) {
    throw new Error('No cookies received from server!');
  }
  // We need to find the specific "XSRF-TOKEN" cookie string
  const xsrfCookieString = rawCookies.find(c => c.startsWith('XSRF-TOKEN='));
  if (!xsrfCookieString) {
    throw new Error('XSRF-TOKEN cookie not found!');
  }
  const encodedToken = xsrfCookieString.split(';')[0].replace('XSRF-TOKEN=', '');

  const decodedToken = decodeURIComponent(encodedToken);

  const cookieHeaderValue = rawCookies.map(c => c.split(';')[0]).join('; ');
  CACHED_XSRF_TOKEN = decodedToken;
  CACHED_COOKIE_HEADER = cookieHeaderValue;
  TOKEN_FETCHED_AT = new Date();
  console.log(`XSRF token and cookies refreshed successfully at ${TOKEN_FETCHED_AT.toISOString()}`);
}

/**
 * Wrapper for fetch that automatically retries with a refreshed token on 401/419 errors
 */
async function fetchWithRetry(url: string, options: RequestInit, retryCount = 0): Promise<Response> {
  const maxRetries = 1;

  const response = await fetch(url, options);

  // If we get a 401 (Unauthorized) or 419 (CSRF token mismatch), refresh and retry
  if ((response.status === 401 || response.status === 419) && retryCount < maxRetries) {
    console.log(`Received ${response.status}, refreshing XSRF token and retrying...`);
    await refreshXsrfTokenAndCookies();

    if (!CACHED_XSRF_TOKEN || !CACHED_COOKIE_HEADER) {
      throw new Error('Failed to refresh XSRF token or cookies');
    }
    // Update the headers with the new token
    if (options.headers && CACHED_XSRF_TOKEN && CACHED_COOKIE_HEADER) {
      const headers = new Headers(options.headers);
      headers.set('X-XSRF-TOKEN', CACHED_XSRF_TOKEN);
      headers.set('Cookie', CACHED_COOKIE_HEADER);
      options.headers = headers;
    }

    return fetchWithRetry(url, options, retryCount + 1);
  }

  return response;
}
