#!/usr/bin/env bash
set -euo pipefail

# Bootstrap an Ubuntu VM for TGC-Embedding on Proxmox.
# - Installs Docker Engine + Compose plugin + Git
# - Enables Docker service
# - Applies a minimal UFW policy suitable for reverse-proxy LXC upstreaming
#
# Usage:
#   sudo PROXY_LXC_IP=10.0.10.20 bash ./scripts/proxmox/provision-vm.sh

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (use sudo)." >&2
  exit 1
fi

PROXY_LXC_IP="${PROXY_LXC_IP:-}"
SSH_PORT="${SSH_PORT:-22}"
APP_PORT="${APP_PORT:-3000}"

echo "Installing base packages..."
apt-get update
apt-get install -y ca-certificates curl gnupg lsb-release ufw git

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker repository..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  ARCH="$(dpkg --print-architecture)"
  CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo \
    "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "Enabling Docker service..."
systemctl enable --now docker

echo "Configuring firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"

if [[ -n "${PROXY_LXC_IP}" ]]; then
  ufw allow from "${PROXY_LXC_IP}" to any port "${APP_PORT}" proto tcp
  echo "Allowed app port ${APP_PORT}/tcp only from proxy LXC ${PROXY_LXC_IP}."
else
  echo "PROXY_LXC_IP not set; allowing ${APP_PORT}/tcp from local subnet."
  ufw allow from 10.0.0.0/8 to any port "${APP_PORT}" proto tcp
fi

ufw --force enable

echo
echo "Provisioning complete."
echo "- Docker: $(docker --version)"
echo "- Compose: $(docker compose version)"
echo "- Git: $(git --version)"
echo "- UFW status:"
ufw status verbose
