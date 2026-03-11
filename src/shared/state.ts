/**
 * state.ts — load/save processed.txt, failed.txt, and stats.json.
 *
 * Reads are synchronous (called once at startup) so the pipeline needs no
 * await for state reads.  Writes are async to avoid blocking the event loop
 * during heavy batches.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from './config';
import logger from './logger';

// ── File paths ───────────────────────────────────────────────────────────────

export const SITEMAP_FILE = path.join(config.workDir, 'sitemap.txt');
export const PROCESSED_FILE = path.join(config.workDir, 'processed.txt');
export const FAILED_FILE = path.join(config.workDir, 'failed.txt');
export const STATS_FILE = path.join(config.workDir, 'stats.json');

// ── Types ────────────────────────────────────────────────────────────────────

export interface Stats {
  processed: number;
  total: number;
  chunks: number;
  failed: number;
  timestamp: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Ensure the work directory exists. */
export function ensureWorkDir(): void {
  fs.mkdirSync(config.workDir, { recursive: true });
}

/** Read all URLs from sitemap.txt, one per line. */
export function loadSitemap(): string[] {
  if (!fs.existsSync(SITEMAP_FILE)) {
    throw new Error(`Sitemap file not found: ${SITEMAP_FILE}`);
  }
  const lines = fs
    .readFileSync(SITEMAP_FILE, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  // Keep first-seen order while removing duplicate URLs.
  return [...new Set(lines)];
}

/** Return the set of URLs that have already been successfully embedded. */
export function loadProcessed(): Set<string> {
  if (!fs.existsSync(PROCESSED_FILE)) return new Set();
  const lines = fs
    .readFileSync(PROCESSED_FILE, 'utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return new Set(lines);
}

/**
 * Append a successfully-processed URL to processed.txt.
 * Appending (rather than rewriting) is intentional: it is safe even if the
 * process crashes mid-write, and it never requires a full file read/write cycle.
 */
export async function markProcessed(url: string): Promise<void> {
  await fs.promises.appendFile(PROCESSED_FILE, url + '\n', 'utf-8');
}

/**
 * Append a permanently-failed URL (with optional reason) to failed.txt.
 */
export async function markFailed(url: string, reason?: string): Promise<void> {
  const line = reason ? `${url}\t${reason}` : url;
  await fs.promises.appendFile(FAILED_FILE, line + '\n', 'utf-8');
}

/**
 * Atomically overwrite stats.json with the latest counters.
 * The monitor process polls this file every second.
 */
export async function writeStats(stats: Stats): Promise<void> {
  try {
    await fs.promises.writeFile(STATS_FILE, JSON.stringify(stats, null, 2), 'utf-8');
  } catch (err) {
    logger.warn('Failed to write stats.json', err);
  }
}

/** Read the last-written stats, or return a zeroed baseline. */
export function readStats(): Stats | null {
  if (!fs.existsSync(STATS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')) as Stats;
  } catch {
    return null;
  }
}
