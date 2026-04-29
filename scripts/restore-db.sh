#!/bin/bash
# =============================================================================
# Point-in-Time Recovery (PITR) Restore Script
# Issue: #PITR
#
# Restores a PostgreSQL database to a specific point in time using a base
# backup and WAL archive produced by backup-db.sh.
#
# Usage:
#   ./scripts/restore-db.sh --target-time "2026-04-28T12:00:00Z"
#   ./scripts/restore-db.sh --target-time "2026-04-28T12:00:00Z" --base 20260428T100000Z
#   ./scripts/restore-db.sh --list
#
# Options:
#   --target-time TIME   ISO-8601 UTC timestamp to recover to (required for restore)
#   --base LABEL         Base backup label to use (default: latest)
#   --list               List available base backups and exit
#   --dry-run            Show what would be done without executing
#
# Environment Variables:
#   DATABASE_URL          - PostgreSQL connection string
#   BACKUP_STORAGE_PATH   - Local path for backups (default: /var/backups/nova/pitr)
#   PGDATA                - PostgreSQL data directory (default: /var/lib/postgresql/data)
#   BACKUP_S3_BUCKET      - Optional S3 bucket to pull backups from
# =============================================================================
set -euo pipefail

BACKUP_STORAGE_PATH="${BACKUP_STORAGE_PATH:-/var/backups/nova/pitr}"
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-}"
BASE_BACKUP_DIR="${BACKUP_STORAGE_PATH}/base"
WAL_ARCHIVE_DIR="${BACKUP_STORAGE_PATH}/wal"
LOG_FILE="${BACKUP_STORAGE_PATH}/pitr-restore.log"

TARGET_TIME=""
BASE_LABEL=""
DRY_RUN=false
LIST_ONLY=false

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

log()     { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [INFO]  $*"; echo -e "${BLUE}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
success() { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [OK]    $*"; echo -e "${GREEN}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
warn()    { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [WARN]  $*"; echo -e "${YELLOW}${msg}${NC}"; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }
error()   { local msg="$(date -u +%Y-%m-%dT%H:%M:%SZ) [ERROR] $*"; echo -e "${RED}${msg}${NC}" >&2; echo "$msg" >> "$LOG_FILE" 2>/dev/null || true; }

parse_db_url() {
  local url="${DATABASE_URL:-postgresql://nova_user:nova_password@localhost:5432/nova_launch}"
  DB_USER=$(echo "$url" | sed -E 's|postgresql://([^:]+):.*|\1|')
  DB_PASS=$(echo "$url" | sed -E 's|postgresql://[^:]+:([^@]+)@.*|\1|')
  DB_HOST=$(echo "$url" | sed -E 's|.*@([^:/]+)[:/].*|\1|')
  DB_PORT=$(echo "$url" | sed -E 's|.*:([0-9]+)/.*|\1|')
  DB_NAME=$(echo "$url" | sed -E 's|.*/([^?]+).*|\1|')
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-time) TARGET_TIME="$2"; shift 2 ;;
      --base)        BASE_LABEL="$2"; shift 2 ;;
      --dry-run)     DRY_RUN=true; shift ;;
      --list)        LIST_ONLY=true; shift ;;
      *) error "Unknown option: $1"; exit 1 ;;
    esac
  done
}

list_backups() {
  echo "=== Available Base Backups ==="
  local found=false
  for d in "${BASE_BACKUP_DIR}"/*/; do
    [[ -d "$d" ]] || continue
    found=true
    local name size ts
    name=$(basename "$d")
    size=$(du -sh "$d" | cut -f1)
    ts=$(echo "$name" | sed 's/T/ /' | sed 's/Z//')
    printf "  %-30s  size: %-8s  timestamp: %s UTC\n" "$name" "$size" "$ts"
  done
  $found || echo "  (no base backups found in ${BASE_BACKUP_DIR})"

  echo ""
  echo "=== WAL Archive ==="
  local wal_count
  wal_count=$(find "$WAL_ARCHIVE_DIR" -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')
  echo "  Segments available: ${wal_count}"
}

# ── Optionally pull base backup from S3 ──────────────────────────────────────
fetch_from_s3_if_needed() {
  local label="$1"
  local dest="${BASE_BACKUP_DIR}/${label}"

  if [[ -d "$dest" ]]; then return 0; fi

  if [[ -z "$BACKUP_S3_BUCKET" ]]; then
    error "Base backup not found locally and BACKUP_S3_BUCKET is not set"
    exit 1
  fi

  if ! command -v aws &>/dev/null; then
    error "AWS CLI not found; cannot fetch backup from S3"
    exit 1
  fi

  log "Fetching base backup from S3: ${label}..."
  mkdir -p "$dest"
  aws s3 sync "s3://${BACKUP_S3_BUCKET}/pitr/base/${label}/" "$dest/"
  success "Fetched from S3: ${label}"
}

# ── Resolve the latest base backup label ─────────────────────────────────────
resolve_base_label() {
  if [[ -n "$BASE_LABEL" ]]; then echo "$BASE_LABEL"; return; fi

  local latest
  latest=$(ls -1t "$BASE_BACKUP_DIR" 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    error "No base backups found in ${BASE_BACKUP_DIR}"
    exit 1
  fi
  echo "$latest"
}

# ── Restore ───────────────────────────────────────────────────────────────────
do_restore() {
  local base_label
  base_label=$(resolve_base_label)
  local base_dir="${BASE_BACKUP_DIR}/${base_label}"

  log "Restore plan:"
  log "  Base backup : ${base_label}"
  log "  Target time : ${TARGET_TIME}"
  log "  PGDATA      : ${PGDATA}"
  log "  WAL archive : ${WAL_ARCHIVE_DIR}"

  if $DRY_RUN; then
    warn "DRY RUN — no changes made"
    return 0
  fi

  # Safety confirmation
  warn "⚠️  This will STOP PostgreSQL and REPLACE ${PGDATA}."
  warn "   Target time: ${TARGET_TIME}"
  warn "   Type 'yes' to continue:"
  read -r confirm
  [[ "$confirm" == "yes" ]] || { log "Restore cancelled"; exit 0; }

  fetch_from_s3_if_needed "$base_label"

  # Stop PostgreSQL
  log "Stopping PostgreSQL..."
  if command -v pg_ctlcluster &>/dev/null; then
    pg_ctlcluster "$(pg_lsclusters -h | awk '{print $1}' | head -1)" main stop 2>/dev/null || true
  elif command -v pg_ctl &>/dev/null; then
    pg_ctl stop -D "$PGDATA" -m fast 2>/dev/null || true
  else
    warn "Could not stop PostgreSQL automatically — ensure it is stopped before proceeding"
  fi

  # Preserve pg_wal if present (avoid losing in-progress WAL)
  local pgwal_backup="/tmp/pg_wal_backup_$$"
  if [[ -d "${PGDATA}/pg_wal" ]]; then
    cp -r "${PGDATA}/pg_wal" "$pgwal_backup"
  fi

  # Clear PGDATA and restore base backup
  log "Clearing ${PGDATA}..."
  rm -rf "${PGDATA:?}"/*

  log "Extracting base backup..."
  # pg_basebackup --format=tar produces base.tar.gz (and pg_wal.tar.gz)
  if [[ -f "${base_dir}/base.tar.gz" ]]; then
    tar -xzf "${base_dir}/base.tar.gz" -C "$PGDATA"
  else
    # Fallback: plain directory backup
    cp -r "${base_dir}/." "$PGDATA/"
  fi

  # Restore pg_wal if we saved it
  if [[ -d "$pgwal_backup" ]]; then
    cp -r "$pgwal_backup/." "${PGDATA}/pg_wal/"
    rm -rf "$pgwal_backup"
  fi

  # Write recovery configuration (PostgreSQL 12+)
  log "Writing recovery configuration..."
  cat > "${PGDATA}/postgresql.auto.conf" <<EOF
# PITR recovery settings — written by restore-db.sh
restore_command = 'cp ${WAL_ARCHIVE_DIR}/%f %p'
recovery_target_time = '${TARGET_TIME}'
recovery_target_action = 'promote'
EOF

  # Signal PostgreSQL to enter recovery mode
  touch "${PGDATA}/recovery.signal"

  success "Recovery configuration written"
  log "Start PostgreSQL to begin WAL replay toward ${TARGET_TIME}"
  log "Monitor progress with: tail -f \$(pg_lsclusters -h | awk '{print \$6}')/postgresql.log"
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  parse_args "$@"
  parse_db_url
  mkdir -p "$BASE_BACKUP_DIR" "$WAL_ARCHIVE_DIR"

  if $LIST_ONLY; then
    list_backups
    exit 0
  fi

  if [[ -z "$TARGET_TIME" ]]; then
    error "Missing required option: --target-time"
    echo "Usage: $0 --target-time <ISO-8601-UTC> [--base <label>] [--dry-run]"
    exit 1
  fi

  do_restore
}

main "$@"
