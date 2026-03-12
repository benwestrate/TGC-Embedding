# Reverse Proxy LXC Upstream Setup

This VM does not terminate TLS. Your existing reverse-proxy LXC handles public
HTTPS and forwards to the app VM on `10.0.10.3:3000`.

## 1) Set upstream target

- Upstream host: `10.0.10.3`
- Upstream port: `3000`
- Protocol: `http`
- Health endpoint: `/`

## 2) Forward headers

Ensure these headers are passed to preserve client context:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto`
- `X-Real-IP`

## 3) Firewall rule on app VM

Allow only the reverse-proxy LXC IP to connect:

```bash
sudo PROXY_LXC_IP=<proxy-lxc-ip> bash ./scripts/proxmox/configure-firewall.sh
```

## 4) Chroma exposure rule

Do not expose Chroma publicly. In this stack it stays internal-only in Docker
network and is reachable from `search-ui` / `embed` services only.

## 5) Example Nginx upstream snippet (if proxy LXC runs Nginx)

```nginx
location / {
  proxy_pass http://10.0.10.3:3000;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
