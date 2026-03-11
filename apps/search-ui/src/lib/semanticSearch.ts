import type { Collection } from 'chromadb'
import { ChromaClient } from 'chromadb'
import OpenAI from 'openai'
import { serverConfig } from './serverConfig'

export interface SearchItem {
  id: string
  title: string
  url: string
  summary: string
  author?: string
  publishedAt?: string
  subtitle?: string
}

let collectionPromise: Promise<Collection> | null = null
let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: serverConfig.openaiApiKey })
  }
  return openaiClient
}

async function getCollection(): Promise<Collection> {
  if (!collectionPromise) {
    const client = new ChromaClient({ path: serverConfig.chromaPath })
    collectionPromise = client.getOrCreateCollection({
      name: serverConfig.chromaCollection,
      metadata: { 'hnsw:space': 'cosine' },
    })
  }

  return collectionPromise
}

function parseMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      title: 'Untitled',
      url: '',
      subtitle: undefined as string | undefined,
      author: undefined as string | undefined,
      publishedAt: undefined as string | undefined,
    }
  }

  const typed = metadata as Record<string, unknown>
  return {
    title: typeof typed.title === 'string' ? typed.title : 'Untitled',
    url: typeof typed.url === 'string' ? typed.url : '',
    subtitle: typeof typed.subtitle === 'string' ? typed.subtitle : undefined,
    author: typeof typed.author === 'string' ? typed.author : undefined,
    publishedAt:
      typeof typed.published_at === 'string' ? typed.published_at : undefined,
  }
}

function toSummary(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 260) return normalized
  return `${normalized.slice(0, 257).trimEnd()}...`
}

export async function semanticSearch(
  query: string,
  topK?: number,
): Promise<SearchItem[]> {
  const queryText = query.trim()
  if (!queryText) return []

  const openai = getOpenAIClient()
  const embeddingResponse = await openai.embeddings.create({
    model: serverConfig.embeddingModel,
    input: queryText,
  })

  const queryEmbedding = embeddingResponse.data[0].embedding

  const collection = await getCollection()
  const nResults = Math.min(
    topK ?? serverConfig.defaultTopK,
    serverConfig.maxTopK,
  )

  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults,
    include: ['metadatas', 'documents'],
  })

  const ids = result.ids[0]
  const documents = result.documents[0]
  const metadatas = result.metadatas[0]
  return ids.map((id, index) => {
    const metadata = parseMetadata(metadatas[index])
    const summary =
      typeof documents[index] === 'string' ? toSummary(documents[index]) : ''

    return {
      id,
      title: metadata.title,
      url: metadata.url,
      subtitle: metadata.subtitle,
      author: metadata.author,
      publishedAt: metadata.publishedAt,
      summary,
    }
  })
}
