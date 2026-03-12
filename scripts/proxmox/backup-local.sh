#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="$BACKUP_DIR/tgc-embedding-$TIMESTAMP.tar.gz"

if ! [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]]; then
  echo "KEEP_BACKUPS must be a non-negative integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

INCLUDE_PATHS=()
if [[ -d "$ROOT_DIR/chroma_data" ]]; then
  INCLUDE_PATHS+=("chroma_data")
fi
if [[ -d "$ROOT_DIR/crawl_state" ]]; then
  INCLUDE_PATHS+=("crawl_state")
fi

if [[ "${#INCLUDE_PATHS[@]}" -eq 0 ]]; then
  echo "Nothing to back up. Missing chroma_data and crawl_state." >&2
  exit 1
fi

echo "Creating backup archive: $ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C "$ROOT_DIR" "${INCLUDE_PATHS[@]}"
echo "Backup complete."

if (( KEEP_BACKUPS > 0 )); then
  mapfile -t old_files < <(ls -1t "$BACKUP_DIR"/tgc-embedding-*.tar.gz 2>/dev/null | awk "NR>${KEEP_BACKUPS}" || true)
  if [[ "${#old_files[@]}" -gt 0 ]]; then
    printf '%s\0' "${old_files[@]}" | xargs -0 rm -f
    echo "Removed ${#old_files[@]} old backup(s)."
  fi
fi

echo "Latest backup: $ARCHIVE_PATH"
