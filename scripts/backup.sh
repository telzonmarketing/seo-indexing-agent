#!/usr/bin/env bash
# =============================================================================
# SEO OS — Daily Backup Script
# =============================================================================
# Backs up: PostgreSQL, Redis, seoos_data volume, Celery beat schedule
# Schedule: daily via cron (e.g., 02:00 AM server time)
# Storage:  /opt/seoos/backups  (outside containers, on host)
#
# Cron setup (run as root or deploy user):
#   0 2 * * * /opt/seoos/scripts/backup.sh >> /opt/seoos/backups/backup.log 2>&1
#
# Retention: 7 daily, 4 weekly (28 days max on disk)
# Restore:   See RESTORE section at bottom of this file
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_ROOT="${BACKUP_ROOT:-/opt/seoos/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/seoos/docker-compose.production.yml}"
PROJECT_DIR="${PROJECT_DIR:-/opt/seoos}"
RETENTION_DAILY=7      # keep 7 daily backups
RETENTION_WEEKLY=4     # keep 4 weekly backups (Mon)

DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)   # 1=Mon … 7=Sun
DAILY_DIR="${BACKUP_ROOT}/daily/${DATE}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [BACKUP]"

# ── Docker compose wrapper ────────────────────────────────────────────────────
DC="docker compose -f ${COMPOSE_FILE}"

# ── Helpers ───────────────────────────────────────────────────────────────────
log()  { echo "${LOG_PREFIX} $*"; }
fail() { echo "${LOG_PREFIX} ERROR: $*" >&2; exit 1; }

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────
require_cmd docker
require_cmd gzip
require_cmd tar

log "Starting SEO OS backup..."
mkdir -p "${DAILY_DIR}"

# ── 1. PostgreSQL dump ────────────────────────────────────────────────────────
log "Backing up PostgreSQL..."
PG_DUMP_FILE="${DAILY_DIR}/postgres_${DATE}.sql.gz"

if $DC ps postgres 2>/dev/null | grep -q "running\|Up"; then
    $DC exec -T postgres pg_dump \
        -U "${POSTGRES_USER:-seo}" \
        "${POSTGRES_DB:-seoos}" \
        | gzip > "${PG_DUMP_FILE}" \
        && log "  PostgreSQL → ${PG_DUMP_FILE} ($(du -sh "${PG_DUMP_FILE}" | cut -f1))" \
        || fail "pg_dump failed"
else
    # Fallback: use docker run with the same postgres image + volume mount
    log "  postgres container not running — using volume-direct dump"
    docker run --rm \
        --volumes-from "$(docker compose -f ${COMPOSE_FILE} ps -q postgres 2>/dev/null || echo '')" \
        -e PGPASSWORD="${POSTGRES_PASSWORD:-seopass}" \
        postgres:16-alpine \
        pg_dump -h localhost -U "${POSTGRES_USER:-seo}" "${POSTGRES_DB:-seoos}" \
        | gzip > "${PG_DUMP_FILE}" \
        && log "  PostgreSQL (volume-direct) → ${PG_DUMP_FILE}" \
        || log "  WARNING: PostgreSQL backup skipped (container not running)"
fi

# ── 2. Redis RDB snapshot ─────────────────────────────────────────────────────
log "Backing up Redis..."
REDIS_DUMP_FILE="${DAILY_DIR}/redis_${DATE}.rdb.gz"

if $DC ps redis 2>/dev/null | grep -q "running\|Up"; then
    # Trigger BGSAVE and wait for it to complete
    $DC exec -T redis redis-cli BGSAVE >/dev/null 2>&1 || true
    sleep 3  # give Redis time to write the RDB file

    # Copy RDB from container volume
    REDIS_CONTAINER=$($DC ps -q redis 2>/dev/null | head -1)
    if [ -n "${REDIS_CONTAINER}" ]; then
        docker cp "${REDIS_CONTAINER}:/data/dump.rdb" - \
            | gzip > "${REDIS_DUMP_FILE}" \
            && log "  Redis RDB → ${REDIS_DUMP_FILE} ($(du -sh "${REDIS_DUMP_FILE}" | cut -f1))" \
            || log "  WARNING: Redis RDB copy failed"
    fi
else
    log "  WARNING: Redis container not running — skipping Redis backup"
fi

# ── 3. seoos_data volume (client files, reports, exports) ─────────────────────
log "Backing up seoos_data volume..."
DATA_ARCHIVE="${DAILY_DIR}/seoos_data_${DATE}.tar.gz"

# Check if volume exists
if docker volume ls -q | grep -q "seoos_data"; then
    docker run --rm \
        -v seoos_data:/source:ro \
        -v "${DAILY_DIR}:/backup" \
        alpine:3.19 \
        tar czf "/backup/seoos_data_${DATE}.tar.gz" -C /source . \
        && log "  seoos_data → ${DATA_ARCHIVE} ($(du -sh "${DATA_ARCHIVE}" | cut -f1))" \
        || log "  WARNING: seoos_data archive failed"
else
    log "  INFO: seoos_data volume not found — skipping"
fi

# ── 4. Celery beat schedule ───────────────────────────────────────────────────
log "Backing up Celery beat schedule..."
BEAT_ARCHIVE="${DAILY_DIR}/celery_beat_${DATE}.tar.gz"

if docker volume ls -q | grep -q "celery_beat_data"; then
    docker run --rm \
        -v celery_beat_data:/source:ro \
        -v "${DAILY_DIR}:/backup" \
        alpine:3.19 \
        tar czf "/backup/celery_beat_${DATE}.tar.gz" -C /source . \
        && log "  celery_beat_data → ${BEAT_ARCHIVE}" \
        || log "  WARNING: celery_beat backup failed"
else
    log "  INFO: celery_beat_data volume not found — skipping"
fi

# ── 5. Qdrant vector data ─────────────────────────────────────────────────────
log "Backing up Qdrant vector store..."
QDRANT_ARCHIVE="${DAILY_DIR}/qdrant_${DATE}.tar.gz"

if docker volume ls -q | grep -q "qdrant_data"; then
    docker run --rm \
        -v qdrant_data:/source:ro \
        -v "${DAILY_DIR}:/backup" \
        alpine:3.19 \
        tar czf "/backup/qdrant_${DATE}.tar.gz" -C /source . \
        && log "  qdrant_data → ${QDRANT_ARCHIVE} ($(du -sh "${QDRANT_ARCHIVE}" | cut -f1))" \
        || log "  WARNING: qdrant backup failed"
else
    log "  INFO: qdrant_data volume not found — skipping"
fi

# ── 6. Nginx config + SSL certs reference ────────────────────────────────────
log "Backing up Nginx config..."
NGINX_ARCHIVE="${DAILY_DIR}/nginx_config_${DATE}.tar.gz"

if [ -d "${PROJECT_DIR}/nginx" ]; then
    tar czf "${NGINX_ARCHIVE}" -C "${PROJECT_DIR}" nginx/ \
        && log "  nginx/ → ${NGINX_ARCHIVE}" \
        || log "  WARNING: nginx config backup failed"
fi

# ── 7. Write backup manifest ──────────────────────────────────────────────────
MANIFEST="${DAILY_DIR}/MANIFEST.txt"
{
    echo "SEO OS Backup Manifest"
    echo "Generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    echo "Host: $(hostname)"
    echo ""
    echo "Files:"
    ls -lh "${DAILY_DIR}/" | awk '{print $NF, $5}'
    echo ""
    echo "Disk usage: $(du -sh "${DAILY_DIR}" | cut -f1)"
} > "${MANIFEST}"
log "Manifest → ${MANIFEST}"

# ── 8. Weekly backup copy (every Monday) ─────────────────────────────────────
if [ "${DAY_OF_WEEK}" = "1" ]; then
    WEEKLY_DIR="${BACKUP_ROOT}/weekly"
    mkdir -p "${WEEKLY_DIR}"
    WEEK_LABEL=$(date +%Y_W%V)
    cp -r "${DAILY_DIR}" "${WEEKLY_DIR}/${WEEK_LABEL}" \
        && log "Weekly copy → ${WEEKLY_DIR}/${WEEK_LABEL}" \
        || log "WARNING: weekly copy failed"

    # Prune old weekly backups
    ls -dt "${WEEKLY_DIR}"/*/  2>/dev/null \
        | tail -n +$((RETENTION_WEEKLY + 1)) \
        | xargs -r rm -rf \
        && log "Pruned weekly backups (kept last ${RETENTION_WEEKLY})"
fi

# ── 9. Prune old daily backups ────────────────────────────────────────────────
ls -dt "${BACKUP_ROOT}/daily"/*/  2>/dev/null \
    | tail -n +$((RETENTION_DAILY + 1)) \
    | xargs -r rm -rf \
    && log "Pruned daily backups (kept last ${RETENTION_DAILY})"

# ── 10. Summary ───────────────────────────────────────────────────────────────
TOTAL_SIZE=$(du -sh "${BACKUP_ROOT}" 2>/dev/null | cut -f1)
log "Backup complete. Total backup store: ${TOTAL_SIZE}"
log "Latest backup: ${DAILY_DIR}"

# ── Optional: Slack alert on completion ──────────────────────────────────────
if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
        -H 'Content-type: application/json' \
        -d "{\"text\":\"✅ SEO OS backup completed (${DATE}). Store size: ${TOTAL_SIZE}\"}" \
        >/dev/null 2>&1 || true
fi

exit 0

# =============================================================================
# RESTORE INSTRUCTIONS
# =============================================================================
#
# 1. Restore PostgreSQL:
#    gunzip -c /opt/seoos/backups/daily/YYYYMMDD_HHMMSS/postgres_*.sql.gz \
#      | docker compose -f docker-compose.production.yml exec -T postgres \
#          psql -U seo seoos
#
# 2. Restore Redis RDB:
#    docker compose -f docker-compose.production.yml stop redis
#    CONTAINER=$(docker compose -f docker-compose.production.yml run -d redis sleep 999)
#    gunzip -c /opt/seoos/backups/daily/YYYYMMDD_HHMMSS/redis_*.rdb.gz > /tmp/dump.rdb
#    docker cp /tmp/dump.rdb ${CONTAINER}:/data/dump.rdb
#    docker stop ${CONTAINER}
#    docker compose -f docker-compose.production.yml start redis
#
# 3. Restore seoos_data volume:
#    docker run --rm \
#      -v seoos_data:/dest \
#      -v /opt/seoos/backups/daily/YYYYMMDD_HHMMSS:/backup:ro \
#      alpine:3.19 \
#      tar xzf /backup/seoos_data_*.tar.gz -C /dest
#
# 4. Restore Qdrant:
#    docker compose -f docker-compose.production.yml stop qdrant
#    docker run --rm \
#      -v qdrant_data:/dest \
#      -v /opt/seoos/backups/daily/YYYYMMDD_HHMMSS:/backup:ro \
#      alpine:3.19 \
#      sh -c "rm -rf /dest/* && tar xzf /backup/qdrant_*.tar.gz -C /dest"
#    docker compose -f docker-compose.production.yml start qdrant
# =============================================================================
