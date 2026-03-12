#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCHIVE_PATH="${1:-}"
DRY_RUN="${DRY_RUN:-false}"

if [[ -z "$ARCHIVE_PATH" ]]; then
  echo "Usage: bash ./scripts/proxmox/restore-backup.sh <backup.tar.gz>" >&2
  exit 1
fi

if [[ ! -f "$ARCHIVE_PATH" ]]; then
  echo "Backup archive not found: $ARCHIVE_PATH" >&2
  exit 1
fi

echo "Inspecting archive:"
tar -tzf "$ARCHIVE_PATH" | awk 'NR<=20 {print} NR==21 {print "..."}'

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY_RUN=true set; no files restored."
  exit 0
fi

echo "Stopping stack before restore..."
docker compose -f "$ROOT_DIR/deploy/proxmox/docker-compose.proxmox.yml" \
  --env-file "$ROOT_DIR/deploy/proxmox/.env.production" down

echo "Restoring archive to repo root..."
tar -xzf "$ARCHIVE_PATH" -C "$ROOT_DIR"

echo "Starting stack..."
bash "$ROOT_DIR/scripts/proxmox/deploy.sh"

echo "Restore complete."
