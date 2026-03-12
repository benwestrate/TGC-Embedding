# Proxmox VM Deployment Runbook

This runbook deploys TGC-Embedding on a Proxmox Ubuntu VM (`10.0.10.3`) behind
your separate reverse-proxy LXC.

## 1) First-time VM setup

On the VM after cloning this repo:

```bash
sudo PROXY_LXC_IP=<proxy-lxc-ip> bash ./scripts/proxmox/provision-vm.sh
```

Create production env file:

```bash
cp deploy/proxmox/.env.production.example deploy/proxmox/.env.production
```

Edit secrets and runtime values in `deploy/proxmox/.env.production`.

## 2) First deploy

```bash
bash ./scripts/proxmox/deploy.sh
```

This command:
- pulls the latest code with `git pull --ff-only`
- builds containers
- starts `chroma` + `search-ui`
- waits for health checks

## 3) Run/update embed job on demand

```bash
bash ./scripts/proxmox/run-embed.sh
```

Use this any time you update `crawl_state/sitemap.txt` and want to ingest.

## 4) Routine app update

```bash
bash ./scripts/proxmox/deploy.sh
```

## 5) Roll back to previous release/commit

```bash
bash ./scripts/proxmox/rollback.sh <git-ref>
```

Examples:

```bash
bash ./scripts/proxmox/rollback.sh v1.0.0
bash ./scripts/proxmox/rollback.sh 1a2b3c4
```

## 6) Reverse-proxy LXC routing

Use these upstream details in your proxy LXC:
- upstream: `http://10.0.10.3:3000`
- health path: `/`
- pass forwarded headers (`Host`, `X-Forwarded-For`, `X-Forwarded-Proto`)

Reference: `deploy/proxmox/reverse-proxy-upstreams.md`.

## 7) Scheduled backups

Manual backup:

```bash
bash ./scripts/proxmox/backup-local.sh
```

Install nightly systemd timer:

```bash
sudo cp deploy/proxmox/systemd/tgc-backup.service /etc/systemd/system/
sudo cp deploy/proxmox/systemd/tgc-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tgc-backup.timer
sudo systemctl list-timers | rg tgc-backup
```

## 8) Restore drill (validation)

Dry-run validation (lists archive contents, no write):

```bash
DRY_RUN=true bash ./scripts/proxmox/restore-backup.sh ./backups/<archive-name>.tar.gz
```

Real restore:

```bash
bash ./scripts/proxmox/restore-backup.sh ./backups/<archive-name>.tar.gz
```
