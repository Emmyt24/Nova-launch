# Integration Metrics

Production metrics for the Nova Launch integration pipeline. All metrics are registered in `monitoring/metrics/prometheus-config.ts` under the `nova_launch_` prefix.

---

## Wallet Submission

### `nova_launch_wallet_submission_total`
**Type:** Counter  
**Labels:** `action`, `outcome`

Counts every wallet transaction submission attempt.

| Label | Values |
|-------|--------|
| `action` | `deploy`, `burn`, `propose`, `vote` |
| `outcome` | `success`, `simulation_failed`, `wallet_rejected`, `network_error` |

**Alert suggestion:** `rate(nova_launch_wallet_submission_total{outcome="simulation_failed"}[5m]) / rate(nova_launch_wallet_submission_total[5m]) > 0.1` — simulation failure rate above 10%.

---

### `nova_launch_tx_confirmation_duration_seconds`
**Type:** Histogram  
**Labels:** `action`, `outcome`  
**Buckets:** 1, 3, 5, 10, 20, 30, 60, 120 seconds

Time from wallet submission to on-chain confirmation.

**Alert suggestion:** `histogram_quantile(0.95, nova_launch_tx_confirmation_duration_seconds_bucket{outcome="success"}) > 30` — p95 confirmation latency above 30 s.

---

## Event Ingestion

### `nova_launch_event_ingestion_lag_seconds`
**Type:** Histogram  
**Labels:** `event_kind`  
**Buckets:** 1, 2, 5, 10, 30, 60, 120, 300 seconds

Lag between ledger close time and the moment the backend finishes processing the event. Emitted in `StellarEventListener.processEvent()`.

| `event_kind` examples | Description |
|-----------------------|-------------|
| `token_created` | New token deployed |
| `token_burned` | Self-burn |
| `token_admin_burned` | Admin clawback |
| `proposal_created` | Governance proposal |
| `vault_created` | Vault opened |
| `campaign_created` | Buyback campaign |

**Alert suggestion:** `histogram_quantile(0.99, nova_launch_event_ingestion_lag_seconds_bucket[10m]) > 60` — p99 ingestion lag above 60 s.

---

### `nova_launch_events_processed_total`
**Type:** Counter  
**Labels:** `event_kind`, `outcome`

| `outcome` | Meaning |
|-----------|---------|
| `success` | Event fully processed and projected |
| `error` | Processing threw an exception |

**Alert suggestion:** `rate(nova_launch_events_processed_total{outcome="error"}[5m]) > 0` — any processing errors.

---

## Webhook Reliability

### `nova_launch_webhook_delivery_total`
**Type:** Counter  
**Labels:** `event_type`, `outcome`

| `outcome` | Meaning |
|-----------|---------|
| `success` | Delivered on first or subsequent attempt |
| `failed` | Non-retryable 4xx response |
| `exhausted` | All retries consumed without success |

**Alert suggestion:** `rate(nova_launch_webhook_delivery_total{outcome="exhausted"}[5m]) > 0` — any exhausted deliveries.

---

### `nova_launch_webhook_retry_total`
**Type:** Counter  
**Labels:** `event_type`

Counts retry attempts beyond the first. A rising rate indicates persistent endpoint instability.

**Alert suggestion:** `rate(nova_launch_webhook_retry_total[5m]) > 1` — sustained retry pressure.

---

### `nova_launch_webhook_delivery_duration_seconds`
**Type:** Histogram  
**Labels:** `event_type`, `outcome`  
**Buckets:** 0.1, 0.5, 1, 2, 5, 10, 30 seconds

Time from first delivery attempt to final outcome (success or exhaustion).

---

## Client-Side Funnel (Analytics)

Emitted via `trackTxFunnel()` in `frontend/src/services/analytics.ts`. These are soft events sent to the analytics backend, not Prometheus counters.

| Event name | Trigger |
|------------|---------|
| `tx_simulation_passed` | Pre-signing simulation succeeded |
| `tx_simulation_failed` | Pre-signing simulation rejected |
| `tx_wallet_signed` | User approved in wallet |
| `tx_wallet_rejected` | User rejected in wallet |
| `tx_submitted` | Transaction sent to network |
| `tx_confirmed` | On-chain confirmation received |
| `tx_failed` | On-chain failure |

All events carry an `action` property (`deploy`, `burn`, `propose`, `vote`) for funnel segmentation.

---

## Dashboard Queries (Grafana)

```promql
# Wallet submission success rate (5 min window)
sum(rate(nova_launch_wallet_submission_total{outcome="success"}[5m]))
/ sum(rate(nova_launch_wallet_submission_total[5m]))

# p95 confirmation latency
histogram_quantile(0.95, sum by (le) (rate(nova_launch_tx_confirmation_duration_seconds_bucket[5m])))

# p99 ingestion lag
histogram_quantile(0.99, sum by (le, event_kind) (rate(nova_launch_event_ingestion_lag_seconds_bucket[10m])))

# Webhook success rate
sum(rate(nova_launch_webhook_delivery_total{outcome="success"}[5m]))
/ sum(rate(nova_launch_webhook_delivery_total[5m]))
```
