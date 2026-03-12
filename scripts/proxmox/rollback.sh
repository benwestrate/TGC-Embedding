#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_REF="${1:-}"

if [[ -z "$TARGET_REF" ]]; then
  echo "Usage: bash ./scripts/proxmox/rollback.sh <git-ref>" >&2
  echo "Example: bash ./scripts/proxmox/rollback.sh v1.2.0" >&2
  exit 1
fi

echo "Fetching refs..."
git -C "$ROOT_DIR" fetch --all --tags --prune

echo "Checking out $TARGET_REF..."
git -C "$ROOT_DIR" checkout "$TARGET_REF"

echo "Deploying rollback target..."
bash "$ROOT_DIR/scripts/proxmox/deploy.sh"
