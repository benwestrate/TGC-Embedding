/**
 * index.ts — pipeline orchestration entry point.
 *
 * Flow:
 *   1. Load sitemap.txt → deduplicate → subtract already-processed URLs
 *   2. Push remaining URLs into a p-queue (concurrency = config.concurrency)
 *   3. Each job: fetch → extract → chunk → embed → upsert → mark processed
 *   4. After every job (success or failure) update stats.json
 *   5. Failed URLs (all retries exhausted) are written to failed.txt
 *
 * Resumability: processed.txt is appended after each successful embed so a
 * restart simply re-reads the file and skips already-done URLs.
 */

import PQueue from 'p-queue';
import { config } from '../shared/config';
import logger from '../shared/logger';
import {
  ensureWorkDir,
  loadSitemap,
  loadProcessed,
  markProcessed,
  markFailed,
  writeStats,
  Stats,
} from '../shared/state';
import { fetchPage } from './fetcher';
import { extractContent } from './extractor';
import { chunkText } from './chunker';
import { generateEmbeddings } from './embedder';
import { upsertChunks, ChunkRecord } from './store';

// ── State ────────────────────────────────────────────────────────────────────

const stats: Stats = {
  processed: 0,
  total: 0,
  chunks: 0,
  failed: 0,
  timestamp: new Date().toISOString(),
};

// ── Core job ─────────────────────────────────────────────────────────────────

/**
 * Process a single URL: fetch → extract → chunk → embed → store.
 * All retry logic lives in fetcher.ts; this function either succeeds or
 * throws (after retries) so the queue handler can record the failure.
 *
 * When config.dryRun is true the embed and store steps are skipped so the
 * pipeline can be validated without incurring API costs or writing to the DB.
 */
async function processUrl(url: string): Promise<number> {
  // 1. Fetch
  const html = await fetchPage(url);

  // 2. Extract clean text
  const { title, text } = extractContent(html, url);
  if (!text) {
    logger.warn(`Empty content extracted from ${url}`);
    return 0;
  }

  // 3. Chunk
  const chunks = chunkText(text, config.chunkSize, config.chunkOverlap);
  if (chunks.length === 0) {
    logger.warn(`No chunks produced for ${url}`);
    return 0;
  }

  if (config.dryRun) {
    logger.info(`[dry-run] Would embed and store ${chunks.length} chunks for ${url}`);
    return chunks.length;
  }

  // 4. Embed
  const texts = chunks.map((c) => c.text);
  const embeddings = await generateEmbeddings(texts);

  // 5. Build records and upsert
  const records: ChunkRecord[] = chunks.map((chunk, i) => ({
    chunk,
    url,
    title,
    embedding: embeddings[i]!,
  }));
  await upsertChunks(records);

  return chunks.length;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  ensureWorkDir();

  // Load sitemap and subtract already-processed URLs
  const allUrls = loadSitemap();
  const processed = loadProcessed();
  let pending = allUrls.filter((u) => !processed.has(u));

  // Apply URL limit (DRY_RUN or quick test slices)
  if (config.limit > 0) {
    pending = pending.slice(0, config.limit);
  }

  stats.total = allUrls.length;
  stats.processed = processed.size;
  stats.timestamp = new Date().toISOString();

  if (config.dryRun) {
    logger.info('DRY-RUN mode — embedding and ChromaDB writes are skipped');
  }
  if (config.limit > 0) {
    logger.info(`LIMIT=${config.limit} — processing at most ${config.limit} pending URLs`);
  }

  logger.info(`Sitemap: ${allUrls.length} URLs total, ${processed.size} already processed`);
  logger.info(`Starting pipeline for ${pending.length} pending URLs`);

  if (pending.length === 0) {
    logger.info('Nothing to do — all URLs already processed');
    await writeStats(stats);
    return;
  }

  const startTime = Date.now();

  // p-queue controls concurrency; each URL is one task
  const queue = new PQueue({ concurrency: config.concurrency });

  for (const url of pending) {
    queue.add(async () => {
      logger.info(`Processing: ${url}`);
      try {
        const chunkCount = await processUrl(url);
        // In dry-run mode skip writing to processed.txt so state is unchanged
        if (!config.dryRun) {
          await markProcessed(url);
        }
        stats.processed += 1;
        stats.chunks += chunkCount;
        logger.info(`Done: ${url} (${chunkCount} chunks)`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error(`Failed: ${url}`, reason);
        // In dry-run mode skip writing to failed.txt so state is unchanged
        if (!config.dryRun) {
          await markFailed(url, reason);
        }
        stats.failed += 1;
      } finally {
        stats.timestamp = new Date().toISOString();
        await writeStats(stats);
      }
    });
  }

  // Wait for all queued jobs to finish
  await queue.onIdle();

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(
    `Pipeline complete in ${elapsedSec}s — ${stats.processed} processed, ${stats.failed} failed, ${stats.chunks} chunks`,
  );
  await writeStats(stats);
}

main().catch((err) => {
  logger.error('Fatal pipeline error', err instanceof Error ? err.message : err);
  process.exit(1);
});
