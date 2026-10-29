import { appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { connect, PageWithCursor } from 'puppeteer-real-browser'
import type { Browser, Protocol } from 'rebrowser-puppeteer-core'

// Enable rebrowser CDP isolation patches so Cloudflare does not detect DevTools protocol
process.env.REBROWSER_PATCHES_RUNTIME_FIX_MODE = 'addBinding'

// Save original console methods
const origLog = console.log
const origError = console.error

// Override console.log
console.log = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  origLog(...args)
  appendFileSync('out.log', msg + '\n')
}

// Override console.error
console.error = (...args: any[]) => {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  origError(...args)
  appendFileSync('out.log', '[ERROR] ' + msg + '\n')
}

export async function puppeteerRefreshXsrfTokenAndCookies(url: string): Promise<{
  xsrfToken: string
  cookies: string
  page: PageWithCursor
  browser: Browser
}> {
  if (!process.env.CHROME_PATH) {
    try {
      const { execSync } = await import('child_process')
      const foundPath = execSync(
        'find ~/.cache/puppeteer/chrome -name chrome -type f 2>/dev/null | grep -v "156" | sort -V | tail -n 1',
        {
          encoding: 'utf8',
        }
      ).trim()
      if (foundPath) process.env.CHROME_PATH = foundPath
    } catch {}
  }

  const userDataDir = '/tmp/puppeteer_real_browser'
  mkdirSync(userDataDir, { recursive: true })

  // Clean up stale logs and locks so chrome-launcher detects the new DevTools port
  for (const file of ['chrome-err.log', 'chrome-out.log', 'SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try {
      const filePath = `${userDataDir}/${file}`
      if (existsSync(filePath)) {
        unlinkSync(filePath)
      }
    } catch {}
  }

  const { browser, page } = await connect({
    headless: false,
    turnstile: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--user-data-dir=' + userDataDir,
    ],
    customConfig: {
      userDataDir,
    },
  })
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // Allow Cloudflare Turnstile / security challenge to complete
    await new Promise(r => setTimeout(r, 2000))

    // Find the XSRF token
    let xsrfCookie: Protocol.Network.Cookie | undefined
    let cookieObjects: Protocol.Network.Cookie[] = []

    for (let i = 0; i < 20; i++) {
      const client = await page.createCDPSession()
      const res = await client.send('Network.getAllCookies')
      cookieObjects = res.cookies
      xsrfCookie = cookieObjects.find(c => c.name.toUpperCase() === 'XSRF-TOKEN')
      if (xsrfCookie) break

      await new Promise(r => setTimeout(r, 1000))
    }

    if (!xsrfCookie) {
      await page.screenshot({ path: '/tmp/cf_screenshot.png' }).catch(() => {})
      const currentUrl = page.url()
      const currentTitle = await page.title().catch(() => 'unknown')
      throw new Error(
        `XSRF-TOKEN cookie not found! URL: ${currentUrl} ("${currentTitle}"). Cookies: ` +
          cookieObjects.map(c => `${c.name}=${c.value}`).join('; ')
      )
    }

    // Format cookies as a header string
    const cookieHeader = cookieObjects.map(c => `${c.name}=${c.value}`).join('; ')

    // console.log('cookieHeader:', cookieHeader);

    return {
      xsrfToken: xsrfCookie.value,
      cookies: cookieHeader,
      page,
      browser,
    }
  } catch (error) {
    await browser.close()
    throw error
  }
}
