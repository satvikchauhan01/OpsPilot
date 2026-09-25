# OpsPilot — Requirements

This file is the scope contract for OpsPilot. The project is **done only when every
requirement below is implemented and its check has been run and passed**. Nothing is
dropped or weakened quietly: if a requirement has to change, this file changes first,
with the reason written next to it.

Every requirement has an ID. The [roadmap](ROADMAP.md), tests and commit messages refer
to these IDs.

---

## 1. Constraints

- **C-1 Zero cost.** Every external service runs on a free tier. Everything else is
  self-hosted inside the Kubernetes cluster.
- **C-2 JavaScript only.** Node.js 22 for the backend, the demo system and all scripts.
  React (JavaScript) for the UI. No TypeScript, no Python.
- **C-3 Database.** MongoDB Atlas free tier (M0). Connection strings only come from
  environment variables or Kubernetes Secrets.
- **C-4 LLM.** Google Gemini free tier, called only through OpsPilot's provider adapter.
  The model name is configuration, not code.
- **C-5 Embeddings** are computed locally with transformers.js. No paid embedding API.
- **C-6 Kubernetes is the remediation target.** Local development runs on minikube and
  the public deployment runs on single-node k3s.
- **C-7 Telemetry stack.** OpenTelemetry for traces and logs, Prometheus for metrics,
  Loki for logs, Tempo for traces and Grafana for dashboards.
- **C-8 Public.** The finished system can be reached over HTTPS on the internet.
- **C-9 No CI/CD pipelines.** Deploy history comes from Kubernetes itself (see IN-4).

---

## 2. Demo production system

OpsPilot needs a real system to watch and repair. The demo system is a small online shop.

- **DS-1 Services.** Four Node.js services: `gateway`, `checkout`, `payments` and
  `inventory`. The gateway calls checkout and inventory, and checkout calls inventory
  and payments.
  *Check:* a checkout request produces one trace in Tempo that spans all four services.
- **DS-2 Telemetry.** Every service exposes Prometheus metrics (request rate, errors,
  latency histogram, process memory), exports OpenTelemetry traces, and writes structured
  JSON logs that carry trace IDs and are shipped to Loki.
  *Check:* for one failed request you can go from its trace to its log lines in Grafana.
- **DS-3 Traffic.** A load generator sends continuous baseline traffic and can run a
  temporary spike on command.
- **DS-4 Production-like workloads.** Every service runs at least 2 replicas and has
  liveness and readiness probes, resource requests and limits, and a rollout history of at
  least 5 revisions.
- **DS-5 Failure scenarios.** Four reproducible scenarios, each started with one command
  and fully undone by `reset`:

  | ID | Scenario | What breaks | Correct fix |
  |----|----------|-------------|-------------|
  | S1 | `bad-deploy` | checkout release 1.4.2 crashes on expired coupon codes | roll back checkout |
  | S2 | `memory-leak` | inventory leaks memory until it is close to its limit | restart inventory |
  | S3 | `payments-latency` | payments hangs on card-processor calls, and checkout and gateway degrade | restart payments |
  | S4 | `traffic-spike` | flash-sale traffic saturates the payments worker pool | scale payments |

  *Check:* each scenario fires at least one alert within 3 minutes, and `reset` brings every
  alert back to green within 5 minutes.
- **DS-6 One-command environment.** One command creates the local cluster and deploys
  everything. One command tears it down.

---

## 3. Observability

- **OB-1 Stack.** The cluster runs the OpenTelemetry Collector, Prometheus, Alertmanager,
  Loki, Tempo, Grafana and kube-state-metrics.
- **OB-2 Service graph.** Service-to-service request metrics (caller, callee, rate,
  failures) are derived from traces and stored in Prometheus.
- **OB-3 Alert rules.** There are rules for high error rate, high latency, memory near its
  limit, crash-looping pods, worker-pool saturation, unavailable replicas and targets that
  are down. Every alert has a `service` label and a `severity` label.
- **OB-4 Grafana.** Grafana comes provisioned with every datasource and a service-health
  dashboard, and links from traces to logs work.

---

## 4. Incident detection and context

- **IN-1 Alert ingestion.** Alertmanager sends firing and resolved alerts to OpsPilot
  through a webhook protected by a shared secret.
  *Check:* a request with a missing or wrong secret gets `401` and stores nothing.
- **IN-2 Correlation.** Two alerts join the same open incident when they fire inside the
  correlation window (default 5 minutes) and they involve the same service or services that
  are connected in the dependency graph. Unrelated alerts open separate incidents.
  *Check:* S3 (alerts on payments, checkout and gateway) creates exactly one incident.
- **IN-3 Incident lifecycle.** Incidents move through the states `open`, `investigating`,
  `mitigating` and `resolved`. An incident's severity is the highest severity among its
  alerts. It resolves when all of its alerts have been resolved for 5 minutes, or when a
  responder resolves it by hand.
- **IN-4 Change tracking.** OpsPilot watches the monitored namespace in Kubernetes. It
  records Deployment image, replica and environment changes with before and after values,
  plus rollout progress. It also records warning events such as `OOMKilled`, `BackOff`,
  `Unhealthy` and `FailedScheduling`.
  *Check:* in S1, the incident timeline shows `checkout 1.4.1 → 1.4.2` before the first
  alert.
- **IN-5 Timeline.** Every incident has one chronological timeline that merges alerts,
  changes, Kubernetes events, investigation steps, actions and status changes.
- **IN-6 Topology and blast radius.** OpsPilot builds the dependency graph from the
  service-graph metrics. For an incident it marks the suspected service and every
  upstream service affected by it, with current error rates.
- **IN-7 Live updates.** The UI shows a new alert or incident change within 5 seconds,
  without a page refresh.

---

## 5. AI investigation and root-cause analysis

- **AI-1 Automatic start.** An investigation starts automatically when an incident opens,
  and a responder can start it again by hand.
- **AI-2 Tool-based investigation.** The agent gathers data only through tools: PromQL
  instant and range queries, LogQL queries, trace search, change history, Kubernetes
  workload status, runbook search (from Phase 4) and similar incidents (from Phase 4).
  Raw telemetry is never dumped into the prompt.
- **AI-3 Evidence-backed output.** The result is a ranked list of at most 3 root-cause
  hypotheses. Each has a confidence, the affected service, and at least one evidence item
  that links to the exact query and result behind it. The output is validated against a
  schema. Invalid output is retried once and then fails visibly.
- **AI-4 Guardrails.** Each investigation has a limit on tool calls (default 15), time and
  tokens. OpsPilot backs off on `429` rate-limit responses, and running all four scenarios
  in a row stays inside the free-tier quota.
- **AI-5 Live progress.** Investigation steps stream to the UI while they run.
- **AI-6 Accuracy.** For each scenario S1–S4, the correct root cause (right service and
  right cause type) is ranked first in at least 4 out of 5 runs. The results are recorded
  in `docs/evaluation.md`.

---

## 6. Knowledge: runbooks and incident memory

- **KN-1 Runbook corpus.** The repository has at least 6 Markdown runbooks covering the
  demo services and failure types. They are split into chunks, embedded locally and stored
  in Atlas with a vector index.
- **KN-2 Runbook retrieval.** Each incident shows the most relevant runbook sections with
  their scores, and the agent can cite them.
- **KN-3 Incident memory.** Every resolved incident (summary, symptoms, root cause, fix,
  postmortem) is embedded and stored.
- **KN-4 Similar incidents.** A new incident shows up to 3 similar past incidents, with
  their similarity score and what fixed them. The agent uses them as evidence.
  *Check:* if S1 is run twice, the second incident lists the first as its most similar.
- **KN-5 Runbook browser.** The UI has a searchable runbook page.

---

## 7. Remediation

- **RM-1 Closed action catalog.** The only actions are: roll back a Deployment to its
  previous revision, rolling restart, and scale (1–6 replicas). The LLM can only propose
  actions from this catalog, and their parameters are validated. OpsPilot never runs
  arbitrary commands.
- **RM-2 Recommendation.** Every incident with a root cause gets a proposed action, with
  a reason that links back to the RCA and the runbook.
- **RM-3 Human approval.** An action runs only after a signed-in user with the responder
  role approves it. Rejections are stored with their reason.
- **RM-4 Least privilege.** The executor's Kubernetes service account can only get, list,
  watch and patch Deployments (including the scale subresource) in the demo namespace.
  *Check:* `kubectl auth can-i` shows it cannot touch any other namespace or resource type.
- **RM-5 Audit log.** Every proposal, approval, rejection, execution and result is stored
  with who, when, parameters and outcome. Audit records cannot be edited and are visible in
  the UI.
- **RM-6 Verification.** After an action runs, OpsPilot compares the incident's SLIs (error
  rate, p95 latency, memory, saturation) against their thresholds over a verification window
  (default 3 minutes). The outcome is `verified` or `failed`. A failed verification sends
  the incident back to `investigating`.
- **RM-7 End to end.** Through the UI, S1 is fixed by rollback, S2 by restart, S3 by
  restarting payments and S4 by scaling, and each fix is verified.

---

## 8. Postmortems

- **PM-1 Generation.** On resolution, OpsPilot drafts a postmortem with a summary, impact
  (duration and affected services), timeline, root cause, resolution, what went well and
  badly, and action items.
- **PM-2 Editing and export.** The postmortem can be edited in the UI and exported as
  Markdown.
- **PM-3 Memory.** The final postmortem is saved into incident memory (KN-3).

---

## 9. User interface

- **UI-1 Pages.** Overview (service health and open incidents), incident list with filters,
  incident detail (timeline, topology and blast radius, metrics, investigation, runbooks,
  similar incidents, actions, postmortem), runbooks, audit log and demo control.
- **UI-2 Own visual identity.** The UI has its own design tokens and typography, and light
  and dark themes. It doesn't use stock "AI app" looks: no purple gradients, glassmorphism,
  emoji icons or generic card grids.
- **UI-3 Interactive.** Data updates live. Hovering the timeline highlights the same moment
  on the metric charts. The dependency graph can be clicked to focus a service. There are
  keyboard shortcuts for navigation and a shortcut help overlay.
- **UI-4 Responsive and accessible.** The UI is usable at 375 px wide, works fully from the
  keyboard with visible focus, and meets WCAG AA contrast.
- **UI-5 States.** Every data view has an empty state, a loading state and an error state.

---

## 10. Security

- **SE-1 Authentication and roles.** Sign-in uses email and password, with passwords hashed
  with bcrypt and the session in an httpOnly cookie. The roles are `viewer`, `responder` and
  `admin`, and the first admin comes from environment variables. Public visitors can use a
  one-click guest session that is limited to the demo sandbox.
- **SE-2 Protected mutations.** Every endpoint that changes data checks the user's role.
  The webhook checks its shared secret (IN-1).
- **SE-3 Secrets.** No secret is ever committed. `.env.example` documents every variable,
  and the cluster uses Kubernetes Secrets.
- **SE-4 Rate limits.** Sign-in, LLM-triggering and demo endpoints are rate limited.
- **SE-5 Minimal exposure.** Only the OpsPilot UI and API are public. Prometheus, Loki,
  Tempo, Alertmanager and the demo services stay inside the cluster, and Grafana is either
  internal or behind a login.
- **SE-6 Input hygiene.** Every API input is validated with schemas. Security headers are
  set and CORS is restricted to the UI's origin.

---

## 11. Deployment

- **DP-1 Containers.** The OpsPilot server and UI are built as multi-stage images that run
  as a non-root user.
- **DP-2 One procedure.** Everything deploys to a single-node k3s cluster on a free VM
  through a Kustomize `cloud` overlay, following one documented procedure.
- **DP-3 HTTPS.** The site has a publicly trusted certificate on a free domain or subdomain.
- **DP-4 Public demo mode.** Visitors can trigger S1–S4 from the UI. Only one scenario can
  be active at a time, there is a cooldown between runs, and the system resets itself after
  20 minutes.
- **DP-5 Resilience.** Every component restarts on its own after a failure or a VM reboot.
  Telemetry data lives on persistent volumes with a retention limit.
- **DP-6 Free-tier budget.** Demo rate limits keep Gemini usage inside the free quota.

---

## 12. Quality

- **QA-1 Tests.** There are automated tests for correlation, blast radius, timeline merging,
  action validation, verification logic and LLM output parsing, and `npm test` passes.
- **QA-2 Lint.** ESLint and Prettier are configured and `npm run lint` is clean.
- **QA-3 Code style.** Comments explain the reasons behind the code. There is no
  commented-out code and no dead code, and the folder layout matches the one in the README.
- **QA-4 README.** The README covers the overview, an architecture diagram, screenshots or a
  GIF, local setup, deployment and a demo walkthrough.
- **QA-5 Evaluation.** `docs/evaluation.md` holds the AI-6 results.

---

## 13. Out of scope

- Monitoring third-party systems, multi-tenancy or multiple clusters
- CI/CD pipelines
- Paid services of any kind
- SSO/OAuth sign-in, mobile apps
- Chat or email notifications
- Executing any action outside the RM-1 catalog

---

## Definition of done

1. Every requirement above is ticked off in the roadmap and has proof next to it (a test,
   a command output, a screenshot or a document).
2. The full demo (S1–S4, from detection to verified fix to postmortem) works on the
   public URL.
