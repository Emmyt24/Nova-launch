# Backup API Documentation

This document describes the REST API endpoints for managing Point-in-Time Recovery (PITR) backups in Nova Launch.

## Overview

The Backup API provides comprehensive backup management for PostgreSQL, enabling:
- **Automated base backups** via `pg_basebackup`
- **Continuous WAL archiving** for point-in-time recovery
- **Restore operations** to any second within the retention window
- **Status monitoring** of backup health

All endpoints are protected by admin authentication and follow the standard Nova Launch response format.

---

## Authentication

All backup endpoints require **admin authentication** via Bearer token:

```bash
curl -H "Authorization: Bearer <ADMIN_TOKEN>" \
  https://api.example.com/api/admin/backup/status
```

Requests without valid authentication will receive:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Admin authentication required"
  }
}
```

---

## Response Format

All endpoints follow this standard response structure:

### Success Response
```json
{
  "success": true,
  "data": { /* endpoint-specific data */ }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

---

## Endpoints

### 1. GET /api/admin/backup/status

Returns the current PITR backup status and health metrics.

#### Request
```bash
curl -X GET https://api.example.com/api/admin/backup/status \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

#### Response
**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "latestBaseBackup": "20260428T145816Z",
    "walSegmentCount": 42,
    "walArchiveSize": "512M",
    "storagePath": "/var/backups/nova/pitr"
  }
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `latestBaseBackup` | string \| null | ISO-8601 timestamp of the most recent base backup, or `null` if none exist |
| `walSegmentCount` | number | Number of archived WAL segments (includes partial/in-progress) |
| `walArchiveSize` | string | Human-readable total size of the WAL archive directory (e.g., "512M", "1.2G") |
| `storagePath` | string | Absolute path to the PITR storage directory |

#### Example: Status Check
```bash
# Check backup health
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/admin/backup/status | jq .

# Parse results
# If latestBaseBackup is null → no backups exist yet (requires initial backup)
# If walSegmentCount is 0 → WAL archiving may not be enabled
# If walArchiveSize is "0" → du command failed (check filesystem)
```

#### Error Scenarios
| HTTP Status | Error Code | Cause |
|-------------|-----------|-------|
| 401 | UNAUTHORIZED | Missing or invalid admin token |
| 500 | BACKUP_STATUS_ERROR | Backend service error (check logs) |

---

### 2. GET /api/admin/backup/list

Lists all available base backup labels, sorted newest first.

#### Request
```bash
curl -X GET https://api.example.com/api/admin/backup/list \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

#### Response
**Status:** `200 OK`

```json
{
  "success": true,
  "data": {
    "backups": [
      "20260428T145816Z",
      "20260428T085816Z",
      "20260427T145816Z"
    ],
    "count": 3
  }
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `backups` | string[] | Array of base backup labels (timestamps), newest first |
| `count` | number | Total number of available base backups |

#### Example: List & Select Backups
```bash
# List all backups
BACKUPS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/admin/backup/list | jq -r '.data.backups[]')

# Show available backups
echo "Available backups:"
echo "$BACKUPS"

# Use the most recent for recovery
LATEST_BACKUP=$(echo "$BACKUPS" | head -n1)
echo "Latest backup: $LATEST_BACKUP"
```

#### Edge Cases
- **Empty list (count=0):** No base backups exist. Run `/trigger` to create the first one.
- **Non-directory files ignored:** Files in the base backup directory are automatically excluded.

#### Error Scenarios
| HTTP Status | Error Code | Cause |
|-------------|-----------|-------|
| 401 | UNAUTHORIZED | Missing or invalid admin token |
| 500 | BACKUP_LIST_ERROR | Backend service error |

---

### 3. POST /api/admin/backup/trigger

Triggers an immediate base backup. This is an asynchronous operation; the response indicates the outcome once the script exits.

#### Request
```bash
curl -X POST https://api.example.com/api/admin/backup/trigger \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

#### Request Body
None (empty JSON object `{}` acceptable).

#### Response
**Status:** `200 OK` (success) or `500 Internal Server Error` (failure)

**Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Base backup completed successfully",
    "backupLabel": "nova-pitr-20260428T145816Z",
    "durationMs": 45000
  }
}
```

**Failure (HTTP 500):**
```json
{
  "success": false,
  "error": {
    "code": "BACKUP_FAILED",
    "message": "pg_basebackup: could not connect to server: Connection refused"
  }
}
```

#### Response Fields (Success Case)
| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Status message from the backup script |
| `backupLabel` | string | Unique label for the backup (can be used in `/restore`) |
| `durationMs` | number | Total duration of the backup operation in milliseconds |

#### Example: Trigger & Monitor Backup
```bash
# Trigger a backup
RESULT=$(curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/admin/backup/trigger)

# Check if successful
if [[ $(echo "$RESULT" | jq -r '.data.success') == "true" ]]; then
  LABEL=$(echo "$RESULT" | jq -r '.data.backupLabel')
  DURATION=$(echo "$RESULT" | jq -r '.data.durationMs')
  echo "✓ Backup created: $LABEL (took ${DURATION}ms)"
else
  echo "✗ Backup failed: $(echo "$RESULT" | jq -r '.data.message')"
fi
```

#### Constraints
- **Timeout:** Individual backup requests timeout after 30 minutes
- **Concurrent backups:** Only one base backup can run at a time (enforced by PostgreSQL)
- **Storage:** Ensure adequate disk space in `BACKUP_STORAGE_PATH`

#### Common Errors
| Error Message | Cause | Resolution |
|---------------|-------|-----------|
| `could not connect to server` | PostgreSQL is down or unreachable | Verify PostgreSQL service and DATABASE_URL |
| `timed out after 30 minutes` | Database is too large for backup window | Increase timeout or optimize database size |
| `No space left on device` | Backup storage is full | Clean old backups or expand storage |

#### Error Scenarios
| HTTP Status | Error Code | Cause |
|-------------|-----------|-------|
| 401 | UNAUTHORIZED | Missing or invalid admin token |
| 500 | BACKUP_FAILED | pg_basebackup command exited with error |
| 500 | BACKUP_TRIGGER_ERROR | Service error (check logs) |

---

### 4. POST /api/admin/backup/restore

Initiates a PITR restore operation. Supports both dry-run (planning) and execution modes.

#### Request
```bash
# Dry-run (recommended first step)
curl -X POST https://api.example.com/api/admin/backup/restore \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetTime": "2026-04-28T12:00:00Z",
    "confirmed": false
  }'

# Execute restore (destructive operation)
curl -X POST https://api.example.com/api/admin/backup/restore \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "targetTime": "2026-04-28T12:00:00Z",
    "baseLabel": "20260428T100000Z",
    "confirmed": true
  }'
```

#### Request Body
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `targetTime` | string | ✓ | ISO-8601 UTC timestamp: `YYYY-MM-DDTHH:MM:SSZ` (seconds precision) |
| `baseLabel` | string | | Base backup label to restore from. If omitted, uses the latest. Format: `YYYYMMDDTHHMMSSZ` |
| `confirmed` | boolean | ✓ | Must be `true` to execute. Set to `false` for a dry-run. Guards against accidental restores. |

#### Response
**Status:** `200 OK` (success) or `400 Bad Request` (validation error) or `500 Internal Server Error` (failure)

**Dry-Run Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Dry-run complete. No changes made. Would restore to 2026-04-28T12:00:00Z.",
    "dryRun": true,
    "durationMs": 12000
  }
}
```

**Restore Success (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Restore to 2026-04-28T12:00:00Z initiated. Start PostgreSQL to begin WAL replay.",
    "dryRun": false,
    "durationMs": 180000
  }
}
```

**Validation Error (HTTP 400):**
```json
{
  "success": false,
  "error": {
    "code": "MISSING_TARGET_TIME",
    "message": "targetTime is required"
  }
}
```

#### Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Status or result message from the restore script |
| `dryRun` | boolean | `true` if this was a dry-run (no changes made); `false` if executed |
| `durationMs` | number | Duration of the restore operation in milliseconds |

#### Example: Complete Restore Workflow
```bash
#!/bin/bash
set -e

ADMIN_TOKEN="your-admin-token"
API="https://api.example.com"
TARGET_TIME="2026-04-28T12:00:00Z"

echo "Step 1: List available backups"
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/api/admin/backup/list" | jq '.data.backups'

echo ""
echo "Step 2: Dry-run restore to $TARGET_TIME"
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "$API/api/admin/backup/restore" \
  -d "{
    \"targetTime\": \"$TARGET_TIME\",
    \"confirmed\": false
  }" | jq '.data'

# Operator reviews dry-run output and confirms

echo ""
echo "Step 3: Execute restore"
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "$API/api/admin/backup/restore" \
  -d "{
    \"targetTime\": \"$TARGET_TIME\",
    \"confirmed\": true
  }" | jq '.data'

echo ""
echo "Step 4: Start PostgreSQL (restore will replay WAL and recover to target time)"
# This step is environment-specific (systemctl, docker restart, etc.)
```

#### Validation Rules
| Field | Rule | Example |
|-------|------|---------|
| `targetTime` | ISO-8601 UTC format with seconds | ✓ `2026-04-28T12:00:00Z` ✗ `2026-04-28T12:00Z` |
| `baseLabel` | Optional; must match existing backup | ✓ `20260428T100000Z` (see `/list`) |
| `confirmed` | Boolean only; `true` required for execution | ✓ `true` / `false` ✗ `"yes"` |

#### Workflow: Dry-Run → Review → Execute

1. **Dry-Run:** Always start with `confirmed: false` to see what would happen
   ```bash
   curl -X POST ... -d '{"targetTime":"...", "confirmed":false}'
   ```

2. **Review Output:** Verify the restore plan is correct

3. **Execute:** Once confident, set `confirmed: true`
   ```bash
   curl -X POST ... -d '{"targetTime":"...", "confirmed":true}'
   ```

4. **Start PostgreSQL:** Database must be restarted for WAL replay
   - Restore replaces `$PGDATA`
   - On restart, PostgreSQL replays WAL from the base backup to `targetTime`
   - Data is recovered to the second specified

#### Error Scenarios
| HTTP Status | Error Code | Cause | Resolution |
|-------------|-----------|-------|-----------|
| 400 | MISSING_TARGET_TIME | `targetTime` not provided | Add `targetTime` field |
| 400 | MISSING_CONFIRMED | `confirmed` not provided or not boolean | Set `confirmed: true` or `false` |
| 401 | UNAUTHORIZED | Missing or invalid admin token | Verify authentication token |
| 500 | RESTORE_FAILED | Restore script error (e.g., no base backup found) | Check `/list` and error message |
| 500 | RESTORE_ERROR | Service error | Check backend logs |

#### Important Notes
⚠️ **Destructive Operation:** Restore replaces the entire database directory (`$PGDATA`). Always:
- Run `confirmed: false` first
- Ensure a backup of the current database exists
- Review the restore plan carefully
- Notify database users before executing
- Test in non-production environments first

---

## Error Codes Reference

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid admin authentication |
| `MISSING_TARGET_TIME` | 400 | `targetTime` field required for restore |
| `MISSING_CONFIRMED` | 400 | `confirmed` field required and must be boolean |
| `BACKUP_STATUS_ERROR` | 500 | Failed to fetch backup status (service error) |
| `BACKUP_LIST_ERROR` | 500 | Failed to list backups (service error) |
| `BACKUP_FAILED` | 500 | Base backup operation failed |
| `BACKUP_TRIGGER_ERROR` | 500 | Service error while triggering backup |
| `RESTORE_FAILED` | 500 | Restore operation failed |
| `RESTORE_ERROR` | 500 | Service error while initiating restore |

---

## Common Patterns

### Automated Scheduled Backups
Use an external scheduler (Kubernetes CronJob, systemd timer, cron) to trigger backups:

```bash
# Run daily at 2 AM UTC
0 2 * * * curl -X POST \
  -H "Authorization: Bearer $ADMIN_BACKUP_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/trigger
```

### Health Check
```bash
#!/bin/bash
ADMIN_TOKEN="..."
STATUS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/status)

LATEST=$(echo "$STATUS" | jq -r '.data.latestBaseBackup')
if [[ "$LATEST" == "null" ]]; then
  echo "ERROR: No backups found"
  exit 1
fi

WAL_COUNT=$(echo "$STATUS" | jq -r '.data.walSegmentCount')
echo "✓ Latest backup: $LATEST"
echo "✓ WAL segments: $WAL_COUNT"
```

### Time Window Recovery
```bash
# Example: Recover to 15 minutes ago
TARGET_TIME=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ)
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.nova-launch.com/api/admin/backup/restore \
  -d "{
    \"targetTime\": \"$TARGET_TIME\",
    \"confirmed\": false
  }"
```

---

## Security Considerations

- **Authentication:** All endpoints require admin authentication. Backup operations have high impact and should be restricted.
- **Confirmation Required:** Restore operations require explicit `confirmed: true` flag to prevent accidental execution.
- **Sensitive Data:** Database password is never logged. Credentials are passed only to the shell scripts.
- **Command Injection Prevention:** All shell arguments are passed as arrays (no string interpolation).
- **Backup Storage:** Ensure `BACKUP_STORAGE_PATH` is on a secure, backed-up filesystem with proper permissions (mode 700).

---

## Performance Considerations

- **Base Backup Time:** Depends on database size. Large databases may take 15-30+ minutes.
- **WAL Archive Size:** Grows continuously. Plan retention and cleanup accordingly.
- **Storage:** Allocate 150-200% of database size for PITR storage (base backups + WAL).
- **Restore Time:** Depends on target time relative to base backup (longer recovery distance = more WAL replay).

---

## Related Documentation

- [Database Backup & PITR Architecture](./DATABASE_BACKUP_PITR.md)
- [Backup Scripts Reference](./scripts/backup-db.sh)
- [Restore Scripts Reference](./scripts/restore-db.sh)
- [Environment Configuration](./.env.example)

---

## Support

For issues or questions:
1. Check backend logs: `docker compose logs backend`
2. Verify backup script output: `docker compose exec db-backup backup-db.sh status`
3. Review this documentation
4. Open an issue on GitHub with error messages and reproduction steps
