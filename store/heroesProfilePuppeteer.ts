import puppeteer, { Browser, Page } from 'puppeteer';
import { appendFileSync } from 'fs';
import { userAgent } from './heroesProfile';

// Save original console methods
const origLog = console.log;
const origError = console.error;

// Override console.log
console.log = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  origLog(...args);
  appendFileSync('out.log', msg + '\n');
};

// Override console.error
console.error = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  origError(...args);
  appendFileSync('out.log', '[ERROR] ' + msg + '\n');
};

export async function puppeteerRefreshXsrfTokenAndCookies(
  url: string,
): Promise<{ xsrfToken: string; cookies: string; page: Page; browser: Browser }> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--user-agent=' + userAgent, '--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = (await browser.pages())[0];
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.resourceType() === 'document' || request.url().startsWith('https://www.heroesprofile.com/api/')) {
        request.continue();
      } else {
        request.abort();
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Find the XSRF token
    const client = await page.createCDPSession();
    const { cookies: cookieObjects } = await client.send('Network.getAllCookies');

    const xsrfCookie = cookieObjects.find(c => c.name === 'XSRF-TOKEN');
    if (!xsrfCookie) {
      throw new Error(
        'XSRF-TOKEN cookie not found! Cookies: ' + cookieObjects.map(c => `${c.name}=${c.value}`).join('; '),
      );
    }

    // Format cookies as a header string
    const cookieHeader = cookieObjects.map(c => `${c.name}=${c.value}`).join('; ');

    // console.log('cookieHeader:', cookieHeader);

    return {
      xsrfToken: xsrfCookie.value,
      cookies: cookieHeader,
      page,
      browser,
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
