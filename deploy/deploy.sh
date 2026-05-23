#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SEO OS — Deploy / Update script
# Run on your VPS after server-setup.sh
# Usage: bash deploy.sh [--domain yourdomain.com] [--no-ssl]
# ═══════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${BLUE}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

APP_DIR="/opt/seoos"
DOMAIN=""
NO_SSL=false

# Parse args
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift ;;
    --no-ssl) NO_SSL=true ;;
    *) warn "Unknown option: $1" ;;
  esac
  shift
done

echo ""
echo "═══════════════════════════════════════════"
echo "  SEO OS — Deployment"
echo "  App dir: $APP_DIR"
[ -n "$DOMAIN" ] && echo "  Domain:  $DOMAIN"
echo "═══════════════════════════════════════════"
echo ""

# ── Check app directory ───────────────────────────────────────────
[ ! -d "$APP_DIR" ] && err "App directory $APP_DIR not found. Run server-setup.sh first."
[ ! -f "$APP_DIR/docker-compose.production.yml" ] && err "docker-compose.production.yml not found in $APP_DIR"

cd "$APP_DIR"

# ── Check .env ────────────────────────────────────────────────────
if [ ! -f "backend/.env" ]; then
  if [ -f "backend/.env.example" ]; then
    warn "backend/.env not found — copying from example"
    cp backend/.env.example backend/.env
    warn "Edit backend/.env before proceeding: nano backend/.env"
    exit 1
  else
    err "backend/.env missing"
  fi
fi

# ── Pull AI model if needed ───────────────────────────────────────
RAM_GB=$(awk '/MemTotal/ {print int($2/1024/1024)}' /proc/meminfo)
if [ "$RAM_GB" -le 4 ]; then
  MODEL="llama3.2:3b"
elif [ "$RAM_GB" -le 8 ]; then
  MODEL="deepseek-r1:8b"
else
  MODEL="deepseek-r1:14b"
fi

CONFIGURED_MODEL=$(grep "OLLAMA_MODEL=" backend/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
if [ -n "$CONFIGURED_MODEL" ]; then
  MODEL="$CONFIGURED_MODEL"
fi

info "Checking Ollama model: $MODEL"
if ! ollama list 2>/dev/null | grep -q "$MODEL"; then
  info "Pulling $MODEL (this may take a few minutes)..."
  ollama pull "$MODEL"
  log "Model $MODEL ready"
else
  log "Model $MODEL already downloaded"
fi

if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
  info "Pulling nomic-embed-text (embeddings)..."
  ollama pull nomic-embed-text
fi

# ── Build & Start containers ──────────────────────────────────────
info "Building Docker images..."
docker compose -f docker-compose.production.yml build --no-cache

info "Stopping old containers..."
docker compose -f docker-compose.production.yml down --remove-orphans || true

info "Starting services..."
docker compose -f docker-compose.production.yml up -d

log "Waiting for services to be healthy..."
sleep 15

# ── Create admin user (first deploy only) ─────────────────────────
if ! docker compose -f docker-compose.production.yml exec -T api \
  python -c "from app.database import AsyncSessionLocal; print('ok')" 2>/dev/null | grep -q "ok"; then
  warn "API not responding yet — skipping admin creation"
else
  info "Creating admin user (if not exists)..."
  docker compose -f docker-compose.production.yml exec -T api python -c "
import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password

async def main():
    async with AsyncSessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == 'admin@agency.com'))
        if not existing:
            u = User(email='admin@agency.com', name='Admin', hashed_password=hash_password('changeme123!'), role=UserRole.admin)
            db.add(u)
            await db.commit()
            print('Admin created: admin@agency.com / changeme123!')
        else:
            print('Admin already exists')

asyncio.run(main())
" 2>/dev/null || warn "Could not create admin user — create manually after startup"
fi

# ── Nginx setup ───────────────────────────────────────────────────
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

if [ -n "$DOMAIN" ]; then
  info "Configuring Nginx for domain: $DOMAIN"
  cat > /etc/nginx/sites-available/seoos << NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        client_max_body_size 50M;
    }

    # API docs
    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
        proxy_set_header Host \$host;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/seoos /etc/nginx/sites-enabled/seoos
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  log "Nginx configured for $DOMAIN"

  if [ "$NO_SSL" = false ]; then
    info "Setting up SSL certificate..."
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
      --non-interactive --agree-tos \
      --email "admin@${DOMAIN}" \
      --redirect || warn "SSL setup failed — you can run: certbot --nginx -d $DOMAIN"
    log "SSL configured"
  fi

else
  # IP-only: simple proxy
  info "Configuring Nginx (IP-only, no domain)..."
  cat > /etc/nginx/sites-available/seoos << NGINX
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
        client_max_body_size 50M;
    }

    location /docs {
        proxy_pass http://127.0.0.1:8000/docs;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/seoos /etc/nginx/sites-enabled/seoos
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  log "Nginx configured"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo -e "  ${GREEN}Deployment complete!${NC}"
echo "═══════════════════════════════════════════"
echo ""
if [ -n "$DOMAIN" ]; then
  if [ "$NO_SSL" = false ]; then
    echo "  Dashboard: https://$DOMAIN"
    echo "  API Docs:  https://$DOMAIN/docs"
  else
    echo "  Dashboard: http://$DOMAIN"
    echo "  API Docs:  http://$DOMAIN/docs"
  fi
else
  echo "  Dashboard: http://$SERVER_IP"
  echo "  API Docs:  http://$SERVER_IP/docs"
fi
echo ""
echo "  Login: admin@agency.com / changeme123!"
echo -e "  ${YELLOW}→ Change password after first login!${NC}"
echo ""
echo "  Useful commands:"
echo "  docker compose -f docker-compose.production.yml logs -f api"
echo "  docker compose -f docker-compose.production.yml ps"
echo ""
