#!/usr/bin/env bash
# Deploy Wallnut to the production VPS (git pull + docker rebuild).
#
# Usage (from repo root):
#   ./deploy/vps-deploy.sh
#
# Optional overrides:
#   WALLNUT_VPS_HOST=root@153.92.211.187
#   WALLNUT_VPS_SSH_KEY=~/.ssh/wallnut_vps
#   WALLNUT_VPS_APP_DIR=/opt/wallnut
#   WALLNUT_PUBLIC_URL=https://wallnut.usama.fun
set -euo pipefail

VPS_HOST="${WALLNUT_VPS_HOST:-root@153.92.211.187}"
SSH_KEY="${WALLNUT_VPS_SSH_KEY:-$HOME/.ssh/wallnut_vps}"
APP_DIR="${WALLNUT_VPS_APP_DIR:-/opt/wallnut}"
PUBLIC_URL="${WALLNUT_PUBLIC_URL:-https://wallnut.usama.fun}"

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  echo "Set WALLNUT_VPS_SSH_KEY or add the deploy key to this machine." >&2
  exit 1
fi

SSH_OPTS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15)

echo "==> Deploying to $VPS_HOST ($PUBLIC_URL)"

ssh "${SSH_OPTS[@]}" "$VPS_HOST" bash -s <<EOS
set -euo pipefail
cd "$APP_DIR"

echo "==> stash local edits (if any)"
git stash push -u -m "vps-pre-deploy-\$(date +%Y%m%d-%H%M%S)" || true

echo "==> pull latest main"
git pull --ff-only origin main
git log --oneline -1

ENV="$APP_DIR/deploy/.env"
for key in PUBLIC_URL NEXT_PUBLIC_APP_URL; do
  if grep -q "^\${key}=" "\$ENV"; then
    sed -i "s|^\${key}=.*|\${key}=$PUBLIC_URL|" "\$ENV"
  else
    echo "\${key}=$PUBLIC_URL" >> "\$ENV"
  fi
done

echo "==> rebuild containers"
cd "$APP_DIR/deploy"
docker compose up -d --build
docker compose ps --format '{{.Service}}\t{{.State}}\t{{.Status}}'

echo "==> health check"
sleep 5
curl -s -o /dev/null -w 'app local=%{http_code}\n' http://127.0.0.1:3000/
EOS

echo "==> done — $PUBLIC_URL"
