/**
 * embedder.ts — generate OpenAI text embeddings for an array of strings.
 *
 * text-embedding-3-small supports up to 8,191 tokens per input and a batch
 * size of up to 2 048 inputs per API call.  We use a conservative batch size
 * of 100 to stay well within rate limits while minimising round-trips.
 */

import OpenAI from 'openai';
import { config } from '../shared/config';
import logger from '../shared/logger';

const openai = new OpenAI({ apiKey: config.openaiApiKey });

/** OpenAI embedding model to use */
const EMBEDDING_MODEL = 'text-embedding-3-small';

/** Maximum number of strings per API call */
const BATCH_SIZE = 100;

/**
 * Generate embeddings for `texts` in batches.
 * Returns a flat array of float vectors in the same order as the input.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    logger.debug(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(texts.length / BATCH_SIZE)} (${batch.length} items)`);

    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    // The API returns items in the same order as the input
    const batchEmbeddings = response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);

    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}
