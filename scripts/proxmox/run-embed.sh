#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/proxmox/docker-compose.proxmox.yml"
ENV_FILE="$ROOT_DIR/deploy/proxmox/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

echo "Ensuring Chroma is running..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d chroma

echo "Running embed job..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile embed run --rm embed
