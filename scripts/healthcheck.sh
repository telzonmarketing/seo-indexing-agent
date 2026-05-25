#!/usr/bin/env bash
# =============================================================================
# SEO OS — Post-Deploy Health Check Script
# =============================================================================
# Run this after every deployment to verify all systems are operational.
# Usage:
#   chmod +x scripts/healthcheck.sh
#   ./scripts/healthcheck.sh                        # default: production
#   COMPOSE_FILE=docker-compose.yml ./scripts/healthcheck.sh   # dev override
#   API_BASE=https://api.telzonmarketing.in ./scripts/healthcheck.sh
#
# Exit codes:
#   0 = all checks passed
#   1 = one or more checks failed
# =============================================================================

set -uo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
COMPOSE_FILE="${COMPOSE_FILE:-/opt/seoos/docker-compose.production.yml}"
API_BASE="${API_BASE:-http://127.0.0.1:8000}"
FRONTEND_BASE="${FRONTEND_BASE:-http://127.0.0.1:3000}"
TIMEOUT="${TIMEOUT:-10}"     # seconds per HTTP check
MAX_WAIT="${MAX_WAIT:-120}"  # seconds to wait for containers to become healthy

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

DC="docker compose -f ${COMPOSE_FILE}"
PASS=0
FAIL=0
WARN=0
FAILURES=()

# ── Helpers ───────────────────────────────────────────────────────────────────
ok()   { echo -e "${GREEN}  ✓${NC} $*"; ((PASS++)) || true; }
fail() { echo -e "${RED}  ✗${NC} $*"; ((FAIL++)) || true; FAILURES+=("$*"); }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; ((WARN++)) || true; }
info() { echo -e "${BLUE}  →${NC} $*"; }
section() { echo -e "\n${BOLD}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

http_check() {
    local label="$1"
    local url="$2"
    local expected_code="${3:-200}"
    local grep_body="${4:-}"

    local response
    response=$(curl -s -o /tmp/hc_body -w "%{http_code}" \
        --max-time "${TIMEOUT}" \
        --insecure \
        "${url}" 2>/dev/null) || response="000"

    if [ "${response}" = "${expected_code}" ]; then
        if [ -n "${grep_body}" ]; then
            if grep -q "${grep_body}" /tmp/hc_body 2>/dev/null; then
                ok "${label} (${response})"
            else
                fail "${label} — body missing '${grep_body}' (${url})"
            fi
        else
            ok "${label} (${response})"
        fi
    else
        fail "${label} — expected ${expected_code}, got ${response} (${url})"
    fi
}

# ── 1. Container status ───────────────────────────────────────────────────────
section "Container Status"

REQUIRED_SERVICES=(postgres redis qdrant api worker beat frontend)
for svc in "${REQUIRED_SERVICES[@]}"; do
    STATE=$($DC ps --format json 2>/dev/null \
        | python3 -c "
import sys, json
for line in sys.stdin:
    try:
        d = json.loads(line)
        if d.get('Service') == '${svc}':
            print(d.get('State','unknown'))
            break
    except: pass
" 2>/dev/null || echo "unknown")

    STATUS=$($DC ps 2>/dev/null | grep -E "^[^_]+_${svc}_|_${svc}-" | awk '{print $NF}' | head -1 || echo "")

    if $DC ps 2>/dev/null | grep -E "${svc}" | grep -qE "Up|running|healthy"; then
        ok "Container: ${svc} (running)"
    else
        fail "Container: ${svc} (not running)"
    fi
done

# ── 2. Docker healthchecks ────────────────────────────────────────────────────
section "Docker Healthchecks"

for svc in postgres redis; do
    HEALTH=$($DC ps 2>/dev/null | grep "${svc}" | grep -oE "healthy|unhealthy|starting" | head -1 || echo "unknown")
    case "${HEALTH}" in
        healthy)   ok "${svc} healthcheck: healthy" ;;
        starting)  warn "${svc} healthcheck: still starting (may need more time)" ;;
        unhealthy) fail "${svc} healthcheck: UNHEALTHY" ;;
        *)         warn "${svc} healthcheck: status unknown" ;;
    esac
done

# ── 3. API health endpoints ───────────────────────────────────────────────────
section "API Health Endpoints"

http_check "GET /api/health"              "${API_BASE}/api/health"              "200" '"status"'
http_check "GET /api/health/db"           "${API_BASE}/api/health/db"           "200" '"database"'
http_check "GET /api/health/redis"        "${API_BASE}/api/health/redis"        "200" '"redis"'
http_check "GET /api/health/workers"      "${API_BASE}/api/health/workers"      "200"
http_check "GET /api/health/prometheus"   "${API_BASE}/api/health/prometheus"   "200" "cpu_percent"
http_check "GET /api/health/system (401)" "${API_BASE}/api/health/system"       "401"

# ── 4. Core API routes (unauthenticated = 401, not 500) ──────────────────────
section "Core API Routes (expect 401 — unauthenticated)"

http_check "GET /api/clients"          "${API_BASE}/api/clients"          "401"
http_check "GET /api/websites"         "${API_BASE}/api/websites"         "401"
http_check "GET /api/crawls"           "${API_BASE}/api/crawls"           "401"
http_check "GET /api/keywords"         "${API_BASE}/api/keywords"         "401"
http_check "GET /api/activity"         "${API_BASE}/api/activity"         "401"
http_check "GET /api/orchestrator"     "${API_BASE}/api/orchestrator"     "401"
http_check "GET /api/automation-rules" "${API_BASE}/api/automation-rules" "401"
http_check "GET /api/mission-control"  "${API_BASE}/api/mission-control"  "401"

# ── 5. Auth endpoint (405 on GET, not 500) ────────────────────────────────────
section "Auth Endpoint"

http_check "POST /api/auth/login (expect 422)" \
    "${API_BASE}/api/auth/login" "422"   # no body → unprocessable entity

# ── 6. Frontend ───────────────────────────────────────────────────────────────
section "Frontend"

http_check "GET / (Next.js)" "${FRONTEND_BASE}/" "200"
http_check "GET /_next/static check" "${FRONTEND_BASE}/_next/static" "404"  # 404 is fine — proves Next.js is serving

# ── 7. Database connectivity ──────────────────────────────────────────────────
section "Database Connectivity"

DB_RESULT=$($DC exec -T postgres \
    psql -U "${POSTGRES_USER:-seo}" -d "${POSTGRES_DB:-seoos}" \
    -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" \
    -t -A 2>/dev/null || echo "ERROR")

if echo "${DB_RESULT}" | grep -qE '^[0-9]+$'; then
    TABLE_COUNT=$(echo "${DB_RESULT}" | tr -d '[:space:]')
    if [ "${TABLE_COUNT}" -gt 5 ]; then
        ok "PostgreSQL: ${TABLE_COUNT} tables found (migrations applied)"
    else
        warn "PostgreSQL: only ${TABLE_COUNT} tables — migrations may be incomplete"
    fi
else
    fail "PostgreSQL: cannot connect or query"
fi

# ── 8. Redis connectivity + queue depth ──────────────────────────────────────
section "Redis & Queue"

REDIS_PONG=$($DC exec -T redis redis-cli ping 2>/dev/null || echo "ERROR")
if echo "${REDIS_PONG}" | grep -q "PONG"; then
    ok "Redis: responding to PING"
else
    fail "Redis: no PONG response"
fi

QUEUE_DEPTH=$($DC exec -T redis redis-cli llen celery 2>/dev/null | tr -d '[:space:]' || echo "?")
if [ "${QUEUE_DEPTH}" = "?" ]; then
    warn "Redis: could not read queue depth"
elif [ "${QUEUE_DEPTH:-0}" -gt 100 ]; then
    warn "Celery queue depth: ${QUEUE_DEPTH} tasks backlogged (check worker)"
else
    ok "Celery queue depth: ${QUEUE_DEPTH} tasks"
fi

REDIS_PERSISTENCE=$($DC exec -T redis redis-cli config get appendonly 2>/dev/null | grep -c "yes" || echo "0")
if [ "${REDIS_PERSISTENCE}" -gt 0 ]; then
    ok "Redis AOF persistence: enabled"
else
    warn "Redis AOF persistence: not enabled (data loss risk on restart)"
fi

# ── 9. Celery workers ─────────────────────────────────────────────────────────
section "Celery Workers"

WORKER_RESPONSE=$($DC exec -T worker \
    celery -A app.tasks.celery_app.celery inspect ping --timeout=5 2>/dev/null || echo "ERROR")

if echo "${WORKER_RESPONSE}" | grep -q "pong"; then
    ok "Celery worker: responding to ping"
else
    warn "Celery worker: no ping response (may still be starting)"
fi

BEAT_PID=$($DC exec -T beat sh -c "cat /var/celery/celerybeat.pid 2>/dev/null || echo ''" 2>/dev/null || echo "")
if [ -n "${BEAT_PID}" ]; then
    ok "Celery beat: running (PID ${BEAT_PID})"
else
    warn "Celery beat: PID file not found (may still be starting)"
fi

# ── 10. Disk space ───────────────────────────────────────────────────────────
section "Disk Space"

DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "${DISK_USAGE:-0}" -lt 70 ]; then
    ok "Disk usage: ${DISK_USAGE}% (healthy)"
elif [ "${DISK_USAGE:-0}" -lt 85 ]; then
    warn "Disk usage: ${DISK_USAGE}% (getting full — consider cleanup)"
else
    fail "Disk usage: ${DISK_USAGE}% (CRITICAL — nearly full)"
fi

BACKUP_DISK=$(df /opt/seoos/backups 2>/dev/null | awk 'NR==2 {print $5}' | tr -d '%' || echo "N/A")
if [ "${BACKUP_DISK}" != "N/A" ]; then
    info "Backup volume disk: ${BACKUP_DISK}%"
fi

# ── 11. Memory ───────────────────────────────────────────────────────────────
section "Memory"

FREE_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo "0")
TOTAL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "0")
if [ "${TOTAL_MB}" -gt 0 ]; then
    USED_PCT=$(( (TOTAL_MB - FREE_MB) * 100 / TOTAL_MB ))
    if [ "${USED_PCT}" -lt 80 ]; then
        ok "Memory: ${USED_PCT}% used (${FREE_MB}MB free of ${TOTAL_MB}MB)"
    elif [ "${USED_PCT}" -lt 90 ]; then
        warn "Memory: ${USED_PCT}% used — low on RAM"
    else
        fail "Memory: ${USED_PCT}% used — CRITICAL"
    fi
fi

# ── 12. SSL certificates (if running on VPS) ─────────────────────────────────
section "SSL Certificates"

for domain in admin.telzonmarketing.in api.telzonmarketing.in; do
    CERT_EXPIRY=$(echo | timeout 5 openssl s_client \
        -connect "${domain}:443" \
        -servername "${domain}" 2>/dev/null \
        | openssl x509 -noout -enddate 2>/dev/null \
        | cut -d= -f2 || echo "")

    if [ -z "${CERT_EXPIRY}" ]; then
        warn "SSL ${domain}: cannot check (DNS not resolving or no internet)"
    else
        DAYS_LEFT=$(( ($(date -d "${CERT_EXPIRY}" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "${CERT_EXPIRY}" +%s 2>/dev/null || echo 0) - $(date +%s)) / 86400 ))
        if [ "${DAYS_LEFT:-0}" -gt 30 ]; then
            ok "SSL ${domain}: valid for ${DAYS_LEFT} days"
        elif [ "${DAYS_LEFT:-0}" -gt 0 ]; then
            warn "SSL ${domain}: expires in ${DAYS_LEFT} days — renew soon"
        else
            fail "SSL ${domain}: EXPIRED or cannot check"
        fi
    fi
done

# ── 13. Ollama (host service) ─────────────────────────────────────────────────
section "Ollama (Host AI)"

OLLAMA_RESPONSE=$(curl -s --max-time 5 "http://localhost:11434/api/tags" 2>/dev/null || echo "")
if echo "${OLLAMA_RESPONSE}" | grep -q "models"; then
    MODEL_COUNT=$(echo "${OLLAMA_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('models',[])))" 2>/dev/null || echo "?")
    ok "Ollama: running with ${MODEL_COUNT} model(s)"
else
    warn "Ollama: not responding — AI features will be degraded"
fi

# ── 14. Log volume check ──────────────────────────────────────────────────────
section "Recent Error Logs"

API_ERRORS=$($DC logs api --since=1h 2>/dev/null | grep -c "ERROR\|CRITICAL\|Exception" || echo "0")
WORKER_ERRORS=$($DC logs worker --since=1h 2>/dev/null | grep -c "ERROR\|CRITICAL\|Exception" || echo "0")

if [ "${API_ERRORS:-0}" -eq 0 ]; then
    ok "API logs: no errors in last hour"
elif [ "${API_ERRORS:-0}" -lt 10 ]; then
    warn "API logs: ${API_ERRORS} errors in last hour"
else
    fail "API logs: ${API_ERRORS} errors in last hour (investigate)"
fi

if [ "${WORKER_ERRORS:-0}" -eq 0 ]; then
    ok "Worker logs: no errors in last hour"
elif [ "${WORKER_ERRORS:-0}" -lt 10 ]; then
    warn "Worker logs: ${WORKER_ERRORS} errors in last hour"
else
    fail "Worker logs: ${WORKER_ERRORS} errors in last hour (investigate)"
fi

# ── Final summary ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━ Health Check Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}Passed:${NC}  ${PASS}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
echo -e "  ${RED}Failed:${NC}  ${FAIL}"

if [ ${#FAILURES[@]} -gt 0 ]; then
    echo ""
    echo -e "${RED}${BOLD}Failures:${NC}"
    for f in "${FAILURES[@]}"; do
        echo -e "  ${RED}•${NC} ${f}"
    done
fi

echo ""
if [ "${FAIL}" -eq 0 ] && [ "${WARN}" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✅ All systems operational.${NC}"
    exit 0
elif [ "${FAIL}" -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠️  System operational with ${WARN} warning(s). Review above.${NC}"
    exit 0
else
    echo -e "${RED}${BOLD}❌ ${FAIL} check(s) FAILED. See above for details.${NC}"
    exit 1
fi
