#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/proxmox/docker-compose.proxmox.yml"
ENV_FILE="$ROOT_DIR/deploy/proxmox/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Create it from deploy/proxmox/.env.production.example first." >&2
  exit 1
fi

echo "Updating repository..."
git -C "$ROOT_DIR" pull --ff-only

echo "Building and starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build chroma search-ui

echo "Waiting for health checks..."
for _ in {1..30}; do
  UI_HEALTH="$(docker inspect --format='{{.State.Health.Status}}' tgc-search-ui 2>/dev/null || true)"
  CHROMA_HEALTH="$(docker inspect --format='{{.State.Health.Status}}' tgc-chroma 2>/dev/null || true)"
  if [[ "$UI_HEALTH" == "healthy" && "$CHROMA_HEALTH" == "healthy" ]]; then
    echo "Services are healthy."
    echo "Search UI: http://$(hostname -I | awk '{print $1}'):3000"
    exit 0
  fi
  sleep 2
done

echo "Timed out waiting for healthy services." >&2
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
exit 1
