#!/bin/bash
# =============================================================================
# Point-in-Time Recovery (PITR) Backup Script
# Issue: #PITR
#
# Creates a base backup and enables WAL archiving for PITR.
# Backups are stored locally and optionally uploaded to S3.
#
# Usage:
#   ./scripts/backup-db.sh [base|wal-archive|status]
#
# Environment Variables:
#   DATABASE_URL          - PostgreSQL connection string
#   BACKUP_STORAGE_PATH   - Local path for backups (default: /var/backups/nova/pitr)
#   BACKUP_S3_BUCKET      - Optional S3 bucket for offsite backups
#   BACKUP_RETENTION_DAYS - Days to keep base backups (default: 7)
#   PGDATA                - PostgreSQL data directory (default: /var/lib/postgresql/data)
# =============================================================================
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
BACKUP_STORAGE_PATH="${BACKUP_STORAGE_PATH:-/var/backups/nova/pitr}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BASE_BACKUP_DIR="${BACKUP_STORAGE_PATH}/base"
WAL_ARCHIVE_DIR="${BACKUP_STORAGE_PATH}/wal"
LOG_FILE="${BACKUP_STORAGE_PATH}/pitr-backup.log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()     { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [INFO]  $*"; echo -e "${BLUE}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
success() { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [OK]    $*"; echo -e "${GREEN}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
warn()    { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [WARN]  $*"; echo -e "${YELLOW}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
error()   { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [ERROR] $*"; echo -e "${RED}${msg}${NC}" >&2; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────
parse_db_url() {
  local url="${DATABASE_URL:-postgresql://nova_user:nova_password@localhost:5432/nova_launch}"
  DB_USER=$(echo "$url" | sed -E 's|postgresql://([^:]+):.*|\1|')
  DB_PASS=$(echo "$url" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  DB_HOST=$(echo "$url" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
  DB_PORT=$(echo "$url" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_NAME=$(echo "$url" | sed -E 's|.*/([^?]+).*|\1|')
}

ensure_dirs() {
  mkdir -p "$BASE_BACKUP_DIR" "$WAL_ARCHIVE_DIR"
}

# ── Base backup via pg_basebackup ─────────────────────────────────────────────
# Creates a full filesystem-level backup that serves as the starting point
# for PITR. WAL files applied on top of this allow recovery to any point.
cmd_base() {
  log "Starting PITR base backup: ${TIMESTAMP}"

  local dest="${BASE_BACKUP_DIR}/${TIMESTAMP}"
  mkdir -p "$dest"

  PGPASSWORD="$DB_PASS" pg_basebackup \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -D "$dest" \
    --format=tar \
    --gzip \
    --compress=9 \
    --wal-method=stream \
    --checkpoint=fast \
    --label="nova-pitr-${TIMESTAMP}" \
    --progress \
    --verbose 2>&1 | tee -a "$LOG_FILE"

  # Write metadata alongside the backup
  cat > "${dest}/backup_label.json" <<EOF
{
  "backup_label": "nova-pitr-${TIMESTAMP}",
  "timestamp": "${TIMESTAMP}",
  "db_host": "${DB_HOST}",
  "db_port": "${DB_PORT}",
  "db_name": "${DB_NAME}",
  "db_user": "${DB_USER}",
  "wal_method": "stream",
  "pgdata": "${PGDATA}"
}
EOF

  local size
  size=$(du -sh "$dest" | cut -f1)
  success "Base backup complete: ${dest} (${size})"

  # Upload to S3 if configured
  if [[ -n "$BACKUP_S3_BUCKET" ]] && command -v aws &>/dev/null; then
    log "Uploading base backup to S3..."
    aws s3 sync "$dest" "s3://${BACKUP_S3_BUCKET}/pitr/base/${TIMESTAMP}/" \
      --storage-class STANDARD_IA
    success "Uploaded to s3://${BACKUP_S3_BUCKET}/pitr/base/${TIMESTAMP}/"
  fi

  prune_old_base_backups
}

# ── WAL archive command ───────────────────────────────────────────────────────
# Called by PostgreSQL's archive_command for each completed WAL segment.
# Usage: ./backup-db.sh wal-archive <wal_file_path> <wal_file_name>
#
# Configure PostgreSQL with:
#   archive_mode = on
#   archive_command = '/path/to/backup-db.sh wal-archive %p %f'
cmd_wal_archive() {
  local wal_path="${1:-}"
  local wal_name="${2:-}"

  if [[ -z "$wal_path" || -z "$wal_name" ]]; then
    error "Usage: $0 wal-archive <wal_path> <wal_name>"
    exit 1
  fi

  local dest="${WAL_ARCHIVE_DIR}/${wal_name}"

  # Idempotent: skip if already archived
  if [[ -f "$dest" ]]; then
    log "WAL already archived: ${wal_name}"
    exit 0
  fi

  cp "$wal_path" "$dest"
  success "WAL archived: ${wal_name}"

  # Upload WAL to S3 if configured
  if [[ -n "$BACKUP_S3_BUCKET" ]] && command -v aws &>/dev/null; then
    aws s3 cp "$dest" "s3://${BACKUP_S3_BUCKET}/pitr/wal/${wal_name}" \
      --storage-class STANDARD_IA --quiet
  fi
}

# ── Status ────────────────────────────────────────────────────────────────────
cmd_status() {
  log "PITR backup status"
  echo ""

  echo "=== Base Backups ==="
  local count=0
  for d in "${BASE_BACKUP_DIR}"/*/; do
    [[ -d "$d" ]] || continue
    local name size
    name=$(basename "$d")
    size=$(du -sh "$d" | cut -f1)
    echo "  ${name}  (${size})"
    ((count++))
  done
  [[ $count -eq 0 ]] && echo "  (none)"

  echo ""
  echo "=== WAL Archive ==="
  local wal_count
  wal_count=$(find "$WAL_ARCHIVE_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
  local wal_size
  wal_size=$(du -sh "$WAL_ARCHIVE_DIR" 2>/dev/null | cut -f1 || echo "0")
  echo "  Segments: ${wal_count}  Total size: ${wal_size}"

  echo ""
  echo "=== PostgreSQL WAL Settings ==="
  PGPASSWORD="$DB_PASS" psql \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    -c "SELECT name, setting FROM pg_settings WHERE name IN ('wal_level','archive_mode','archive_command','max_wal_senders');" \
    2>/dev/null || warn "Could not query PostgreSQL settings (is the server running?)"
}

# ── Prune old base backups ────────────────────────────────────────────────────
prune_old_base_backups() {
  log "Pruning base backups older than ${BACKUP_RETENTION_DAYS} days..."
  find "$BASE_BACKUP_DIR" -maxdepth 1 -mindepth 1 -type d \
    -mtime "+${BACKUP_RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true
  success "Pruning complete"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  local command="${1:-base}"
  parse_db_url
  ensure_dirs

  case "$command" in
    base)         cmd_base ;;
    wal-archive)  cmd_wal_archive "${2:-}" "${3:-}" ;;
    status)       cmd_status ;;
    *)
      error "Unknown command: ${command}. Use: base | wal-archive | status"
      exit 1
      ;;
  esac
}

main "$@"
