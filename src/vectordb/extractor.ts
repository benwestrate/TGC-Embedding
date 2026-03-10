/**
 * extractor.ts — parse an HTML page and return clean plain text.
 *
 * Strategy:
 * 1. Remove noise elements (scripts, styles, nav, header, footer, aside).
 * 2. Prefer <main> or <article> for the content root — these semantic
 *    elements contain the actual article body on most sites.
 * 3. Fall back to <body> when neither <main> nor <article> exists.
 * 4. Collapse whitespace so the resulting text is suitable for tokenisation.
 */

import * as cheerio from 'cheerio';

export interface ExtractedPage {
  /** Raw page title from <title> or first <h1> */
  title: string;
  /** Clean plain-text content */
  text: string;
}

/** HTML tags that never contribute meaningful body content */
const NOISE_TAGS = [
  'script',
  'style',
  'noscript',
  'nav',
  'header',
  'footer',
  'aside',
  'form',
  'button',
  'iframe',
  'svg',
  'img',
];

export function extractContent(html: string, url: string): ExtractedPage {
  const $ = cheerio.load(html);

  // ── Title ─────────────────────────────────────────────────────────────────
  const rawTitle =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url;

  // ── Strip noise ───────────────────────────────────────────────────────────
  $(NOISE_TAGS.join(', ')).remove();

  // ── Pick content root ─────────────────────────────────────────────────────
  // Prefer semantic elements; fall back to full <body>
  const contentRoot =
    $('main').length > 0
      ? $('main')
      : $('article').length > 0
        ? $('article').first()
        : $('body');

  // ── Extract and normalise text ────────────────────────────────────────────
  const rawText = contentRoot.text();

  // Collapse multiple whitespace/newline characters into a single space
  const text = rawText
    .replace(/\s+/g, ' ')
    .trim();

  return { title: rawTitle, text };
}
