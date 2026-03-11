/**
 * chunker.ts — split plain text into overlapping token windows.
 *
 * "Tokens" here are approximated by whitespace-split words (roughly 1 word ≈
 * 1.3 tokens for English prose).  Using a word-based split is deterministic,
 * requires no external tokeniser, and is accurate enough for chunk-size
 * budgeting with text-embedding-3-small (8191-token limit).
 *
 * Overlap prevents loss of context at chunk boundaries: the last `overlap`
 * words of chunk N become the first words of chunk N+1, so a sentence that
 * straddles a boundary is represented in both chunks.
 */

export interface TextChunk {
  /** Zero-based index within the page */
  index: number;
  /** Chunk text */
  text: string;
}

/**
 * Split `text` into chunks of at most `chunkSize` words with `overlap` words
 * of overlap between consecutive chunks.
 */
export function chunkText(
  text: string,
  chunkSize: number,
  overlap: number,
): TextChunk[] {
  if (chunkSize <= 0) throw new RangeError('chunkSize must be > 0');
  if (overlap < 0) throw new RangeError('overlap must be >= 0');
  if (overlap >= chunkSize) throw new RangeError('overlap must be < chunkSize');

  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const chunks: TextChunk[] = [];
  const step = chunkSize - overlap; // how far to advance the window each time
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push({
      index: chunks.length,
      text: words.slice(start, end).join(' '),
    });
    // If the remaining words fit in one chunk we're done
    if (end === words.length) break;
    start += step;
  }

  return chunks;
}
