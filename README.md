# OpsPilot

An AI incident-response copilot for Kubernetes. OpsPilot watches a running system and turns
alerts into incidents. It works out what changed and why things broke, then proposes a fix.
Once a human approves, it runs the fix, checks that it worked, and writes the postmortem.

> **Status: Phase 3 of 6.** Alerts become incidents with a timeline, a blast radius and a
> live AI investigation that cites its evidence. See the [roadmap](docs/ROADMAP.md) for what
> comes next, and the [requirements](docs/REQUIREMENTS.md) for the full scope.

## What it does today

1. **Detects.** Alertmanager sends alerts to OpsPilot, which groups related alerts into one
   incident using the service dependency graph.
2. **Adds context.** It tracks every change in the cluster (deploys, scaling, config,
   restarts, Kubernetes warnings), merges them with the alerts into a single timeline, and
   works out which service a failure most likely started in and which services it reaches.
3. **Investigates.** A Gemini-powered agent queries Prometheus, Loki, Tempo and Kubernetes
   through read-only tools, then ranks root-cause hypotheses. Every claim cites the exact
   query and result behind it.
4. **Shows it live.** A React console streams all of this as it happens: charts synced with
   the timeline, an interactive dependency map, and the investigation step by step.

## Architecture

```
            customers (loadgen)
                   │
┌──────────────────▼──────── shop namespace ─────────────────────┐
│ gateway ──> checkout ──> inventory, payments                    │
└───────┬───────────────────────────────┬────────────────────────┘
   traces + logs (OTLP)            /metrics scrape         Kubernetes API
        │                               │                       │
 OpenTelemetry Collector ─────────> Prometheus ──> Alertmanager │
   │            │   service graph       │              │ webhook│
 Tempo        Loki                      │              ▼        ▼
   └────────────┴──── queries ──────────┴────────> OpsPilot server ──> MongoDB Atlas
                                                   │     │
                                          Gemini API     │ REST + live events (SSE)
                                                         ▼
                                                  OpsPilot web console
```

## Repository layout

```
apps/server/   OpsPilot API: ingestion, correlation, change tracking, AI investigation
apps/web/      OpsPilot console (React)
demo/          the online shop that OpsPilot watches, plus its load generator
deploy/k8s/    Kustomize manifests: base/ for everything, overlays/local/ for minikube
docs/          requirements, roadmap and AI evaluation results
scripts/       local cluster, failure scenarios, dev runner and evaluation
```

## Running it locally

You need Docker Desktop, minikube, kubectl and Node.js 22 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`: a MongoDB connection string, an admin email and password, and a free
[Gemini API key](https://aistudio.google.com/apikey). Then:

```bash
npm run cluster:up
npm run dev
```

`cluster:up` creates the cluster, deploys the shop and the observability stack, and
generates the two internal secrets in `.env`. `dev` starts the API on :4000 and the console
on http://localhost:5173. Sign in with the admin account from `.env`.

| Also running | Where |
|------|-------|
| Shop API | http://localhost:18080/api/products |
| Grafana | http://localhost:13000 |
| Prometheus | http://localhost:19090 |
| Alertmanager | http://localhost:19093 |

`npm run cluster:stop` pauses the cluster, `npm run cluster:down` deletes it, and
`npm run cluster:status` shows what's running.

## Breaking things on purpose

```bash
npm run scenario -- list
```

| Scenario | What happens | What OpsPilot should conclude |
|----------|--------------|-------------------------------|
| `bad-deploy` | checkout 1.4.2 ships and crashes on expired coupon codes | bad deploy of checkout, roll back |
| `memory-leak` | inventory's memory climbs toward its limit | memory leak in inventory, restart |
| `payments-latency` | payments hangs, and checkout times out waiting for it | payments is the slow dependency, restart |
| `traffic-spike` | flash-sale traffic exhausts payments' processor connections | payments is saturated, scale up |

Within about three minutes an incident opens in the console, and about a minute later the
investigation starts. `npm run scenario -- reset` puts everything back.

## Checks

```bash
npm test            # unit tests
npm run lint        # ESLint
npm run evaluate    # runs every scenario 5 times and scores the AI (writes docs/evaluation.md)
```
