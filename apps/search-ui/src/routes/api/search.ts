import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { semanticSearch } from '../../lib/semanticSearch'
import { serverConfig } from '../../lib/serverConfig'

interface SearchRequestBody {
  query?: string
  topK?: number
}

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as SearchRequestBody
          const query = body.query?.trim() ?? ''

          if (!query) {
            return json({ error: 'Query is required.' }, { status: 400 })
          }

          const topK =
            typeof body.topK === 'number'
              ? Math.max(1, Math.min(body.topK, serverConfig.maxTopK))
              : serverConfig.defaultTopK

          const results = await semanticSearch(query, topK)

          return json({
            query,
            topK,
            results,
          })
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Unexpected semantic search failure.'

          return json(
            {
              error: 'Failed to execute semantic search.',
              detail: message,
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
