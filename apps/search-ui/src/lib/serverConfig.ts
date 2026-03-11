import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function optionalEnvString(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

function optionalEnvInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got ${raw}`)
  }
  return parsed
}

export const serverConfig = {
  openaiApiKey: requireEnv('OPENAI_API_KEY'),
  chromaPath: optionalEnvString('CHROMA_PATH', 'http://localhost:8000'),
  chromaCollection: optionalEnvString('CHROMA_COLLECTION', 'tgc_site'),
  defaultTopK: optionalEnvInt('SEARCH_TOP_K', 8),
  maxTopK: optionalEnvInt('SEARCH_MAX_TOP_K', 20),
  embeddingModel: optionalEnvString('EMBEDDING_MODEL', 'text-embedding-3-small'),
} as const
