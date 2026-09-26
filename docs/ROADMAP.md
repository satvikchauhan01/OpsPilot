# OpsPilot — Roadmap

The build happens in six phases. Each one ends with a review, and the next phase starts
only after the current one has been committed. IDs such as `DS-5` refer to
[REQUIREMENTS.md](REQUIREMENTS.md), which defines what "done" means.

| Phase | Theme | Status |
|-------|-------|--------|
| 1 | Foundation: demo system, Kubernetes, observability | Done |
| 2 | Incident core: ingestion, correlation, changes, timeline, topology, UI shell | Done |
| 3 | AI investigation and root-cause analysis | Done |
| 4 | Knowledge: runbook RAG and incident memory | Done, in review |
| 5 | Remediation: approval, execution, verification | Not started |
| 6 | Postmortems, hardening and public deployment | Not started |

---

## Phase 1 — Foundation

**Goal:** a realistic production system to break, fully observable and running on local
Kubernetes.

- [x] Repository layout, root scripts and conventions
- [x] Demo shop with `gateway`, `checkout`, `payments`, `inventory` and `loadgen` — DS-1 to DS-4
- [x] Failure scenarios S1–S4 and `reset` — DS-5
- [x] minikube environment with one-command up and down — DS-6
- [x] OpenTelemetry Collector, Prometheus, Alertmanager, Loki, Tempo, Grafana and kube-state-metrics — OB-1, OB-2
- [x] Alert rules and the Grafana service-health dashboard — OB-3, OB-4

**Exit criteria:** every scenario fires its alert within 3 minutes, `reset` returns
everything to green within 5 minutes, and Grafana shows all four services.

**Needs from you:** nothing.

**Verification (2026-09-25, minikube, Kubernetes 1.34):**

| Scenario | Root-cause alert firing after | Also firing | Back to green after `reset` |
|----------|-------------------------------|-------------|-----------------------------|
| S1 `bad-deploy` | `HighErrorRate` checkout, 124 s | `HighErrorRate` gateway | 59 s |
| S2 `memory-leak` | `MemoryNearLimit` inventory, 140 s | none | 43 s |
| S3 `payments-latency` | `HighLatency` payments, 107 s | `HighErrorRate` checkout and gateway, `HighLatency` checkout and gateway | 123 s |
| S4 `traffic-spike` | `WorkerPoolSaturated` payments, 134 s | `HighErrorRate` and `HighLatency` on payments, checkout and gateway | 144 s |

- DS-1 and DS-2: a checkout trace covers all four services in 11 spans, and the error log
  of a failed checkout is found again in Loki through its trace id.
- DS-4: 2 replicas per service, probes and limits on every container, and
  `revisionHistoryLimit: 10`. No pod restarted or was OOM-killed during the runs.
- OB-2: `traces_service_graph_request_total` has every edge, including `user → gateway`.
- OB-4: Grafana's Prometheus, Loki and Tempo datasources pass their health checks, and the
  dashboard is provisioned.

---

## Phase 2 — Incident core

**Goal:** alerts turn into incidents with full context, and the UI shows them live.

- [x] `apps/server`: Express API, config, MongoDB connection and data models (on MongoDB Atlas M0)
- [x] Sign-in with roles and a seeded admin — SE-1, SE-2
- [x] Alertmanager webhook with a shared secret — IN-1
- [x] Correlation engine and incident lifecycle — IN-2, IN-3
- [x] Kubernetes change tracker for Deployments and warning events — IN-4
- [x] Incident timeline — IN-5
- [x] Dependency graph and blast radius from service-graph metrics — IN-6
- [x] Live updates with Server-Sent Events — IN-7
- [x] `apps/web`: design system, app shell, overview, incident list and incident detail
  (timeline, topology, metrics) — UI-1 (partial), UI-2 to UI-5
- [x] Unit tests for correlation, blast radius and timeline merging — QA-1 (partial)

**Exit criteria:** S1 and S3 each produce exactly one incident whose timeline and blast
radius are correct, and the UI updates without a refresh.

**Needs from you:** the MongoDB Atlas connection string (a free M0 cluster), provided on 2026-09-26.

**Verification (2026-09-25):**

- IN-1: a webhook call with a wrong token gets `401` and nothing is stored.
- IN-2: S1 produced one incident (checkout and gateway alerts). S3 produced one incident, INC-2,
  whose five alerts on payments, checkout and gateway arrived within the same second.
- IN-3: incidents move `open → investigating` when the AI starts and are resolved by responders
  or automatically after 5 quiet minutes. Illegal transitions are refused.
- IN-4: in S1 the timeline shows `checkout 1.4.1 → 1.4.2` (change-cause "release 1.4.2") at
  16:31:52 and the rollout finishing 9 s later, before the first alert at 16:33:46.
- IN-5: one timeline merges changes, Kubernetes events, alerts, status changes and AI runs.
  Repeated probe warnings fold into single entries with a count (×14, ×9…).
- IN-6: for INC-2 the map marks payments as the likely origin, with checkout and gateway
  impacted and the failing calls animated.
- IN-7: the new-incident banner, status line and service board updated live, without a refresh.
- UI: overview, incident list (with `j`/`k`/Enter) and incident detail, in dark and light themes
  and at 375 px. Every chart has a legend, a crosshair tooltip, keyboard reading and a table view.
- QA-1 (partial): 50 unit tests pass (`npm test`), and `npm run lint` is clean.
- Atlas (2026-09-26): the first runs used a local MongoDB. Moving to Atlas only took the connection
  string. On Atlas, S1 opened INC-1 after 132 s, and its timeline showed the deploy before the
  first alert. The AI named checkout / `bad_deploy` in 3 model calls.

---

## Phase 3 — AI investigation and RCA

**Goal:** every incident gets an evidence-backed root-cause analysis.

- [x] Gemini provider adapter with retries, backoff and a quota budget — C-4, AI-4
- [x] Telemetry tools: PromQL, LogQL, trace search, change history, workload status — AI-2
- [x] Investigator agent with a bounded loop and schema-validated output — AI-1, AI-3
- [x] Evidence model that links each claim to its query and result — AI-3
- [x] Streaming investigation view in the UI — AI-5
- [x] Scenario evaluation run recorded in `docs/evaluation.md` — AI-6, QA-5

**Exit criteria:** the correct root cause is ranked first for S1–S4 (at least 4 of 5 runs
each).

**Needs from you:** a Gemini API key from Google AI Studio (free, no card needed).

**Verification (2026-09-26, `gemini-3.5-flash-lite`):**

- AI-6: 18 of 20 runs ranked the right service and cause first: S1 5/5, S2 4/5, S3 4/5,
  S4 5/5 (see [evaluation.md](evaluation.md)). Both misses named the right service with the
  wrong cause type (`resource_saturation` instead of a leak or a slow dependency).
- AI-1: each incident was investigated automatically about a minute after it opened, and the
  incident moved to `investigating`. "Investigate again" starts a manual run.
- AI-2 and AI-3: findings cite evidence ids that the validator checks against what was actually
  queried. The UI opens each citation to show its tool, arguments and the exact result.
- AI-4: the 20 investigations used 98 model calls in total (5 on average, 12 at most) and took
  2–90 s each. When the primary model is overloaded or out of quota, the investigation hands
  over to the fallback model, and the new model starts with all the evidence collected so far.
- AI-5: steps stream into the incident page while the investigation runs.

---

## Phase 4 — Knowledge

**Goal:** OpsPilot uses runbooks and remembers past incidents.

- [x] Runbook corpus: 8 runbooks in [`runbooks/`](../runbooks) — KN-1
- [x] Chunking, local embeddings (transformers.js) and the Atlas vector index — KN-1, C-5
- [x] Runbook retrieval in the agent and on the incident page — KN-2
- [x] Incident memory and similar-incident search — KN-3, KN-4
- [x] Runbook browser page — KN-5

**Exit criteria:** incidents show relevant runbook sections, and a repeated S1 finds its
earlier occurrence.

**Needs from you:** nothing (the server creates the vector indexes itself).

**Verification (2026-09-26, MongoDB Atlas M0, `Xenova/all-MiniLM-L6-v2`):**

- KN-1: 8 runbooks cover every alert rule and every cause type. Unit tests check that each one
  parses, fits the embedding model's input, and only names alerts that exist in the Prometheus
  rules. They are split into 44 chunks, embedded on the server's CPU (the model loads in
  about 5 s, and a query takes about 7 ms), and stored with the `runbook_chunks` index. On
  restart only changed files are embedded again. Atlas built both indexes on the free tier
  in under 40 s.
- KN-2: an incident is described by the service it starts in and that service's own symptoms,
  the other services affected, and the net changes to it in the 30 minutes before. Once the
  root cause is known, it is added, and only runbooks written for that cause type are searched.
  Every investigation opens with this runbook search, and its findings can cite the result.
  On S3 the AI also searched the runbooks on its own and cited them (E9).
- Retrieval checks against the real incidents picked the wording. For chunks: title, heading
  and the section's prose put the right runbook first in 8 of 9 test queries, and adding the
  alert names dropped that to 6. For incidents: listing every symptom in firing order found
  the right runbook first for 7 of the 9 incidents, and missed both S4 ones. There the
  saturation alert fires last, behind the errors it causes upstream. Describing the starting
  service's own symptoms first finds it for all 9, and every incident page shows the
  runbook for its scenario.
- KN-3: every resolved incident is stored in `incident_memory` with its symptoms, the changes
  before it, the root cause, and what fixed it. The fix is the net change made while its
  alerts were firing, or else the resolver's note. Changes are netted, so a release rolled
  back inside the window counts as nothing. Only changes on the service where the incident
  starts describe it. Before that, leftover deploys and rollbacks from earlier scenarios made
  unrelated incidents look 70–80% alike. The postmortem is added in Phase 6 (PM-3).
- KN-4: S1 run a second time opened INC-2, which lists INC-1 first, with "bad deploy in
  checkout" as the cause and "checkout 1.4.2 → 1.4.1" as the fix. The AI saw it before its own
  conclusion and cited it (E5) next to the deploy (E4) and the error logs (E7), in 2 model
  calls. Across INC-1 to INC-9, every repeat lists its earlier occurrence first at 92–98%.
  Look-alikes with another cause (S3 and S4 both slow payments down) appear lower, at 77–83%.
  Unrelated incidents stay below the 0.65 cut-off: at most 0.57.
- KN-5: the Runbooks page searches by meaning ("pods keep dying" finds the crash-loop
  runbook, 63–77%). It keeps the search in the URL, highlights the linked section, and works
  at 375 px and in both themes. It loads separately, which keeps the main bundle at 398 kB.
- AI-6 still holds with the Phase 4 agent. A check of one run per scenario
  (`npm run evaluate -- --runs 1 --report …`) got 4 of 4 right, at 100% confidence, in 2 to 7
  model calls each (INC-10 to INC-13). The full five-run evaluation in
  [evaluation.md](evaluation.md) is from Phase 3. It is repeated once Phase 5 has changed the
  agent again.

---

## Phase 5 — Remediation

**Goal:** approved fixes run safely against Kubernetes and are verified.

- [ ] Action catalog (rollback, restart, scale) with parameter validation — RM-1
- [ ] Action recommendation from the RCA and runbooks — RM-2
- [ ] Approval workflow and audit log — RM-3, RM-5
- [ ] Least-privilege executor service account — RM-4
- [ ] Post-action verification against SLIs — RM-6
- [ ] Approval, execution and verification UI, plus the audit log page — UI-1
- [ ] Tests for action validation and verification — QA-1

**Exit criteria:** RM-7 passes for all four scenarios through the UI.

**Needs from you:** nothing.

---

## Phase 6 — Postmortems, hardening and deployment

**Goal:** close the incident loop and put OpsPilot on the internet.

- [ ] Postmortem generation, editing and Markdown export — PM-1 to PM-3
- [ ] Public demo mode with guest sessions, cooldowns and auto-reset — DP-4, SE-1
- [ ] Security pass covering rate limits, headers, CORS, validation and exposure — SE-3 to SE-6
- [ ] Container images for the server and web apps — DP-1
- [ ] `cloud` Kustomize overlay with persistent volumes, ingress and TLS — DP-2, DP-3, DP-5
- [ ] Deploy to a free VM running k3s — C-8, DP-2
- [ ] README with architecture, screenshots and a walkthrough, plus final lint and tests — QA-2 to QA-4
- [ ] Full acceptance run against REQUIREMENTS.md — Definition of done

**Exit criteria:** the Definition of Done in REQUIREMENTS.md is met.

**Needs from you:** a VM (Oracle Cloud Always Free is the best fit, and Azure for Students
works if you can't add a card) and a free domain or subdomain.
