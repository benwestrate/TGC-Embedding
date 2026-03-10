/**
 * config.ts — load and validate required environment variables.
 *
 * Uses dotenv so that a local .env file is picked up automatically.
 * All consumers import `config` from here rather than reading process.env
 * directly, which makes it easy to spot missing variables at startup.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from the project root (two levels up from src/shared/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${raw}`);
  }
  return parsed;
}

function optionalEnvStr(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  openaiApiKey: requireEnv('OPENAI_API_KEY'),

  /** ChromaDB collection name */
  chromaCollection: optionalEnvStr('CHROMA_COLLECTION', 'tgc_site'),

  /** Path to the ChromaDB persistence directory */
  chromaPath: path.resolve(optionalEnvStr('CHROMA_PATH', './chroma_db')),

  /** Working directory that holds sitemap.txt, processed.txt, etc. */
  workDir: path.resolve(optionalEnvStr('WORK_DIR', './crawl_state')),

  /** Number of words per chunk */
  chunkSize: optionalEnvInt('CHUNK_SIZE', 500),

  /** Word overlap between consecutive chunks */
  chunkOverlap: optionalEnvInt('CHUNK_OVERLAP', 50),

  /** Number of URLs processed concurrently */
  concurrency: optionalEnvInt('CONCURRENCY', 5),

  /** Maximum retry attempts before marking a URL as permanently failed */
  maxRetries: optionalEnvInt('MAX_RETRIES', 3),

  /** Base retry delay in ms — doubled on each attempt (exponential backoff) */
  retryDelayMs: optionalEnvInt('RETRY_DELAY_MS', 5000),

  /** Polite delay in ms between individual page fetches */
  requestDelayMs: optionalEnvInt('REQUEST_DELAY_MS', 500),
} as const;
