# TGC-Embedding

A vector database pipeline that reads a pre-generated sitemap, fetches each page,
extracts clean text, chunks it, generates OpenAI embeddings, and stores the result
in ChromaDB for semantic search and RAG workloads.

---

## Architecture

```
sitemap.txt
    │
    ▼
 fetcher.ts      ← axios (default) or Playwright headless browser + retry / back-off
    │
    ▼
 extractor.ts    ← cheerio: remove noise, prefer <main>/<article>
    │
    ▼
 chunker.ts      ← word-window chunks (500 words, 50 overlap)
    │
    ▼
 embedder.ts     ← OpenAI text-embedding-3-small (batched)
    │
    ▼
 store.ts        ← ChromaDB upsert (cosine space)
    │
    ▼
 processed.txt / stats.json
```

Concurrency is managed by **p-queue** (default 5 parallel URLs).  
Resumability is provided by **processed.txt** — already-embedded URLs are
skipped on restart.

---

## Prerequisites

> **This is a server-side CLI pipeline.** It runs entirely in Node.js and does
> **not** require a desktop, browser window, or display server.  You can run it
> on any Linux/macOS/Windows server, a CI runner, or inside a Docker container.

- Node.js ≥ 20
- An OpenAI API key with access to `text-embedding-3-small`
- A running ChromaDB instance **or** the default file-based persistence (no extra service needed when using `chromadb` in local/embedded mode)
- *(Optional, for JS-rendered pages)* Playwright Chromium binary — see [JS-rendered pages](#embed-javascript-rendered-pages) below

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create your .env from the example
cp .env.example .env
# Then edit .env and set OPENAI_API_KEY

# 3. Create the crawl_state directory and add your sitemap
mkdir -p crawl_state
# Place your URLs in crawl_state/sitemap.txt, one per line
```

---

## Usage

### Run the embedding pipeline

```bash
npm run embed
```

### Run with a fresh start (clears processed state and ChromaDB)

```bash
npm run embed:fresh
```

### Run the live monitor dashboard (separate terminal)

```bash
npm run monitor
```

---

### Embed JavaScript-rendered pages

If your site uses a JavaScript framework (React, Vue, Angular, Next.js with
client-side rendering, etc.) the default axios fetcher will only see the empty
HTML shell — not the rendered content.  Enable headless-browser mode:

```bash
# Install the Chromium binary (one-time setup)
npx playwright install chromium

# Set USE_BROWSER=true in your .env, then run normally
USE_BROWSER=true npm run embed
```

The pipeline will launch a single shared Chromium instance, navigate to each
URL, wait for network activity to settle, and then pass the fully-rendered HTML
to the extractor.  Everything downstream (chunking, embedding, storage) is
unchanged.

> **Performance note:** Headless-browser fetching is 5–10× slower than axios.
> Use it only for sites that genuinely require JS rendering.  For mixed
> workloads, run the pipeline twice — once with `USE_BROWSER=false` (fast pass)
> and once with `USE_BROWSER=true` (slow pass for any pages that yielded
> insufficient content).

> **Server note:** When `USE_BROWSER=true` the headless Chromium instance runs
> entirely in the background with no display required (`--headless`,
> `--no-sandbox`, `--disable-gpu`).  On a bare Linux server (Ubuntu/Debian) you
> may need to install Chromium's OS-level dependencies once:
> ```bash
> npx playwright install-deps chromium
> ```
> When using Docker (see below) these libraries are already present in the base
> image and no extra setup is needed.

---

### Running in Docker

A `Dockerfile` is included in the repo.  The image is based on
`mcr.microsoft.com/playwright` which ships with all Chromium system libraries
pre-installed, making it the easiest way to run the pipeline — with or without
`USE_BROWSER` — on any server or cloud environment.

```bash
# 1. Build the image
docker build -t tgc-embedding .

# 2. Create a local data directory with your sitemap
mkdir -p data/crawl_state
echo https://example.com/page1 > data/crawl_state/sitemap.txt

# 3. Run the pipeline (persistent state lives in ./data via the volume mount)
docker run --rm \
  --env-file .env \
  -v $(pwd)/data:/data \
  tgc-embedding
```

To enable JS-rendered page support inside the container just add
`-e USE_BROWSER=true` — no extra steps needed:

```bash
docker run --rm \
  --env-file .env \
  -e USE_BROWSER=true \
  -v $(pwd)/data:/data \
  tgc-embedding
```

---

## Configuration (`.env`)

| Variable          | Default          | Description                                      |
|-------------------|------------------|--------------------------------------------------|
| `OPENAI_API_KEY`  | **required**     | OpenAI API key                                   |
| `CHROMA_COLLECTION` | `tgc_site`     | ChromaDB collection name                         |
| `CHROMA_PATH`     | `./chroma_db`    | ChromaDB persistence directory                   |
| `WORK_DIR`        | `./crawl_state`  | Directory for sitemap.txt, processed.txt, etc.   |
| `CHUNK_SIZE`      | `500`            | Words per chunk                                  |
| `CHUNK_OVERLAP`   | `50`             | Overlapping words between consecutive chunks     |
| `CONCURRENCY`     | `5`              | Parallel URL workers                             |
| `MAX_RETRIES`     | `3`              | Retry attempts before marking a URL as failed    |
| `RETRY_DELAY_MS`  | `5000`           | Base retry delay (doubles each attempt)          |
| `REQUEST_DELAY_MS`| `500`            | Polite delay between page fetches                |
| `USE_BROWSER`     | `false`          | Use Playwright headless browser for JS-rendered pages |
| `BROWSER_TIMEOUT_MS` | `30000`       | Browser network-idle timeout in ms (USE_BROWSER only) |

---

## State files (`./crawl_state/`)

| File            | Purpose                                        |
|-----------------|------------------------------------------------|
| `sitemap.txt`   | **Input** — one URL per line                   |
| `processed.txt` | URLs successfully embedded (auto-appended)     |
| `failed.txt`    | URLs that failed all retries (with reason)     |
| `stats.json`    | Live counters written after every URL          |

---

## Project structure

```
src/
  shared/
    config.ts     — load & validate env vars
    logger.ts     — structured logger with timestamps
    state.ts      — read/write processed.txt, failed.txt, stats.json
  vectordb/
    index.ts      — orchestration entry point (p-queue loop)
    fetcher.ts    — axios HTTP fetch with retry/back-off
    extractor.ts  — cheerio HTML → clean text
    chunker.ts    — word-window chunking with overlap
    embedder.ts   — OpenAI embeddings (batched)
    store.ts      — ChromaDB upsert
  monitor/
    index.ts      — live terminal dashboard
```

---

## Build

```bash
npm run build   # compiles TypeScript to dist/
```