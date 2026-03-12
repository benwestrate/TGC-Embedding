#!/usr/bin/env bash
set -euo pipefail

# Restrict VM app exposure so only reverse-proxy LXC can reach search-ui.
#
# Usage:
#   sudo PROXY_LXC_IP=10.0.10.20 bash ./scripts/proxmox/configure-firewall.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

PROXY_LXC_IP="${PROXY_LXC_IP:-}"
APP_PORT="${APP_PORT:-3000}"
SSH_PORT="${SSH_PORT:-22}"

if [[ -z "${PROXY_LXC_IP}" ]]; then
  echo "Set PROXY_LXC_IP first, e.g. PROXY_LXC_IP=10.0.10.20" >&2
  exit 1
fi

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow from "${PROXY_LXC_IP}" to any port "${APP_PORT}" proto tcp
ufw --force enable

echo "Firewall updated:"
ufw status verbose
