# OpsPilot

An AI incident-response copilot for Kubernetes. OpsPilot watches a running system and turns
alerts into incidents. It works out what changed and why things broke, then proposes a fix.
Once a human approves, it runs the fix, checks that it worked, and writes the postmortem.

> **Status: Phase 1 of 6.** The system to be monitored and its observability stack are done.
> See the [roadmap](docs/ROADMAP.md) for what comes next, and the
> [requirements](docs/REQUIREMENTS.md) for the full scope.

## What runs today

```
                         ┌──────────────── shop namespace ────────────────┐
 loadgen (customers) ──> │ gateway ──> checkout ──> inventory              │
                         │    │            └──────> payments               │
                         │    └──────────> inventory                       │
                         └───────────┬───────────────────────┬────────────┘
                              traces + logs (OTLP)      /metrics scrape
                                     │                        │
                           OpenTelemetry Collector ──> Prometheus ──> Alertmanager
                              │            │     service graph   │
                            Tempo         Loki                   │
                              └──────────── Grafana ─────────────┘
```

Everything runs in a local minikube cluster.

## Repository layout

```
demo/         the online shop that OpsPilot watches, plus its load generator
deploy/k8s/   Kustomize manifests: base/ for everything, overlays/local/ for minikube
docs/         requirements and roadmap
scripts/      cluster and failure-scenario tooling
```

## Running it locally

You need Docker Desktop, minikube, kubectl and Node.js 22 or newer.

```bash
npm run cluster:up
```

The first run takes a few minutes, because it creates the cluster, pulls the observability
images and builds the shop. Running it again is safe: it only rebuilds what changed.

| What | Where |
|------|-------|
| Shop API | http://localhost:18080/api/products |
| Grafana | http://localhost:13000 (dashboard: *Shop / Shop service health*) |
| Prometheus | http://localhost:19090 |
| Alertmanager | http://localhost:19093 |

`npm run cluster:stop` pauses the cluster, `npm run cluster:down` deletes it, and
`npm run cluster:status` shows what's running.

## Breaking things on purpose

```bash
npm run scenario -- list
```

| Scenario | What happens | Alerts you should see |
|----------|--------------|-----------------------|
| `bad-deploy` | checkout 1.4.2 ships and crashes on expired coupon codes | `HighErrorRate` on checkout and gateway |
| `memory-leak` | inventory's memory climbs toward its limit | `MemoryNearLimit` on inventory |
| `payments-latency` | payments hangs, and checkout times out waiting for it | `HighLatency` on payments, `HighErrorRate` on checkout and gateway |
| `traffic-spike` | flash-sale traffic exhausts payments' processor connections | `WorkerPoolSaturated` on payments |

`npm run scenario -- status` shows what is currently injected, and
`npm run scenario -- reset` puts everything back.
