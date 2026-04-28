# Backup Monitoring & Alerting Guide

This guide covers monitoring backup health, setting up alerts, and responding to common backup issues in Nova Launch's PITR system.

---

## Overview

Effective backup monitoring ensures:
- **Data Safety:** Verify backups complete successfully and regularly
- **Compliance:** Meet RPO/RTO targets and audit requirements
- **Early Detection:** Catch issues (storage full, archiving stuck) before they become critical
- **Operational Confidence:** Know backup status at a glance

The monitoring strategy combines:
1. **API Health Checks** — Poll backup status regularly
2. **Log Monitoring** — Track backup script output for errors
3. **Metrics Collection** — Track backup duration, WAL growth, storage usage
4. **Alerting** — Notify on-call when issues detected

---

## Health Checks via API

### Recommended Check Interval
- **Development:** Every 1 hour
- **Staging:** Every 30 minutes
- **Production:** Every 10-15 minutes (adjust based on backup schedule)

### Health Check Script
```bash
#!/bin/bash
# health-check-backup.sh
# Monitors backup status and reports issues

set -euo pipefail

API_URL="${API_URL:-https://api.nova-launch.com}"
ADMIN_TOKEN="${ADMIN_BACKUP_TOKEN:-}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
MAX_BACKUP_AGE_HOURS=24

if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "ERROR: ADMIN_BACKUP_TOKEN not set"
  exit 1
fi

# Fetch backup status
STATUS=$(curl -s -X GET \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/backup/status")

if [[ ! $(echo "$STATUS" | jq -r '.success') == "true" ]]; then
  echo "CRITICAL: Failed to fetch backup status"
  echo "$STATUS" | jq .
  exit 2
fi

# Extract data
LATEST_BACKUP=$(echo "$STATUS" | jq -r '.data.latestBaseBackup')
WAL_COUNT=$(echo "$STATUS" | jq -r '.data.walSegmentCount')
WAL_SIZE=$(echo "$STATUS" | jq -r '.data.walArchiveSize')

echo "=== Backup Health Check ==="
echo "Timestamp: $TIMESTAMP"
echo "Latest Backup: $LATEST_BACKUP"
echo "WAL Segments: $WAL_COUNT"
echo "WAL Archive Size: $WAL_SIZE"

# Check 1: Backup exists
if [[ "$LATEST_BACKUP" == "null" ]]; then
  echo "CRITICAL: No backups found!"
  exit 2
fi

# Check 2: Backup recency
BACKUP_TIME=$(date -d "${LATEST_BACKUP:0:8}T${LATEST_BACKUP:9:6}Z" +%s 2>/dev/null || echo 0)
CURRENT_TIME=$(date -u +%s)
BACKUP_AGE_HOURS=$(( ($CURRENT_TIME - $BACKUP_TIME) / 3600 ))

echo "Backup Age: ${BACKUP_AGE_HOURS} hours"

if [[ $BACKUP_AGE_HOURS -gt $MAX_BACKUP_AGE_HOURS ]]; then
  echo "WARNING: Last backup is older than ${MAX_BACKUP_AGE_HOURS} hours"
  exit 1
fi

# Check 3: WAL archiving active
if [[ $WAL_COUNT -eq 0 ]]; then
  echo "WARNING: No WAL segments archived. WAL archiving may be disabled."
  exit 1
fi

# Check 4: Storage not full (basic heuristic)
# Parse human-readable size (e.g., "512M" -> 512)
WAL_SIZE_NUM=$(echo "$WAL_SIZE" | sed -E 's/([0-9.]+).*/\1/')
if [[ $(echo "$WAL_SIZE_NUM < 0.1" | bc) -eq 1 ]]; then
  echo "WARNING: WAL archive size very small. Check if archiving is working."
  exit 1
fi

echo "OK: Backup health check passed"
exit 0
```

### Using Health Checks
```bash
# Add to crontab (every 15 minutes in production)
*/15 * * * * /opt/monitoring/health-check-backup.sh >> /var/log/backup-health.log 2>&1

# Or use with Kubernetes CronJob
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-health-check
spec:
  schedule: "*/15 * * * *"  # Every 15 minutes
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: health-check
            image: curlimages/curl
            command:
            - sh
            - -c
            - |
              STATUS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
                https://api.nova-launch.com/api/admin/backup/status)
              echo $STATUS | jq '.data | "Latest: \(.latestBaseBackup), WAL: \(.walSegmentCount)"'
          restartPolicy: OnFailure
```

---

## Monitoring Metrics

### Key Metrics to Track

1. **Backup Frequency**
   - Last base backup timestamp
   - Time since last successful backup
   - Backup count in retention window

2. **Backup Duration**
   - Base backup creation time (seconds)
   - Restore dry-run time (seconds)
   - Trend analysis (is it getting slower?)

3. **WAL Archiving**
   - WAL segment count
   - WAL archive size (bytes)
   - WAL growth rate (bytes/minute)
   - New segments per minute

4. **Storage Usage**
   - Total PITR storage usage
   - Available disk space
   - Growth projection (when full?)
   - Per-backup size

5. **Success Rate**
   - Backup success % (last 7/30 days)
   - Failed backup attempts
   - Error causes (connection, timeout, disk)

### Prometheus Metrics

Add these endpoints to collect metrics:

```bash
#!/bin/bash
# export-backup-metrics.sh
# Exports backup metrics for Prometheus

API_URL="$1"
ADMIN_TOKEN="$2"

STATUS=$(curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API_URL/api/admin/backup/status")

LATEST=$(echo "$STATUS" | jq -r '.data.latestBaseBackup')
WAL_COUNT=$(echo "$STATUS" | jq -r '.data.walSegmentCount')
WAL_SIZE=$(echo "$STATUS" | jq -r '.data.walArchiveSize' | sed -E 's/([0-9.]+)G?/\1/')

# Convert YYYYMMDDTHHMMSSZ to Unix timestamp for age calculation
if [[ "$LATEST" != "null" ]]; then
  BACKUP_TS=$(date -d "${LATEST:0:8}T${LATEST:9:6}Z" +%s 2>/dev/null || echo 0)
  BACKUP_AGE=$(( $(date +%s) - $BACKUP_TS ))
else
  BACKUP_AGE=-1
fi

echo "# HELP nova_backup_last_backup_age_seconds Age of the last successful backup in seconds"
echo "# TYPE nova_backup_last_backup_age_seconds gauge"
echo "nova_backup_last_backup_age_seconds $BACKUP_AGE"

echo "# HELP nova_backup_wal_segments_count Number of archived WAL segments"
echo "# TYPE nova_backup_wal_segments_count gauge"
echo "nova_backup_wal_segments_count $WAL_COUNT"

echo "# HELP nova_backup_wal_archive_size_mb Size of WAL archive in megabytes"
echo "# TYPE nova_backup_wal_archive_size_mb gauge"
echo "nova_backup_wal_archive_size_mb $WAL_SIZE"
```

### Grafana Dashboard Example

```json
{
  "dashboard": {
    "title": "Backup & PITR Monitoring",
    "panels": [
      {
        "title": "Time Since Last Backup",
        "targets": [
          {
            "expr": "nova_backup_last_backup_age_seconds / 3600"
          }
        ],
        "alert": {
          "name": "Backup Stale",
          "condition": "> 24",
          "message": "Last backup is older than 24 hours"
        }
      },
      {
        "title": "WAL Archive Size",
        "targets": [
          {
            "expr": "nova_backup_wal_archive_size_mb / 1024"
          }
        ],
        "alert": {
          "name": "Storage Usage High",
          "condition": "> 80% of available",
          "message": "Backup storage utilization is high"
        }
      },
      {
        "title": "WAL Segments Growth",
        "targets": [
          {
            "expr": "rate(nova_backup_wal_segments_count[5m])"
          }
        ]
      }
    ]
  }
}
```

---

## Alerting Strategy

### Alert Rules

#### Rule 1: Backup Not Running
**Condition:** Last backup age > 24 hours  
**Severity:** CRITICAL  
**Action:** Page on-call DBA

```yaml
alert: BackupNotRunning
  expr: nova_backup_last_backup_age_seconds > 86400  # 24 hours
  for: 30m
  annotations:
    summary: "Backup not run for {{ $value | humanizeDuration }}"
    action: "Check backup service, review /api/admin/backup/status API response"
```

#### Rule 2: Backup Failure
**Condition:** `/api/admin/backup/trigger` returns failure  
**Severity:** CRITICAL  
**Action:** Page on-call DBA, check logs

```bash
# Implementation: Poll /status after expected backup time
if LATEST_BACKUP_OLD && $(curl -trigger -failed); then
  # Alert
fi
```

#### Rule 3: WAL Archiving Disabled
**Condition:** WAL segment count not increasing over 1 hour  
**Severity:** WARNING  
**Action:** Verify PostgreSQL WAL configuration

```yaml
alert: WalArchivingDown
  expr: rate(nova_backup_wal_segments_count[1h]) == 0
  for: 10m
  annotations:
    summary: "WAL archiving not active"
    action: "Check PostgreSQL archive_command config, restart service if needed"
```

#### Rule 4: Storage Running Out
**Condition:** Available storage < 10% or WAL size > 80% of allocation  
**Severity:** WARNING → CRITICAL  
**Action:** Clean old backups or expand storage

```yaml
alert: BackupStorageFull
  expr: (nova_backup_wal_archive_size_mb / 1024) > 0.8
  for: 5m
  annotations:
    summary: "Backup storage utilization {{ $value }}%"
    action: "Run backup cleanup or expand storage"
```

#### Rule 5: Backup Script Error
**Condition:** Script exits with error  
**Severity:** CRITICAL  
**Action:** Manual investigation

```bash
# Monitor logs for error patterns
if grep -i "error\|failed\|exception" /var/log/backup.log | tail -1; then
  # Alert with error message
fi
```

### Alert Notifications

Configure alerts to notify via:
- **Email:** For operational issues (CCO, DBA team)
- **Slack:** For real-time visibility in #database channel
- **PagerDuty:** For on-call escalation
- **SMS:** For critical backup failures

Example Slack notification:
```
⚠️ Backup Alert
━━━━━━━━━━━━━━━━━━━━━━
Alert: Last Backup Stale
Age: 28 hours
Threshold: 24 hours
Severity: CRITICAL
Action: Investigate backup service; check API /status endpoint
RunBook: https://wiki.internal/backup-runbook#stale-backup
```

---

## Troubleshooting Guide

### Issue: No Backups Exist
**Symptoms:** `/api/admin/backup/list` returns empty array  
**Check:**
1. Verify backup service is running: `docker compose ps db-backup`
2. Check for permissions: `ls -la /var/backups/nova/pitr`
3. Review service logs: `docker compose logs db-backup -f`

**Resolution:**
```bash
# Manually trigger first backup
curl -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/trigger

# Wait for completion and verify
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/status
```

### Issue: Backups Failing
**Symptoms:** Backup trigger returns error  
**Check:**
1. PostgreSQL is running: `pg_isready`
2. Check disk space: `df -h /var/backups/nova/pitr`
3. Review error in script logs: `tail -50 /var/backups/nova/pitr/pitr-backup.log`

**Common Errors:**
- `could not connect to server` → PostgreSQL down or wrong connection string
- `No space left on device` → Disk full, clean old backups
- `timeout after 30 minutes` → Database too large, increase timeout

### Issue: WAL Archiving Stuck
**Symptoms:** WAL count not increasing, `/status` shows 0 segments  
**Check:**
1. Verify WAL level: `SELECT setting FROM pg_settings WHERE name='wal_level'`
2. Check archive mode: `SELECT setting FROM pg_settings WHERE name='archive_mode'`
3. Review archive_command: `SELECT setting FROM pg_settings WHERE name='archive_command'`

**Resolution:**
```sql
-- Enable if not already
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET archive_mode = 'on';
ALTER SYSTEM SET archive_command = '/app/scripts/backup-db.sh wal-archive %p %f';

-- Reload config
SELECT pg_reload_conf();
```

### Issue: Storage Running Out
**Symptoms:** Storage alert triggered, backups failing with disk error  
**Check:**
```bash
# See current usage
du -sh /var/backups/nova/pitr
du -sh /var/backups/nova/pitr/base
du -sh /var/backups/nova/pitr/wal

# Check available space
df -h /var/backups/nova/pitr
```

**Resolution:**
```bash
# List old backups
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/list | jq

# Delete old backups (keep at least 2 recent)
rm -rf /var/backups/nova/pitr/base/YYYYMMDDTHHMMSSZ

# Monitor cleanup progress
du -sh /var/backups/nova/pitr
```

### Issue: Restore Dry-Run Fails
**Symptoms:** Restore test returns error  
**Check:**
```bash
# Verify base backup exists
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.nova-launch.com/api/admin/backup/list

# Check target time is in valid range
# (after base backup, within WAL retention window)

# Review restore logs
tail -100 /var/backups/nova/pitr/pitr-backup.log
```

---

## Regular Maintenance

### Daily Tasks
- Review alert dashboard for any warnings
- Verify last backup timestamp (should be recent)
- Check WAL segment count is increasing

### Weekly Tasks
- Review backup trend (getting slower?)
- Test restore dry-run to specific recent time
- Check storage usage growth rate

### Monthly Tasks
- Full restore test in non-production environment
- Review and update alert thresholds
- Archive and audit backup success logs
- Verify backup retention policy is effective

### Quarterly Tasks
- Disaster recovery drill (full restore in production)
- Review and update monitoring runbooks
- Analyze backup performance trends
- Capacity planning (storage, duration, etc.)

---

## Recovery Time Objective (RTO) & Recovery Point Objective (RPO)

### Targets
- **RPO:** 1 minute (with continuous WAL archiving)
  - Data loss limited to last WAL segment (~16 MB)
- **RTO:** 30 minutes (dry-run + execution + PostgreSQL restart)
  - Assumes base backup and WAL available

### Achieving Targets
1. **Automation:** Scheduled backups every 6 hours
2. **Continuous WAL:** Enabled and archiving successfully
3. **Monitoring:** Alerts on backup failure within 5 minutes
4. **Testing:** Monthly restore tests to verify RTO

---

## Related Documentation

- [Database Backup & PITR](./DATABASE_BACKUP_PITR.md)
- [Backup API Reference](./BACKUP_API.md)
- [Disaster Recovery Procedures](./PRODUCTION_INTEGRATION_RUNBOOK.md)
- [Infrastructure Setup](../infra/README.md)

---

## Support & Escalation

**For Backup Issues:**
1. Check this troubleshooting guide
2. Review alert dashboard and logs
3. Contact: #database or @dba-on-call
4. Escalation: database-team@nova-launch.com
