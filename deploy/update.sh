#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SEO OS — Pull latest code and redeploy
# Run on VPS whenever you push updates: bash update.sh
# ═══════════════════════════════════════════════════════════════

set -e
APP_DIR="/opt/seoos"
cd "$APP_DIR"

echo "[→] Pulling latest code..."
git pull

echo "[→] Rebuilding images..."
docker compose -f docker-compose.production.yml build

echo "[→] Restarting services..."
docker compose -f docker-compose.production.yml up -d --remove-orphans

echo "[✓] Update complete"
docker compose -f docker-compose.production.yml ps
