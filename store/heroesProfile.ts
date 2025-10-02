import puppeteer, { Browser, Page } from 'puppeteer';
import { HPData, HPSelectors } from '../types/heroesProfile'; // Assuming you have a types.ts file for type definitions
import { appendFileSync, existsSync, mkdirSync } from 'fs';

// Save original console methods
const origLog = console.log;
const origError = console.error;

// Override console.log
console.log = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  origLog(...args);
  appendFileSync('latest.log', msg + '\n');
};

// Override console.error
console.error = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  origError(...args);
  appendFileSync('latest.log', '[ERROR] ' + msg + '\n');
};

async function scrapePlayerStats(browser: Browser, url: string, battleTag: string): Promise<HPData> {
  const page = await browser.newPage();
  let currentUrl = url;
  const playerName = battleTag;

  // log out the url and the index
  console.log(`${playerName}: Navigating to: ${url}`);

  const qmMmrSelector =
    '#app > div:nth-child(8) > div:nth-child(4) > div:nth-child(5) > div.mx-auto > div:nth-child(1) > div:nth-child(4) > div > div';
  const slMmrSelector =
    '#app > div:nth-child(8) > div:nth-child(4) > div:nth-child(5) > div.mx-auto > div:nth-child(5) > div:nth-child(4) > div > div';
  const gameTypeDropdown = '#app > div:nth-child(8) > div:nth-child(2) > div:nth-child(1) > div > span:nth-child(2)';
  const qmGameTypeSelector = '#qm';
  const slGameTypeSelector = '#sl';
  const filterButton = '#app > div:nth-child(8) > div.flex.justify-center.mx-auto > button';
  const winsSelector =
    '#app > div:nth-child(8) > div:nth-child(4) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between.max-md\\:flex-col.max-md\\:items-center > div.flex-1.flex.flex-wrap.justify-between.max-w-\\[400px\\].w-full.items-between.mt-\\[1em\\].max-md\\:order-1 > div:nth-child(1) > div > div';
  const lossesSelector =
    '#app > div:nth-child(8) > div:nth-child(4) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between.max-md\\:flex-col.max-md\\:items-center > div.flex-1.flex.flex-wrap.justify-between.max-w-\\[400px\\].w-full.items-between.mt-\\[1em\\].max-md\\:order-1 > div:nth-child(2) > div > div';
  const noDataSelector =
    '#app > div:nth-child(8) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between > div > span';
  const selectors: HPSelectors = {
    qmMmrSelector,
    slMmrSelector,
    gameTypeDropdown,
    qmGameTypeSelector,
    slGameTypeSelector,
    filterButton,
    winsSelector,
    lossesSelector,
    noDataSelector,
  };

  let qmMmr = 'None';
  let slMmr = 'None';
  let slGames = 'None';
  let qmGames = 'None';
  let qmWins = 0;
  let qmLosses = 0;
  let slWins = 0;
  let slLosses = 0;
  // run this up to 5 times max
  let attempts = 0;
  const maxAttempts = 5;
  await page.setViewport({ width: 1920, height: 2980 });
  while (attempts < maxAttempts) {
    try {
      attempts++;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }); // Wait until network is idle
      // wait for the page to load
      await page.waitForSelector('h2', { timeout: 10000 });
      // get the current URL after any redirects
      currentUrl = page.url();
      console.log(`${playerName}: Current URL after navigation: ${currentUrl}`);

      // check if the h2 contains "Results"
      const resultsHeader = await page.$eval('h2', el => el.textContent).catch(() => null);

      if (resultsHeader === 'Results') {
        // get the array of <a> elements following the h2
        const profileLinks = await page.$$eval('h2 ~ a', links =>
          links.map(link => ({
            href: link.href,
            // Get all child elements with their details
            gamesPlayed: parseInt(
              (
                Array.from(link.querySelectorAll('div'))
                  ?.find(div => div.textContent?.startsWith('Games Played: '))
                  ?.textContent?.trim() ?? '0'
              ).replace(/[^\d]/g, '0')
            ),
          }))
        );
        profileLinks.sort((a, b) => b.gamesPlayed - a.gamesPlayed);
        console.log({ profileLinks });
        console.log(profileLinks[0].href);
        console.log(profileLinks[0].gamesPlayed);
        await page.goto(profileLinks[0].href, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('h2', { timeout: 10000 });
        currentUrl = page.url();
      }

      page.on('console', msg => {
        // Forward browser logs to Node.js console
        const type = msg.type();
        const text = msg.text();
        if (type === 'error') {
          console.error(`[browser] ${text}`);
        } else {
          console.log(`[browser] ${text}`);
        }
      });
      qmMmr = await getMMR(page, playerName, 'Quick Match');
      slMmr = await getMMR(page, playerName, 'Storm league');

      console.log(`${playerName}: QM MMR: ${qmMmr}, SL MMR: ${slMmr}`);

      // call the get games function
      const qmResult = await getGames(playerName, page, selectors, 'qm', playerName);
      qmGames = qmResult.games.toString();
      qmWins = qmResult.wins;
      qmLosses = qmResult.losses;

      console.log(`QM: ${playerName}: QM Games: ${qmGames} = ${qmWins} + ${qmLosses}`);

      // call the get games function
      const slResults = await getGames(playerName, page, selectors, 'sl', playerName);
      slGames = slResults.games.toString();
      slWins = slResults.wins;
      slLosses = slResults.losses;
      console.log(`SL: ${playerName}: SL Games: ${slGames} = ${slWins} + ${slLosses}`);

      await page.close();
      return { url: currentUrl, qmMmr, slMmr, qmGames, slGames };
    } catch (error: any) {
      // take a screenshot
      await page.screenshot({ path: `./screenshots/debug_${playerName}.png` });
      console.error(`${playerName}: Error scraping data for ${url}: ${error.message}`);
      console.error(error);
      if (attempts >= maxAttempts - 1) {
        console.error(`${playerName}: Max attempts reached. Skipping this player.`);
        await page.close();
        return {
          url: currentUrl,
          qmMmr: qmMmr !== 'None' ? qmMmr : 'Error',
          slMmr: slMmr !== 'None' ? slMmr : 'Error',
          qmGames: qmGames !== 'None' ? qmGames : 'Error',
          slGames: slGames !== 'None' ? slGames : 'Error',
        };
      } else {
        console.log(`${playerName}: Retrying... (Attempt ${attempts}/${maxAttempts})`);
      }
    }
  }
  return {
    url: currentUrl,
    qmMmr: qmMmr !== 'None' ? qmMmr : 'Error',
    slMmr: slMmr !== 'None' ? slMmr : 'Error',
    qmGames: qmGames !== 'None' ? qmGames : 'Error',
    slGames: slGames !== 'None' ? slGames : 'Error',
  };
}

/**
	This function retrieves the MMR value for a specific player for a given row name.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {string} playerName - The name of the player.
 * @param {string} rowName - The name of the row to find.
 * @returns {Promise<string>} - A promise that resolves to the MMR value as a string.
 */
async function getMMR(page: Page, playerName: string, rowName: string): Promise<string> {
  return await page.evaluate(
    ({ playerName, rowName }) => {
      try {
        const h4s = Array.from(document.getElementsByTagName('h4'));
        const h4Match = h4s.find(h4 => h4.textContent?.includes(rowName));
        if (!h4Match) {
          console.log(`Quick Match NOT found for ${playerName}`);
          return '';
        }
        // Find the 4th sibling of the h4 element
        let sibling: Element = h4Match;
        for (let i = 0; i < 3; i++) {
          if (sibling?.nextElementSibling) {
            sibling = sibling.nextElementSibling;
          } else {
            console.log(`Sibling NOT found for ${playerName}`);
            return '';
          }
        }
        const secondChild = sibling?.children?.[0]?.children?.[1];
        if (secondChild) {
          // Second child found for ${playerName}
          return secondChild.innerHTML.replace(/,/g, '');
        } else {
          console.log(`Second child NOT found for ${playerName}`);
          return '';
        }
      } catch (error: any) {
        console.error(`Error waiting for ${rowName} selector:\n${error.message}`);
        return '';
      }
    },
    { playerName, rowName }
  );
}

/**
 * fetches the number of wins and losses for the current player
 * @param {string} playerId - The player ID to be used in the screenshot filename.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {HPSelectors} selectors - The selectors object containing the CSS selectors for the page elements.
 * @param {'qm' | 'sl'} label - The game type label ('qm' for Quick Match, 'sl' for Storm League).
 * @returns {Promise<{games: number;wins: number;losses: number;}>} - An object containing the number of games, wins, and losses.
 */
async function getGames(
  playerId: string,
  page: Page,
  selectors: HPSelectors,
  label: 'qm' | 'sl',
  playerName: string
): Promise<{ games: number; wins: number; losses: number }> {
  // run this up to 5 times max
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      attempts++;
      await page.click(selectors.gameTypeDropdown);
      await page.waitForSelector(selectors[`${label}GameTypeSelector`], { timeout: 10000 }); // Wait up to 60 seconds
      await page.click(selectors[`${label}GameTypeSelector`]);

      await page.click(selectors.filterButton);
      await Promise.race([
        page.waitForSelector(selectors.winsSelector, { timeout: 10000 }), // Wait up to 60 seconds
        page.waitForSelector(selectors.noDataSelector, { timeout: 10000 }), // Wait up to 60 seconds
      ]);
      break;
    } catch (error: any) {
      attempts++;
      console.log(`Attempt ${attempts} failed for ${playerName}. Retrying...`, error);
      await page.screenshot({ path: `./screenshots/debug_${playerName}_${attempts}.png` });
      if (error.name === 'TimeoutError') {
        console.log(`Timeout while waiting for wins selector.`);
      } else {
        console.error(`Error fetching wins data: ${error.message}`);
      }
      await page.reload({ waitUntil: 'networkidle2' }); // Reload the page to reset state
    }
  }

  // await page.screenshot({ path: `./screenshots/screenshot_${playerId}_${label.toUpperCase()}.png` });
  // wait for the QM games to load
  let wins =
    parseInt(
      (await page.$eval(selectors.winsSelector, el => el.textContent?.trim() ?? 'None').catch(() => 'None')).replace(
        /,/g,
        ''
      )
    ) || 0;
  let losses =
    parseInt(
      (await page.$eval(selectors.lossesSelector, el => el?.textContent?.trim() ?? 'None').catch(() => 'None')).replace(
        /,/g,
        ''
      )
    ) || 0;

  const games = wins === 0 && losses === 0 ? -1 : wins + losses;
  return { games, wins, losses };
}

export async function getHeroesProfileData(battleTag: string): Promise<HPData | undefined> {
  try {
    // if the screenshots directory doesn't exist, create it
    const dir = './screenshots';
    if (!existsSync(dir)) {
      mkdirSync(dir);
    }
    // keep track of the time, so we can see how long it took to run the script
    const startTime = Date.now();

    const url = `https://www.heroesprofile.com/battletag/searched/${encodeURIComponent(battleTag)}/alt`;

    // check that all playerUrls are valid
    const verifyBattleTag = /^.+#\d+$/;
    if (!verifyBattleTag.test(battleTag)) {
      console.error('Invalid BattleTag format. Please use the format Name#1234');
      return { url, qmMmr: 'Error', slMmr: 'Error', qmGames: 'Error', slGames: 'Error' };
    }

    const browser = await puppeteer.launch({ headless: true });

    const stats = await scrapePlayerStats(browser, url, battleTag);

    await browser.close();

    const endTime = Date.now();
    const elapsedTime = (endTime - startTime) / 1000;
    console.log(`Elapsed time: ${elapsedTime.toFixed(2)} seconds`);
    return stats;
  } catch (error) {
    console.error('An error occurred:', error);
  }
}
