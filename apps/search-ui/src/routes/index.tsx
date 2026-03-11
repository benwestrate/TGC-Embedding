import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

export const Route = createFileRoute('/')({ component: App })

interface SearchResultItem {
  id: string
  title: string
  url: string
  summary: string
  author?: string
  publishedAt?: string
  subtitle?: string
}

interface SearchResponse {
  query: string
  topK: number
  results: SearchResultItem[]
  error?: string
  detail?: string
}

function App() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResultItem[]>([])

  const hasResults = results.length > 0
  const emptyStateText = useMemo(() => {
    if (submittedQuery && !isLoading && !hasResults) {
      return 'No matching chunks found in the current collection.'
    }
    return 'Run a semantic search to find matching chunks from embedded content.'
  }, [hasResults, isLoading, submittedQuery])

  function formatPublishedDate(dateValue?: string): string | null {
    if (!dateValue) return null
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setError('Please enter a search query.')
      setResults([])
      setSubmittedQuery('')
      return
    }

    setIsLoading(true)
    setError(null)
    setSubmittedQuery(trimmedQuery)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmedQuery }),
      })

      const payload = (await response.json()) as SearchResponse
      if (!response.ok) {
        throw new Error(payload.error || payload.detail || 'Search request failed.')
      }

      setResults(payload.results)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load search results.'
      setError(message)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="page-wrap px-4 pb-12 pt-10">
      <section className="rise-in rounded-2xl border border-[var(--line)] bg-[var(--surface-strong)] px-6 py-8 sm:px-8">
        <p className="search-label mb-3">Search Our Resources</p>
        <h1 className="display-title mb-3 text-4xl font-semibold text-[var(--sea-ink)] sm:text-5xl">
          The Gospel Coalition Content Search
        </h1>
        <p className="mb-7 max-w-3xl text-base leading-7 text-[var(--sea-ink-soft)]">
          Search across embedded articles and content with semantic relevance.
        </p>

        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What does TGC say about suffering and hope?"
            className="w-full rounded-md border border-[var(--line)] bg-white px-4 py-3 text-[var(--sea-ink)] outline-none ring-[var(--accent)] placeholder:text-[var(--sea-ink-soft)] focus:ring-2"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold tracking-wide text-white uppercase whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-xl border border-[rgba(168,56,56,0.35)] bg-[rgba(168,56,56,0.12)] px-3 py-2 text-sm text-[rgb(129,42,42)] dark:text-[rgb(248,189,189)]">
            {error}
          </p>
        ) : null}
      </section>

      <section className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--sea-ink)]">Articles</h2>
          {submittedQuery ? (
            <span className="text-sm text-[var(--sea-ink-soft)]">
              Query: <strong>{submittedQuery}</strong>
            </span>
          ) : null}
        </div>

        {!isLoading && !hasResults ? (
          <article className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-5 text-sm text-[var(--sea-ink-soft)]">
            {emptyStateText}
          </article>
        ) : null}

        {results.map((result) => (
          <article
            key={result.id}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] p-6"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs tracking-wide text-[var(--sea-ink-soft)] uppercase">
              {result.author ? <span>By {result.author}</span> : null}
              {result.author && formatPublishedDate(result.publishedAt) ? (
                <span aria-hidden="true">|</span>
              ) : null}
              {formatPublishedDate(result.publishedAt) ? (
                <span>{formatPublishedDate(result.publishedAt)}</span>
              ) : null}
            </div>

            <h3 className="display-title m-0 text-3xl leading-tight font-semibold text-[var(--sea-ink)]">
              <a href={result.url} target="_blank" rel="noreferrer">
                {result.title}
              </a>
            </h3>
            {result.subtitle ? (
              <p className="mt-2 text-sm italic text-[var(--sea-ink-soft)]">
                {result.subtitle}
              </p>
            ) : null}

            <p className="mt-4 mb-0 text-base leading-7 text-[var(--sea-ink-soft)]">
              {result.summary}
            </p>
          </article>
        ))}
      </section>
    </main>
  )
}
