import { appendFileSync, mkdirSync } from 'fs';
import { connect, PageWithCursor } from 'puppeteer-real-browser';
import type { Browser, Protocol } from "rebrowser-puppeteer-core";

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
): Promise<{ xsrfToken: string; cookies: string; page: PageWithCursor; browser: Browser }> {
  if (!process.env.CHROME_PATH) {
    try {
      const { execSync } = await import('child_process');
      const foundPath = execSync('find ~/.cache/puppeteer/chrome -name chrome -type f 2>/dev/null | head -n 1', {
        encoding: 'utf8',
      }).trim();
      if (foundPath) process.env.CHROME_PATH = foundPath;
    } catch { }
  }

  const userDataDir = '/tmp/puppeteer_real_browser';
  mkdirSync(userDataDir, { recursive: true });

  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--user-data-dir=' + userDataDir],
    customConfig: {
      userDataDir,
    },
  });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Find the XSRF token
    let xsrfCookie;
    let cookieObjects: Protocol.Network.Cookie[] = [];
    for (let i = 0; i < 10; i++) {
      const client = await page.createCDPSession();
      const res = await client.send('Network.getAllCookies');
      cookieObjects = res.cookies;
      xsrfCookie = cookieObjects.find(c => c.name === 'XSRF-TOKEN');
      if (xsrfCookie) break;
      await new Promise(r => setTimeout(r, 1000));
    }

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
