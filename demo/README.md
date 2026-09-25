# Demo shop

A small online shop that OpsPilot watches, breaks on purpose and repairs. It stands in for
someone's production system, so it is built like one: several services, real traffic,
probes, resource limits, rollout history, and full telemetry.

```
customers (loadgen) ──> gateway ──> checkout ──> inventory
                           │           └───────> payments
                           └──────────> inventory
```

| Service | What it does | Main endpoints |
|---------|--------------|----------------|
| `gateway` | Public edge. Forwards browse and checkout requests. | `GET /api/products`, `POST /api/checkout` |
| `checkout` | Reserves stock, prices the order, takes payment. | `POST /orders` |
| `payments` | Charges cards through a small pool of processor connections. | `POST /charges` |
| `inventory` | Product catalog and stock reservations. | `GET /stock`, `POST /reservations` |
| `loadgen` | Simulated customers. Not part of the shop and not instrumented. | `GET/POST/DELETE /control` |

Every shop service also serves `/healthz`, `/readyz`, `/metrics` and `/_chaos`, and none of
these internal endpoints are counted in traces or request metrics.

## Telemetry

- **Metrics** come from `prom-client`: `http_requests_total`,
  `http_request_duration_seconds`, `http_client_requests_total` (calls to other services, by
  outcome), Node.js process metrics, and the payments `worker_pool_*` gauges. Every series
  carries `service` and `version` labels.
- **Traces** come from OpenTelemetry auto-instrumentation (http, express, fetch) and are
  exported over OTLP to the collector.
- **Logs** are pino JSON on stdout, also forwarded over OTLP with the trace id attached.

## Releases

All images are built from one `Dockerfile`. [`releases.json`](releases.json) lists each
service's releases, and `npm run cluster:up` builds every one of them as
`shop.local/<service>:<version>`.

`checkout 1.4.2` is the broken release. It is built with `RELEASE_DEFECT=coupon-lookup`,
which removes the fallback for unknown coupon codes, so any order that uses an expired code
fails with a `TypeError`.

## Fault injection

`POST /_chaos` changes the running process only, so a pod restart clears it:

```json
{ "latencyMs": 2500, "leakMbPerMin": 90, "durationSec": 1800 }
```

- `latencyMs`: delay added to each request, with ±20% jitter.
- `leakMbPerMin`: keeps memory growing until the process is at 93% of its container limit.
- `durationSec`: how long until the fault switches itself off (default 30 minutes).

`DELETE /_chaos` clears every fault. You shouldn't need to call these endpoints yourself;
`npm run scenario` does it for you.
