#!/usr/bin/env bash
# Wallnut one-shot VPS bootstrap (Ubuntu/Debian).
# Run as root ON the VPS after DNS points your subdomain at this server:
#   bash setup-vps.sh
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: bash setup-vps.sh <subdomain.usama.fun>"; exit 1
fi

echo "==> Installing Docker + git"
apt-get update -qq
apt-get install -yqq ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -qq && apt-get install -yqq docker-ce docker-ce-cli containerd.io docker-compose-plugin

systemctl enable --now docker

APP_DIR="/opt/wallnut"
echo "==> Cloning repo to $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone https://github.com/usama453/wallnut.git "$APP_DIR"
fi

cd "$APP_DIR/deploy"

echo "==> Writing env (edit $APP_DIR/deploy/.env if needed)"
if [[ ! -f .env ]]; then
  sed "s/bot\.usama\.fun/$DOMAIN/" .env.vps.example > .env
  echo "!! Fill in secrets now: nano .env   (Supabase keys, GEMINI_API_KEY, WAHA_API_KEY)"
fi

# Keep Caddyfile domain in sync with the requested domain
sed -i "s/^bot\.usama\.fun/$DOMAIN/" Caddyfile

echo "==> Firewall: allow ssh/http/https"
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80,443/tcp >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

echo "==> Building + starting stack"
docker compose up -d --build

cat <<EOF

=========================================================
 Stack is up.

 1. Edit secrets:      nano $APP_DIR/deploy/.env    (then: docker compose up -d)
 2. Pair WhatsApp:     curl -s -X POST http://127.0.0.1:3001/api/default/auth/request-code \\
         -H "X-Api-Key: \$(grep '^WAHA_API_KEY' .env | cut -d= -f2)" \\
         -H 'Content-Type: application/json' \\
         -d '{"phoneNumber": "<countrycode+number>"}'
    Enter the code on the phone within ~20 seconds.
 3. Check status:      curl http://127.0.0.1:3001/api/sessions/default -H "X-Api-Key: ..."
 4. App logs:          docker compose logs -f app
 5. Bridge logs:       docker compose logs -f bridge
=========================================================
EOF
