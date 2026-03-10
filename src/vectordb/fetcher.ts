/**
 * fetcher.ts — fetch a URL with retry logic and exponential back-off.
 *
 * Two fetch strategies are supported, controlled by config.useBrowser:
 *
 *   false (default) — axios HTTP fetch.
 *     Fast and lightweight; works for any server-rendered or statically
 *     generated page.  Does NOT execute JavaScript.
 *
 *   true — Playwright headless Chromium.
 *     Launches a single shared browser instance (reused across all requests
 *     to avoid the overhead of a cold start per URL).  Navigates to the page,
 *     waits for network activity to settle ("networkidle"), then returns the
 *     fully-rendered outerHTML.  Required for JavaScript-rendered SPAs (React,
 *     Vue, Angular, Next.js client-side navigation, etc.).
 *
 * In both modes the same retry / exponential back-off and polite-delay
 * logic applies, and the rest of the pipeline (extractor → chunker → embedder
 * → store) is completely unchanged.
 */

import axios from 'axios';
import { config } from '../shared/config';
import logger from '../shared/logger';

const USER_AGENT =
  'Mozilla/5.0 (compatible; TGCEmbedBot/1.0; +https://github.com/benwestrate/TGC-Embedding)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Headless-browser singleton ────────────────────────────────────────────────
//
// We keep a single Browser + BrowserContext open for the lifetime of the
// process and share it across all concurrent jobs.  Opening a new browser
// per URL would add ~1 s of cold-start latency and hundreds of MB of RAM.
//
// Using `import type` here means the `playwright` package is only resolved
// at runtime when USE_BROWSER=true, so users who never need JS rendering
// don't have to install the Chromium binary.

import type { Browser, BrowserContext } from 'playwright';
let _browser: Browser | null = null;
let _context: BrowserContext | null = null;

async function getBrowserContext(): Promise<BrowserContext> {
  if (_context) return _context;

  // Dynamic import so playwright is not loaded unless USE_BROWSER is true
  const { chromium } = await import('playwright');

  _browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // prevents OOM crashes in low-memory containers
    ],
  });

  _context = await _browser.newContext({
    userAgent: USER_AGENT,
    // Ignore HTTPS errors (e.g., self-signed certs on staging sites)
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  });

  // Block heavy binary resources to speed up rendering
  await _context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'media', 'font', 'stylesheet'].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  logger.info('Playwright browser launched');
  return _context;
}

/**
 * Close the shared browser gracefully.
 * Called automatically on process exit when USE_BROWSER=true.
 */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
    _context = null;
    logger.info('Playwright browser closed');
  }
}

// Register signal handlers so the shared browser is closed gracefully.
// The exit event cannot run async code, so only SIGINT/SIGTERM are used here.
process.on('SIGINT', () => { void closeBrowser().then(() => process.exit(0)); });
process.on('SIGTERM', () => { void closeBrowser().then(() => process.exit(0)); });

// ── Fetch strategies ──────────────────────────────────────────────────────────

async function fetchWithAxios(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    headers: { 'User-Agent': USER_AGENT },
    responseType: 'text',
    // 30-second timeout to avoid hanging on slow pages
    timeout: 30_000,
    // Follow redirects automatically (axios default)
    maxRedirects: 5,
  });
  return response.data as string;
}

async function fetchWithBrowser(url: string): Promise<string> {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  try {
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: config.browserTimeoutMs,
    });
    // Return the fully-rendered outer HTML so cheerio sees the same DOM
    // that a regular browser user would see
    return await page.content();
  } finally {
    // Always close the page to free memory; the browser/context stays open
    await page.close();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch the HTML source of `url`, using either axios or a headless browser
 * depending on config.useBrowser.  Throws after all retries are exhausted.
 */
export async function fetchPage(url: string): Promise<string> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential back-off: retryDelayMs * 2^(attempt-1)
      const delay = config.retryDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`Retrying ${url} (attempt ${attempt}/${config.maxRetries}) in ${delay}ms`);
      await sleep(delay);
    }

    try {
      const html = config.useBrowser
        ? await fetchWithBrowser(url)
        : await fetchWithAxios(url);

      // Polite delay after a successful fetch before the caller can proceed
      if (config.requestDelayMs > 0) {
        await sleep(config.requestDelayMs);
      }

      return html;
    } catch (err) {
      lastError = err;
      logger.warn(`Fetch failed for ${url}`, err instanceof Error ? err.message : err);
    }
  }

  throw new Error(
    `Failed to fetch ${url} after ${config.maxRetries + 1} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
