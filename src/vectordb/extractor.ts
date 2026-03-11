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
  /** Optional subtitle/dek when present */
  subtitle?: string;
  /** Clean plain-text content */
  text: string;
  /** Published date from common page metadata, when available */
  publishedAt?: string;
  /** Author name from common page metadata, when available */
  author?: string;
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

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value.trim().length > 0)?.trim();
}

function normaliseAuthorName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  // Skip obvious non-name blobs (bios, long sentences, etc).
  if (cleaned.length > 80) return undefined;
  if (/[.!?]/.test(cleaned)) return undefined;
  return cleaned;
}

function normaliseSubtitle(value: string | undefined, title: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  if (cleaned.length > 400) return undefined;
  if (cleaned.toLowerCase() === title.toLowerCase()) return undefined;
  return cleaned;
}

function readJsonLdCandidates($: ReturnType<typeof cheerio.load>): unknown[] {
  const candidates: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      candidates.push(parsed);
    } catch {
      // Some pages contain non-JSON values in ld+json blocks; ignore safely.
    }
  });
  return candidates;
}

function flattenJsonLdNodes(candidate: unknown): Array<Record<string, unknown>> {
  if (!candidate || typeof candidate !== 'object') return [];
  if (Array.isArray(candidate)) {
    return candidate.flatMap((item) => flattenJsonLdNodes(item));
  }

  const obj = candidate as Record<string, unknown>;
  const graph = obj['@graph'];
  if (Array.isArray(graph)) {
    return graph
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .flatMap((item) => flattenJsonLdNodes(item));
  }

  return [obj];
}

function jsonLdTypeIncludes(node: Record<string, unknown>, typeName: string): boolean {
  const rawType = node['@type'];
  if (typeof rawType === 'string') return rawType === typeName;
  if (Array.isArray(rawType)) return rawType.some((t) => typeof t === 'string' && t === typeName);
  return false;
}

function extractJsonLdAuthor(
  node: Record<string, unknown>,
  byId: Map<string, Record<string, unknown>>,
): string | undefined {
  const rawAuthor = node['author'];
  if (!rawAuthor) return undefined;

  const readOne = (author: unknown): string | undefined => {
    if (typeof author === 'string') return normaliseAuthorName(author);
    if (!author || typeof author !== 'object') return undefined;
    const authorObj = author as Record<string, unknown>;
    const directName = typeof authorObj['name'] === 'string' ? authorObj['name'] : undefined;
    if (directName) return normaliseAuthorName(directName);

    const id = typeof authorObj['@id'] === 'string' ? authorObj['@id'] : undefined;
    if (!id) return undefined;
    const linked = byId.get(id);
    if (!linked) return undefined;
    return typeof linked['name'] === 'string' ? normaliseAuthorName(linked['name']) : undefined;
  };

  if (Array.isArray(rawAuthor)) {
    for (const item of rawAuthor) {
      const name = readOne(item);
      if (name) return name;
    }
    return undefined;
  }

  return readOne(rawAuthor);
}

export function extractContent(html: string, url: string): ExtractedPage {
  const $ = cheerio.load(html);

  // ── Title ─────────────────────────────────────────────────────────────────
  const rawTitle =
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    url;

  // ── Metadata (author / publish date) ──────────────────────────────────────
  const jsonLdNodes = readJsonLdCandidates($).flatMap((candidate) => flattenJsonLdNodes(candidate));
  const nodesById = new Map<string, Record<string, unknown>>();
  for (const node of jsonLdNodes) {
    const id = typeof node['@id'] === 'string' ? node['@id'] : undefined;
    if (id) nodesById.set(id, node);
  }

  const contentNode = jsonLdNodes.find((node) =>
    ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'WebPage'].some((t) =>
      jsonLdTypeIncludes(node, t),
    ),
  );

  const jsonLdPublishedAt =
    contentNode && typeof contentNode['datePublished'] === 'string'
      ? contentNode['datePublished']
      : undefined;
  const jsonLdAuthor = contentNode ? extractJsonLdAuthor(contentNode, nodesById) : undefined;
  const jsonLdSubtitle =
    contentNode && typeof contentNode['description'] === 'string'
      ? contentNode['description']
      : undefined;

  const publishedAt = firstNonEmpty(
    jsonLdPublishedAt,
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[name="article:published_time"]').attr('content'),
    $('meta[name="publish_date"]').attr('content'),
    $('meta[name="pubdate"]').attr('content'),
    $('meta[itemprop="datePublished"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  );

  const author = firstNonEmpty(
    jsonLdAuthor,
    normaliseAuthorName($('meta[name="author"]').attr('content')),
    normaliseAuthorName($('meta[property="article:author"]').attr('content')),
    normaliseAuthorName($('meta[name="parsely-author"]').attr('content')),
    normaliseAuthorName($('article .author a').first().text()),
    normaliseAuthorName($('main .author a').first().text()),
    normaliseAuthorName($('a[rel="author"]').first().text()),
    normaliseAuthorName($('[itemprop="author"]').first().text()),
    normaliseAuthorName($('article .author').first().text()),
    normaliseAuthorName($('main .author').first().text()),
    normaliseAuthorName($('article [class*="author"] a').first().text()),
    normaliseAuthorName($('main [class*="author"] a').first().text()),
  );
  const subtitle = normaliseSubtitle(
    firstNonEmpty(
      jsonLdSubtitle,
      $('meta[property="og:description"]').attr('content'),
      $('meta[name="description"]').attr('content'),
      $('meta[name="twitter:description"]').attr('content'),
      $('meta[property="article:description"]').attr('content'),
      $('article .subtitle').first().text(),
      $('main .subtitle').first().text(),
      $('article .entry-subtitle').first().text(),
      $('main .entry-subtitle').first().text(),
      $('article .dek').first().text(),
      $('main .dek').first().text(),
      $('article h2').first().text(),
      $('main h2').first().text(),
    ),
    rawTitle,
  );

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

  return { title: rawTitle, subtitle, text, publishedAt, author };
}
