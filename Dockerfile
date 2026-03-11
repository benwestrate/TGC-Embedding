# ── Build stage ──────────────────────────────────────────────────────────────
# Use the official Playwright image as the base so that all Chromium OS-level
# system libraries (libglib, libnss, libatk, libcups, libdrm, …) are already
# present.  This is the recommended approach for running Playwright in a
# server / container environment — no desktop or display server (X11/Wayland)
# is required.
#
# The variant pinned here matches the playwright version declared in
# package.json (^1.58.2).  Update the tag when you bump the package.
FROM mcr.microsoft.com/playwright:v1.58.2-jammy AS base

WORKDIR /app

# ── Install Node dependencies ─────────────────────────────────────────────────
COPY package*.json ./
# ci installs exact locked versions; omit devDependencies in production
RUN npm ci --omit=dev

# ── Copy source and compile TypeScript ───────────────────────────────────────
# devDependencies (tsc, ts-node, @types/*) are needed only at compile time.
# Install them in a separate layer so the final image stays lean.
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Final runtime image ───────────────────────────────────────────────────────
FROM base AS runtime

# Copy compiled JS from the builder stage
COPY --from=builder /app/dist ./dist

# Default environment — override at runtime via -e / --env-file
ENV NODE_ENV=production \
    WORK_DIR=/data/crawl_state \
    CHROMA_PATH=/data/chroma_db

# Mount point for persistent state (sitemap, processed list, ChromaDB)
VOLUME ["/data"]

# The pipeline is a one-shot CLI process, not a long-running server.
# Run it with:  docker run --env-file .env -v $(pwd)/data:/data tgc-embedding
CMD ["node", "dist/vectordb/index.js"]
