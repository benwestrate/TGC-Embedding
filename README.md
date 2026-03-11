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

### Test / dry-run flags

Two flags let you validate the pipeline without spending API credits or
modifying persistent state.

#### `DRY_RUN` — fetch and extract without embedding or storing

```bash
# One-off dry run (reads your .env, no API calls made)
DRY_RUN=true npm run embed

# Convenience shortcut — dry run of the first 3 pending URLs
npm run embed:dry
```

In dry-run mode the pipeline still fetches every page, extracts clean text,
and produces chunks — only the OpenAI embedding API call and the ChromaDB
upsert are skipped.  `processed.txt` and `failed.txt` are **not** updated,
so re-running in normal mode afterwards will still process every URL.

Useful for:
- Verifying that your sitemap URLs are reachable
- Checking that the extractor produces meaningful text
- Confirming chunk counts before committing to a full run

#### `LIMIT` — process only the first N pending URLs

```bash
# Process only the first 10 pending URLs (full embed, real API calls)
LIMIT=10 npm run embed

# Combine with DRY_RUN for a completely free smoke-test
DRY_RUN=true LIMIT=5 npm run embed
```

`LIMIT=0` (the default) means no limit — all pending URLs are processed.

#### `URL_INCLUDE` / `URL_EXCLUDE` — filter URLs before processing

The pipeline can filter sitemap URLs by substring match before it checks
`processed.txt` and schedules work.

- **Default scope** (`URL_INCLUDE` unset): only content URLs are processed:
  `/article/`, `/podcasts/`, `/sermon/`, `/essay/`, `/blogs/`
- **Include rule**: URL must match at least one value in `URL_INCLUDE`
- **Exclude rule**: URL is skipped if it matches any value in `URL_EXCLUDE`
- **Order**: include first, then exclude

```bash
# Default content scope (already in .env.example)
URL_INCLUDE=/article/,/podcasts/,/sermon/,/essay/,/blogs/

# Optional exclusions
URL_EXCLUDE=/profile/,/feed
```

Set `URL_INCLUDE=` (empty) to disable include filtering and allow all sitemap
URLs (subject to `URL_EXCLUDE`).

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

### Run Chroma with Docker Compose

This repo includes a `docker-compose.yml` for ChromaDB with persistent storage.

```bash
# Start Chroma in the background (data stored in ./chroma_data)
docker compose up -d

# Verify Chroma is healthy
curl http://localhost:8000/api/v2/heartbeat

# Stop Chroma
docker compose down
```

The compose setup persists Chroma data directly in this repo at `./chroma_data`.

### Backup job (Chroma + crawl state)

Use the built-in backup job to archive `./chroma_data` and `./crawl_state`:

```bash
# Run backup with default retention (keep 14 archives)
npm run backup

# Stop Chroma before backup for a consistent snapshot
npm run backup -- --stop-chroma

# Keep only the latest 30 backups
npm run backup -- --keep 30
```

Backups are saved to `./backups` as `tgc-embedding-YYYYMMDD-HHMMSS.tar.gz`.
After each backup, the job also runs an rsync update from this repo to:
`/Volumes/Personal-Drive/TGC/TGC-Embedding/`.

Use these options when needed:

```bash
# Skip rsync for this run
npm run backup -- --no-rsync

# Override rsync destination
npm run backup -- --rsync-dest "/Volumes/Personal-Drive/TGC/TGC-Embedding/"
```

---

## Configuration (`.env`)

| Variable          | Default          | Description                                      |
|-------------------|------------------|--------------------------------------------------|
| `OPENAI_API_KEY`  | **required**     | OpenAI API key                                   |
| `CHROMA_COLLECTION` | `tgc_site`     | ChromaDB collection name                         |
| `CHROMA_PATH`     | `http://localhost:8000` | ChromaDB server endpoint URL (recommended)  |
| `WORK_DIR`        | `./crawl_state`  | Directory for sitemap.txt, processed.txt, etc.   |
| `CHUNK_SIZE`      | `500`            | Words per chunk                                  |
| `CHUNK_OVERLAP`   | `50`             | Overlapping words between consecutive chunks     |
| `CONCURRENCY`     | `5`              | Parallel URL workers                             |
| `MAX_RETRIES`     | `3`              | Retry attempts before marking a URL as failed    |
| `RETRY_DELAY_MS`  | `5000`           | Base retry delay (doubles each attempt)          |
| `REQUEST_DELAY_MS`| `500`            | Polite delay between page fetches                |
| `USE_BROWSER`     | `false`          | Use Playwright headless browser for JS-rendered pages |
| `BROWSER_TIMEOUT_MS` | `30000`       | Browser network-idle timeout in ms (USE_BROWSER only) |
| `URL_INCLUDE`     | `/article/,/podcasts/,/sermon/,/essay/,/blogs/` | Comma-separated include patterns (substring match); unset defaults to content URL types |
| `URL_EXCLUDE`     | *(empty)*        | Comma-separated exclude patterns (substring match) |
| `DRY_RUN`         | `false`          | Skip OpenAI + ChromaDB; fetch/extract/chunk only (no state written) |
| `LIMIT`           | `0`              | Max pending URLs per run (`0` = unlimited)            |

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