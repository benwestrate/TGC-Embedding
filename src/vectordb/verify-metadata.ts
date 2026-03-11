import * as dotenv from 'dotenv';
import * as path from 'path';
import { ChromaClient, IncludeEnum } from 'chromadb';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface MetadataRecord extends Record<string, unknown> {
  url?: string;
  title?: string;
  subtitle?: string;
  captured_at?: string;
  published_at?: string;
  author?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

async function main(): Promise<void> {
  const chromaPath = process.env['CHROMA_PATH'] ?? 'http://localhost:8000';
  const collectionName = process.env['CHROMA_COLLECTION'] ?? 'tgc_site';
  const requestedSample = parseInt(process.env['VERIFY_SAMPLE_SIZE'] ?? '25', 10);
  const sampleSize = Number.isFinite(requestedSample) && requestedSample > 0 ? requestedSample : 25;

  const client = new ChromaClient({ path: chromaPath });
  const collection = await client.getOrCreateCollection({ name: collectionName });

  const total = await collection.count();
  if (total === 0) {
    console.log(`Collection "${collectionName}" is empty.`);
    return;
  }

  const limit = Math.min(sampleSize, total);
  const result = await collection.get({ limit, include: [IncludeEnum.Metadatas] });
  const metadatas = (result.metadatas ?? []) as MetadataRecord[];

  let withCapturedAt = 0;
  let withPublishedAt = 0;
  let withAuthor = 0;
  let withSubtitle = 0;

  for (const metadata of metadatas) {
    if (asString(metadata.captured_at)) withCapturedAt += 1;
    if (asString(metadata.published_at)) withPublishedAt += 1;
    if (asString(metadata.author)) withAuthor += 1;
    if (asString(metadata.subtitle)) withSubtitle += 1;
  }

  console.log(`Collection: ${collectionName}`);
  console.log(`Chroma path: ${chromaPath}`);
  console.log(`Total vectors: ${total}`);
  console.log(`Sample checked: ${metadatas.length}`);
  console.log(`captured_at present: ${withCapturedAt}/${metadatas.length}`);
  console.log(`published_at present: ${withPublishedAt}/${metadatas.length}`);
  console.log(`author present: ${withAuthor}/${metadatas.length}`);
  console.log(`subtitle present: ${withSubtitle}/${metadatas.length}`);
  console.log('');
  console.log('Sample rows:');

  const previewSize = Math.min(5, metadatas.length);
  for (let i = 0; i < previewSize; i += 1) {
    const metadata = metadatas[i] ?? {};
    console.log(`- url: ${asString(metadata.url) ?? '(missing)'}`);
    console.log(`  title: ${asString(metadata.title) ?? '(missing)'}`);
    console.log(`  subtitle: ${asString(metadata.subtitle) ?? '(missing)'}`);
    console.log(`  captured_at: ${asString(metadata.captured_at) ?? '(missing)'}`);
    console.log(`  published_at: ${asString(metadata.published_at) ?? '(missing)'}`);
    console.log(`  author: ${asString(metadata.author) ?? '(missing)'}`);
  }
}

main().catch((err) => {
  console.error('Metadata verification failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
