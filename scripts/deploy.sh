#!/usr/bin/env bash
# =============================================================================
# SEO OS — Production Deploy Script
# =============================================================================
# Run this on the Hostinger VPS to deploy or update SEO OS.
#
# FIRST TIME SETUP:
#   git clone <repo> /opt/seoos
#   cd /opt/seoos
#   cp .env.production .env          # fill in POSTGRES_PASSWORD
#   cp backend/.env.production backend/.env   # fill in all secrets
#   bash scripts/deploy.sh
#
# SUBSEQUENT UPDATES (after git pull):
#   cd /opt/seoos && git pull && bash scripts/deploy.sh
#
# OPTIONS:
#   --skip-migrate   Skip schema sync/create_all (tables already up to date)
#   --skip-build     Skip docker build (use existing images)
#   --full-restart   Force full stop + start (vs. rolling update)
#   --check-only     Run healthcheck only, no deployment
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.production.yml"
LOG_FILE="${PROJECT_DIR}/logs/deploy_$(date +%Y%m%d_%H%M%S).log"

# ── Flags ─────────────────────────────────────────────────────────────────────
SKIP_MIGRATE=false
SKIP_BUILD=false
FULL_RESTART=false
CHECK_ONLY=false

for arg in "$@"; do
    case "${arg}" in
        --skip-migrate)  SKIP_MIGRATE=true ;;
        --skip-build)    SKIP_BUILD=true ;;
        --full-restart)  FULL_RESTART=true ;;
        --check-only)    CHECK_ONLY=true ;;
        *) echo "Unknown option: ${arg}"; exit 1 ;;
    esac
done

DC="docker compose -f ${COMPOSE_FILE}"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

log()     { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $*" | tee -a "${LOG_FILE}"; }
ok()      { echo -e "${GREEN}  ✓${NC} $*" | tee -a "${LOG_FILE}"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*" | tee -a "${LOG_FILE}"; }
fail()    { echo -e "${RED}  ✗ ERROR:${NC} $*" | tee -a "${LOG_FILE}"; exit 1; }
section() { echo -e "\n${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "${LOG_FILE}"; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
mkdir -p "${PROJECT_DIR}/logs"

if [ "${CHECK_ONLY}" = "true" ]; then
    log "Check-only mode — running healthcheck..."
    exec bash "${SCRIPT_DIR}/healthcheck.sh"
fi

echo -e "${BOLD}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║      SEO OS Production Deployment         ║"
echo "  ║      $(date '+%Y-%m-%d %H:%M:%S %Z')         ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

log "Deploy log: ${LOG_FILE}"
cd "${PROJECT_DIR}"

# ── Step 1: Prerequisite checks ───────────────────────────────────────────────
section "Prerequisites"

command -v docker >/dev/null 2>&1 || fail "Docker not installed"
ok "Docker: $(docker --version | head -1)"

docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 not installed"
ok "Docker Compose: $(docker compose version --short)"

[ -f "${COMPOSE_FILE}" ] || fail "Compose file not found: ${COMPOSE_FILE}"
ok "Compose file: ${COMPOSE_FILE}"

[ -f "${PROJECT_DIR}/.env" ] || fail "Root .env missing. cp .env.production .env and fill in values."
ok "Root .env: present"

[ -f "${PROJECT_DIR}/backend/.env" ] || fail "backend/.env missing. cp backend/.env.production backend/.env and fill in values."
ok "backend/.env: present"

# Warn if any CHANGE_ME values remain
if grep -q "CHANGE_ME" "${PROJECT_DIR}/.env" 2>/dev/null || \
   grep -q "CHANGE_ME" "${PROJECT_DIR}/backend/.env" 2>/dev/null; then
    warn "CHANGE_ME placeholders still present in .env files!"
    warn "Please fill in all secrets before deploying to production."
    echo ""
    read -r -p "  Continue anyway? (y/N): " CONFIRM
    [[ "${CONFIRM}" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# ── Step 2: Take a backup before deploying ────────────────────────────────────
section "Pre-Deploy Backup"

if $DC ps postgres 2>/dev/null | grep -qE "Up|running"; then
    log "Running pre-deploy backup..."
    if bash "${SCRIPT_DIR}/backup.sh" 2>&1 | tee -a "${LOG_FILE}"; then
        ok "Pre-deploy backup complete"
    else
        warn "Backup failed — proceeding anyway (check ${SCRIPT_DIR}/backup.sh)"
    fi
else
    log "PostgreSQL not running — skipping pre-deploy backup (first deploy?)"
fi

# ── Step 3: Pull latest images / build ────────────────────────────────────────
section "Build"

if [ "${SKIP_BUILD}" = "false" ]; then
    log "Building Docker images..."
    $DC build --parallel 2>&1 | tee -a "${LOG_FILE}" || fail "Docker build failed"
    ok "Images built"
else
    warn "Skipping build (--skip-build)"
fi

# ── Step 4: Start infrastructure first ────────────────────────────────────────
section "Infrastructure"

log "Starting PostgreSQL, Redis, Qdrant..."
$DC up -d postgres redis qdrant 2>&1 | tee -a "${LOG_FILE}"

log "Waiting for PostgreSQL to be healthy..."
WAITED=0
MAX_WAIT=60
until $DC exec -T postgres pg_isready -U "${POSTGRES_USER:-seo}" -d "${POSTGRES_DB:-seoos}" >/dev/null 2>&1; do
    if [ "${WAITED}" -ge "${MAX_WAIT}" ]; then
        fail "PostgreSQL did not become healthy within ${MAX_WAIT}s"
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done
ok "PostgreSQL: healthy (waited ${WAITED}s)"

log "Waiting for Redis..."
WAITED=0
until $DC exec -T redis redis-cli ping >/dev/null 2>&1; do
    if [ "${WAITED}" -ge 30 ]; then
        fail "Redis did not respond within 30s"
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done
ok "Redis: healthy (waited ${WAITED}s)"

# ── Step 5: Schema sync (SQLAlchemy create_all) ────────────────────────────────
section "Schema Sync"

# The app uses SQLAlchemy Base.metadata.create_all (not Alembic).
# Tables are created/updated automatically on API startup via init_db().
# We run a one-shot API container here to trigger schema sync BEFORE
# traffic hits the main api service.

if [ "${SKIP_MIGRATE}" = "false" ]; then
    log "Running schema sync (create_all via init_db)..."
    $DC run --rm --no-deps \
        -e DATABASE_URL \
        -e DATABASE_URL_SYNC \
        api \
        python -c "
import asyncio
from app.database import init_db
asyncio.run(init_db())
print('Schema sync complete')
" 2>&1 | tee -a "${LOG_FILE}" \
        && ok "Schema sync complete (all tables created/verified)" \
        || warn "Schema sync had errors — check logs above (tables may already exist)"
else
    warn "Skipping schema sync (--skip-migrate)"
fi

# ── Step 6: Deploy application services ───────────────────────────────────────
section "Application Deploy"

if [ "${FULL_RESTART}" = "true" ]; then
    log "Full restart: stopping all app services..."
    $DC stop api worker beat frontend 2>/dev/null || true
fi

log "Starting API..."
$DC up -d api 2>&1 | tee -a "${LOG_FILE}"
sleep 5

# Quick API health check
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://127.0.0.1:8000/api/health" 2>/dev/null || echo "000")
if [ "${API_STATUS}" = "200" ]; then
    ok "API: responding (HTTP 200)"
else
    warn "API: got HTTP ${API_STATUS} — may still be starting"
fi

log "Starting Celery worker..."
$DC up -d worker 2>&1 | tee -a "${LOG_FILE}"

log "Starting Celery beat..."
$DC up -d beat 2>&1 | tee -a "${LOG_FILE}"

log "Starting Frontend..."
$DC up -d frontend 2>&1 | tee -a "${LOG_FILE}"
sleep 5

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "http://127.0.0.1:3000/" 2>/dev/null || echo "000")
if [ "${FRONTEND_STATUS}" = "200" ]; then
    ok "Frontend: responding (HTTP 200)"
else
    warn "Frontend: got HTTP ${FRONTEND_STATUS} — may still be starting"
fi

# ── Step 7: Nginx reload ──────────────────────────────────────────────────────
section "Nginx"

if command -v nginx >/dev/null 2>&1; then
    if nginx -t 2>&1 | tee -a "${LOG_FILE}"; then
        systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
        ok "Nginx: config valid, reloaded"
    else
        warn "Nginx config test failed — skipping reload"
    fi
else
    warn "Nginx not found on host — skipping reload"
fi

# ── Step 8: Setup backup cron (first deploy only) ─────────────────────────────
section "Backup Cron"

CRON_ENTRY="0 2 * * * BACKUP_ROOT=/opt/seoos/backups COMPOSE_FILE=${COMPOSE_FILE} PROJECT_DIR=${PROJECT_DIR} bash ${SCRIPT_DIR}/backup.sh >> /opt/seoos/logs/backup.log 2>&1"
if ! crontab -l 2>/dev/null | grep -q "backup.sh"; then
    (crontab -l 2>/dev/null; echo "${CRON_ENTRY}") | crontab -
    ok "Backup cron installed (daily at 02:00)"
else
    ok "Backup cron already installed"
fi

# ── Step 9: Post-deploy health check ─────────────────────────────────────────
section "Health Check"

log "Waiting 10s for services to settle..."
sleep 10

COMPOSE_FILE="${COMPOSE_FILE}" API_BASE="http://127.0.0.1:8000" FRONTEND_BASE="http://127.0.0.1:3000" \
    bash "${SCRIPT_DIR}/healthcheck.sh" 2>&1 | tee -a "${LOG_FILE}" \
    && HEALTH_OK=true || HEALTH_OK=false

# ── Final summary ─────────────────────────────────────────────────────────────
section "Deploy Complete"

echo ""
$DC ps
echo ""

if [ "${HEALTH_OK}" = "true" ]; then
    echo -e "${GREEN}${BOLD}"
    echo "  ✅ Deployment successful!"
    echo "     Frontend: https://admin.telzonmarketing.in"
    echo "     API:      https://api.telzonmarketing.in"
    echo "     API Docs: https://api.telzonmarketing.in/docs"
    echo -e "${NC}"
else
    echo -e "${YELLOW}${BOLD}"
    echo "  ⚠️  Deployment done with warnings — check healthcheck output above."
    echo "     Log file: ${LOG_FILE}"
    echo -e "${NC}"
fi

log "Deploy finished at $(date '+%Y-%m-%d %H:%M:%S')"
