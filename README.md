# OpsPilot

An AI incident-response copilot for Kubernetes. OpsPilot watches a running system and turns
alerts into incidents. It works out what changed and why things broke, then proposes a fix.
Once a human approves, it runs the fix, checks that it worked, and writes the postmortem.

> **Status: Phase 4 of 6.** Alerts become incidents with a timeline, a blast radius and a
> live AI investigation that cites its evidence, the team's runbooks and similar past
> incidents. See the [roadmap](docs/ROADMAP.md) for what comes next, and the
> [requirements](docs/REQUIREMENTS.md) for the full scope.

## What it does today

1. **Detects.** Alertmanager sends alerts to OpsPilot, which groups related alerts into one
   incident using the service dependency graph.
2. **Adds context.** It tracks every change in the cluster (deploys, scaling, config,
   restarts, Kubernetes warnings), merges them with the alerts into a single timeline, and
   works out which service a failure most likely started in and which services it reaches.
3. **Investigates.** A Gemini-powered agent queries Prometheus, Loki, Tempo and Kubernetes
   through read-only tools, then ranks root-cause hypotheses. Every claim cites the exact
   query and result behind it.
4. **Remembers.** The Markdown runbooks in [`runbooks/`](runbooks) and every resolved
   incident are embedded locally (transformers.js) and searched by meaning with Atlas Vector
   Search. Each incident shows the closest runbook sections and similar past incidents with
   what fixed them, and the agent reads both as evidence.
5. **Shows it live.** A React console streams all of this as it happens: charts synced with
   the timeline, an interactive dependency map, the investigation step by step, and a
   searchable runbook library.

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
                                                   │     │    ▲        (+ Vector Search)
                                          Gemini API     │    └── runbooks/*.md, embedded
                                                         │        locally with transformers.js
                                                         │ REST + live events (SSE)
                                                         ▼
                                                  OpsPilot web console
```

## Repository layout

```
apps/server/   OpsPilot API: ingestion, correlation, change tracking, AI investigation,
               runbook search and incident memory (src/knowledge/)
apps/web/      OpsPilot console (React)
demo/          the online shop that OpsPilot watches, plus its load generator
deploy/k8s/    Kustomize manifests: base/ for everything, overlays/local/ for minikube
docs/          requirements, roadmap and AI evaluation results
runbooks/      the shop's runbooks in Markdown, indexed by OpsPilot on every start
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

On its first start the server downloads the embedding model (about 23 MB, cached
afterwards) and creates two Atlas Vector Search indexes, which takes a minute or two. Until
then runbook search and similar incidents say they are still starting; everything else works
right away. Your Atlas cluster's Network Access list must include your IP address.

To add or change a runbook, edit the Markdown in `runbooks/` and restart the server. Each
file has a little front matter (services, alerts, cause types, recommended actions), a
`# Title`, an introduction and `## ` sections. Only files that changed are embedded again.

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
