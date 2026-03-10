/**
 * fetcher.ts — fetch a URL with retry logic and exponential back-off.
 *
 * Uses a Mozilla user-agent so sites don't serve bot-specific content.
 * Retries are capped at config.maxRetries; the delay doubles each attempt
 * (1× → 2× → 4× … of retryDelayMs) to avoid hammering a recovering server.
 */

import axios from 'axios';
import { config } from '../shared/config';
import logger from '../shared/logger';

const USER_AGENT =
  'Mozilla/5.0 (compatible; TGCEmbedBot/1.0; +https://github.com/benwestrate/TGC-Embedding)';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch the HTML source of `url`.
 * Throws after all retries are exhausted.
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
      const response = await axios.get<string>(url, {
        headers: { 'User-Agent': USER_AGENT },
        responseType: 'text',
        // 30-second timeout to avoid hanging on slow pages
        timeout: 30_000,
        // Follow redirects automatically (axios default)
        maxRedirects: 5,
      });

      // Polite delay after a successful fetch before the caller can proceed
      if (config.requestDelayMs > 0) {
        await sleep(config.requestDelayMs);
      }

      return response.data as string;
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
