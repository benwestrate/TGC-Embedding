#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE_PATH="$BACKUP_DIR/tgc-embedding-$TIMESTAMP.tar.gz"
KEEP_BACKUPS="${KEEP_BACKUPS:-14}"
STOP_CHROMA="${STOP_CHROMA:-false}"
RUN_RSYNC="${RUN_RSYNC:-true}"
RSYNC_DEST="${RSYNC_DEST:-/Volumes/Personal-Drive/TGC/TGC-Embedding/}"

print_help() {
  cat <<'EOF'
Create a timestamped backup archive for Chroma data and crawl state.

Usage:
  ./scripts/backup.sh [--stop-chroma] [--keep N] [--output-dir PATH] [--no-rsync] [--rsync-dest PATH]

Options:
  --stop-chroma        Stop "chroma" compose service before backup and restart it after.
  --keep N             Keep newest N backup archives (default: 14).
  --output-dir PATH    Directory for backup archives (default: ./backups).
  --no-rsync           Skip rsync replication to external destination.
  --rsync-dest PATH    Rsync destination (default: /Volumes/Personal-Drive/TGC/TGC-Embedding/).
  -h, --help           Show this help.

Environment overrides:
  STOP_CHROMA=true|false
  KEEP_BACKUPS=<N>
  BACKUP_DIR=<PATH>
  RUN_RSYNC=true|false
  RSYNC_DEST=<PATH>
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stop-chroma)
      STOP_CHROMA=true
      shift
      ;;
    --keep)
      KEEP_BACKUPS="${2:-}"
      shift 2
      ;;
    --output-dir)
      BACKUP_DIR="${2:-}"
      shift 2
      ;;
    --no-rsync)
      RUN_RSYNC=false
      shift
      ;;
    --rsync-dest)
      RSYNC_DEST="${2:-}"
      shift 2
      ;;
    -h|--help)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      print_help
      exit 1
      ;;
  esac
done

if ! [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]]; then
  echo "KEEP_BACKUPS must be a non-negative integer, got: $KEEP_BACKUPS" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required but not installed." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

CHROMA_WAS_RUNNING=false
if [[ "$STOP_CHROMA" == "true" ]]; then
  if docker compose -f "$ROOT_DIR/docker-compose.yml" ps --services --filter "status=running" | rg -x "chroma" >/dev/null 2>&1; then
    CHROMA_WAS_RUNNING=true
    echo "Stopping Chroma service for a consistent snapshot..."
    docker compose -f "$ROOT_DIR/docker-compose.yml" stop chroma
  fi
fi

restore_chroma() {
  if [[ "$STOP_CHROMA" == "true" && "$CHROMA_WAS_RUNNING" == "true" ]]; then
    echo "Restarting Chroma service..."
    docker compose -f "$ROOT_DIR/docker-compose.yml" start chroma
  fi
}
trap restore_chroma EXIT

INCLUDE_PATHS=()
if [[ -d "$ROOT_DIR/chroma_data" ]]; then
  INCLUDE_PATHS+=("chroma_data")
fi
if [[ -d "$ROOT_DIR/crawl_state" ]]; then
  INCLUDE_PATHS+=("crawl_state")
fi

if [[ "${#INCLUDE_PATHS[@]}" -eq 0 ]]; then
  echo "Nothing to back up: missing ./chroma_data and ./crawl_state" >&2
  exit 1
fi

echo "Creating backup archive: $ARCHIVE_PATH"
tar -czf "$ARCHIVE_PATH" -C "$ROOT_DIR" "${INCLUDE_PATHS[@]}"
echo "Backup complete."

if (( KEEP_BACKUPS > 0 )); then
  echo "Applying retention policy: keep latest $KEEP_BACKUPS backups"
  mapfile -t old_files < <(ls -1t "$BACKUP_DIR"/tgc-embedding-*.tar.gz 2>/dev/null | tail -n "+$((KEEP_BACKUPS + 1))" || true)
  if [[ "${#old_files[@]}" -gt 0 ]]; then
    printf '%s\0' "${old_files[@]}" | xargs -0 rm -f
    echo "Removed ${#old_files[@]} old backup(s)."
  fi
fi

echo "Latest backup: $ARCHIVE_PATH"

if [[ "$RUN_RSYNC" == "true" ]]; then
  if [[ ! -d "$(dirname "$RSYNC_DEST")" ]]; then
    echo "Rsync destination parent is not available: $(dirname "$RSYNC_DEST")" >&2
    exit 1
  fi
  mkdir -p "$RSYNC_DEST"
  echo "Running rsync to: $RSYNC_DEST"
  rsync -av --update "$ROOT_DIR/" "$RSYNC_DEST"
  echo "Rsync complete."
fi
