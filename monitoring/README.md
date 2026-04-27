# Nova Launch — Monitoring Stack

Grafana + Prometheus observability for the Nova Launch platform.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monitoring Stack                          │
│                                                                  │
│  ┌──────────────┐    scrape     ┌──────────────────────────┐    │
│  │  Prometheus  │◄──────────────│  nova-launch-backend:3001│    │
│  │  :9090       │               │  GET /metrics            │    │
│  └──────┬───────┘               └──────────────────────────┘    │
│         │ scrape                                                  │
│         ├──────────────────────► node-exporter:9100              │
│         ├──────────────────────► cadvisor:8080                   │
│         │                                                        │
│         │ alerts                                                  │
│         ▼                                                        │
│  ┌──────────────┐               ┌──────────────────────────┐    │
│  │ Alertmanager │──────────────►│  Slack / PagerDuty       │    │
│  │  :9093       │               └──────────────────────────┘    │
│  └──────────────┘                                                │
│                                                                  │
│  ┌──────────────┐    query      ┌──────────────────────────┐    │
│  │   Grafana    │◄──────────────│  Prometheus datasource   │    │
│  │  :3000       │               └──────────────────────────┘    │
│  └──────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start the main application stack first
docker-compose up -d

# Then start the monitoring stack
docker-compose -f monitoring/docker-compose.yml up -d
```

| Service      | URL                   | Credentials        |
| ------------ | --------------------- | ------------------ |
| Grafana      | http://localhost:3000 | admin / nova-admin |
| Prometheus   | http://localhost:9090 | —                  |
| Alertmanager | http://localhost:9093 | —                  |

## Dashboards

Four pre-built dashboards are provisioned automatically:

| Dashboard              | UID               | Description                                  |
| ---------------------- | ----------------- | -------------------------------------------- |
| Nova Launch — Overview | `nova-overview`   | High-level health, throughput, and resources |
| API Performance        | `nova-api`        | HTTP latency, error rates, DB connections    |
| Blockchain Activity    | `nova-blockchain` | Token deployments, RPC calls, event pipeline |
| Infrastructure         | `nova-infra`      | CPU, memory, Node.js heap, containers        |

## Metrics Endpoint

The backend exposes Prometheus metrics at `GET /metrics` (port 3001).

Disable with `METRICS_ENABLED=false` in the backend environment.

**Security note:** In production, restrict `/metrics` to the internal network
(e.g. via nginx `allow 10.0.0.0/8; deny all;` or a Kubernetes NetworkPolicy).

## Alert Rules

| File                                   | Covers                                      |
| -------------------------------------- | ------------------------------------------- |
| `prometheus/alerts/api.yml`            | HTTP error rates, latency, backend down     |
| `prometheus/alerts/blockchain.yml`     | RPC errors, ingestion lag, deployment fails |
| `prometheus/alerts/infrastructure.yml` | CPU, memory, disk, Node.js heap, containers |
| `prometheus/alerts/webhooks.yml`       | Webhook failures, retry storms, job queues  |

## Alertmanager Configuration

Edit `alertmanager/alertmanager.yml` and set:

```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Or pass it as an environment variable when starting the stack:

```bash
SLACK_WEBHOOK_URL=https://... docker-compose -f monitoring/docker-compose.yml up -d
```

## Instrumentation

The backend uses `prom-client` via `backend/src/lib/metrics/index.ts`.

### Adding metrics to a service

```typescript
import { MetricsCollector } from "../lib/metrics";

// Record an HTTP request (done automatically by middleware)
MetricsCollector.recordHttpRequest("GET", "/api/tokens", 200, 0.05);

// Record a token deployment
MetricsCollector.recordTokenDeployment("testnet", "success", 12.5, 0.01);

// Record a contract interaction
MetricsCollector.recordContractInteraction(
  "token-factory",
  "deploy",
  "success",
  5.2,
  100_000,
);

// Record a database query
MetricsCollector.recordDatabaseQuery("SELECT", "tokens", "success", 0.003);

// Record a health check result
MetricsCollector.recordHealthCheck("database", true, 0.01);
```

### Blockchain / event pipeline

```typescript
import { IntegrationMetrics } from "../lib/metrics";

IntegrationMetrics.recordEventProcessed("TokenMinted", "success");
IntegrationMetrics.recordIngestionLag("TokenMinted", 2.3);
IntegrationMetrics.recordWebhookDelivery("success", "TokenMinted", 0.3);
```

## Directory Structure

```
monitoring/
├── docker-compose.yml              # Monitoring stack orchestration
├── README.md                       # This file
├── alertmanager/
│   └── alertmanager.yml            # Alert routing configuration
├── grafana/
│   ├── dashboards/                 # Pre-built Grafana dashboards (JSON)
│   │   ├── nova-overview.json
│   │   ├── nova-api.json
│   │   ├── nova-blockchain.json
│   │   └── nova-infrastructure.json
│   └── provisioning/
│       ├── dashboards/dashboards.yml
│       └── datasources/prometheus.yml
├── health-checks/
│   └── health-monitor.ts           # Health check framework
├── logging/
│   └── structured-logger.ts        # Winston structured logging
├── metrics/
│   └── prometheus-config.ts        # Prometheus metric definitions (reference)
└── prometheus/
    ├── prometheus.yml               # Prometheus scrape configuration
    └── alerts/
        ├── api.yml
        ├── blockchain.yml
        ├── infrastructure.yml
        └── webhooks.yml
```
