## TGC Semantic Search UI

TanStack Start app for querying the TGC Chroma collection with semantic search.

### Local development

From the repo root:

```bash
npm run dev
```

Or from this app directory:

```bash
npm run dev
```

### Build and preview

```bash
npm run build
npm run preview
```

### Required environment variables

- `OPENAI_API_KEY` (required)
- `CHROMA_PATH` (default: `http://localhost:8000`)
- `CHROMA_COLLECTION` (default: `tgc_site`)
- `SEARCH_TOP_K` (default: `8`)
- `SEARCH_MAX_TOP_K` (default: `20`)

The app loads `.env` from:

- repo root (`../../.env` from this folder)
- app-local (`./.env`)

### API contract

`POST /api/search`

Request:

```json
{ "query": "your question", "topK": 8 }
```

Response:

```json
{
  "query": "your question",
  "topK": 8,
  "results": [
    {
      "id": "https://...::2",
      "title": "Article title",
      "url": "https://...",
      "snippet": "Chunk text...",
      "subtitle": "Optional",
      "chunkIndex": 2,
      "score": 0.82
    }
  ]
}
```

### Useful scripts

```bash
npm run lint
npm run format
npm run check
npm run test
```
