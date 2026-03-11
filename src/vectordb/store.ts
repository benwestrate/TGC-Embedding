/**
 * store.ts — initialize ChromaDB and upsert page chunks.
 *
 * ChromaDB is used in persistent mode so embeddings survive restarts.
 * We upsert rather than add so that re-running the pipeline for a URL
 * (e.g., after a partial failure) safely overwrites stale vectors.
 *
 * Document IDs are derived deterministically from url + chunk_index so
 * that re-processing a URL always targets the same rows.
 */

import { ChromaClient, Collection } from 'chromadb';
import { config } from '../shared/config';
import logger from '../shared/logger';
import { TextChunk } from './chunker';

export interface ChunkRecord {
  chunk: TextChunk;
  url: string;
  title: string;
  subtitle?: string;
  capturedAt: string;
  publishedAt?: string;
  author?: string;
  embedding: number[];
}

// Module-level singleton so we only initialise once per process
let collection: Collection | null = null;

/** Lazily initialise (or re-use) the ChromaDB collection. */
export async function getCollection(): Promise<Collection> {
  if (collection) return collection;

  // ChromaClient v1.x — persistent mode via path
  const client = new ChromaClient({ path: config.chromaPath });

  // getOrCreateCollection is idempotent: safe to call on every startup
  collection = await client.getOrCreateCollection({
    name: config.chromaCollection,
    metadata: { 'hnsw:space': 'cosine' },
  });

  logger.info(`ChromaDB collection "${config.chromaCollection}" ready`, {
    path: config.chromaPath,
  });

  return collection;
}

/**
 * Upsert a batch of chunk records into ChromaDB.
 * A deterministic document ID (url::chunkIndex) means repeated upserts
 * for the same URL overwrite the previous vectors cleanly.
 */
export async function upsertChunks(records: ChunkRecord[]): Promise<void> {
  if (records.length === 0) return;

  const col = await getCollection();

  const ids = records.map((r) => `${r.url}::${r.chunk.index}`);
  const embeddings = records.map((r) => r.embedding);
  const documents = records.map((r) => r.chunk.text);
  const metadatas = records.map((r) => ({
    url: r.url,
    chunk_index: r.chunk.index,
    title: r.title,
    ...(r.subtitle ? { subtitle: r.subtitle } : {}),
    captured_at: r.capturedAt,
    ...(r.publishedAt ? { published_at: r.publishedAt } : {}),
    ...(r.author ? { author: r.author } : {}),
  }));

  await col.upsert({ ids, embeddings, documents, metadatas });
  logger.debug(`Upserted ${records.length} chunks`, { url: records[0]?.url });
}
