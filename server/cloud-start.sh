#!/bin/sh
# Lëtz Cloud – Start auf einem gemieteten GPU-Rechner (Hugging Face Jobs, RunPod, jede Linux-Maschine mit NVIDIA).
# Holt das Spiel von GitHub, baut es, startet den Streaming-Server und öffnet einen öffentlichen HTTPS-Link
# (Cloudflare Quick Tunnel, ohne Konto). Der Link erscheint im Protokoll als  >>> SPIELEN: https://….trycloudflare.com
#
# Empfohlenes Image: mcr.microsoft.com/playwright:v1.63.0-noble  (Node + Chromium bereits dabei)
# Umgebung (optional): REPO, BRANCH, VIEW_W, VIEW_H, FPS, QUALITY, PW_VERSION
set -e
REPO=${REPO:-https://github.com/gillesfischbach-business1/open-world-game}
BRANCH=${BRANCH:-main}
PW_VERSION=${PW_VERSION:-1.63.0}
export NVIDIA_DRIVER_CAPABILITIES=${NVIDIA_DRIVER_CAPABILITIES:-all}
cd /tmp
echo "[Start] Grafikkarte:"; nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>/dev/null || echo "  keine NVIDIA-Karte sichtbar – Spiel läuft dann in Software (langsam)"
command -v git >/dev/null || (apt-get update -qq && apt-get install -y -qq git curl >/dev/null)
rm -rf letz && git clone -q --depth 1 -b "$BRANCH" "$REPO" letz && cd letz
echo "[Start] Spiel bauen …"; npm ci --no-audit --no-fund --loglevel=error && npx vite build --logLevel error
cd server && npm install --no-audit --no-fund --loglevel=error ws "playwright@$PW_VERSION"
node -e "require('playwright').chromium.executablePath()" >/dev/null 2>&1 && [ -x "$(node -e "console.log(require('playwright').chromium.executablePath())")" ] || npx playwright install --with-deps chromium
curl -sL -o /tmp/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x /tmp/cloudflared
PORT=7860 node server.mjs &
SRV=$!
# öffentlicher Link
( /tmp/cloudflared tunnel --no-autoupdate --url http://localhost:7860 2>&1 | while read -r l; do u=$(echo "$l" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com'); [ -n "$u" ] && echo ">>> SPIELEN: $u"; done ) &
# Statuszeile jede Minute (Bildrate, Auflösung, Spieler)
( while sleep 60; do echo "[Status] $(curl -s localhost:7860/status | head -c 300)"; done ) &
wait $SRV
