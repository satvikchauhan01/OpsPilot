# Acceptance

Every requirement in [REQUIREMENTS.md](REQUIREMENTS.md), with the proof that it holds. Most
proofs are recorded with the phase that built the feature, in the [roadmap](ROADMAP.md);
this page points to them and adds the checks run for Phase 6.

Status: every requirement is met, locally and on the public deployment at
https://opspilot-main.duckdns.org (checked on 2026-10-18).

## Constraints

| ID | Proof |
|----|-------|
| C-1 Zero cost | Atlas M0, the Gemini free tier and local embeddings. The deployment uses an Azure for Students VM (paid from the free student credit, no card), a DuckDNS name, Let's Encrypt, and a Gemini relay on Vercel's free Hobby plan ([DEPLOYMENT.md](DEPLOYMENT.md)). |
| C-2 JavaScript only | `git ls-files` lists no `.ts`, `.tsx` or `.py` file. The server, the shop and the scripts run on Node.js 22. The console is React in JavaScript. |
| C-3 Database | `MONGODB_URI` comes only from `.env` locally, and from the `opspilot-server` Secret in the cloud (`apps/server/src/config.js`, `scripts/cloud.mjs`). |
| C-4 LLM | Every model call goes through `apps/server/src/llm/gemini.js`. The models are `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL`. Gemini refuses the public VM's region (Hong Kong), so there the calls go out through `deploy/gemini-relay`, which passes them on unchanged from Washington, D.C. |
| C-5 Embeddings | transformers.js with all-MiniLM-L6-v2 on the server's CPU (`apps/server/src/knowledge/embedding-model.js`). The container image carries the model. |
| C-6 Kubernetes | minikube locally (`npm run cluster:up`). The cloud overlay targets single-node k3s. |
| C-7 Telemetry stack | `deploy/k8s/base/observability`: OpenTelemetry Collector, Prometheus, Alertmanager, Loki, Tempo, Grafana and kube-state-metrics. |
| C-8 Public | https://opspilot-main.duckdns.org answers over HTTPS with a Let's Encrypt certificate, valid until 15 January 2027 (see DP-3). |
| C-9 No CI/CD | There is no pipeline configuration. Deploys come from `npm run cloud -- deploy`, and deploy history from Kubernetes' own rollout history (IN-4). |

## Demo system and observability

| ID | Proof |
|----|-------|
| DS-1 to DS-4 | Phase 1 verification: an 11-span trace across all four services, trace-to-logs in Loki, 2 replicas with probes and limits, `revisionHistoryLimit: 10`. |
| DS-5 | Phase 1 table: each scenario alerted within 107–140 s, and `reset` was green within 43–144 s. In Phase 6 all four also start and reset from the demo page (see DP-4). |
| DS-6 | `npm run cluster:up` / `npm run cluster:down`. |
| OB-1 to OB-4 | Phase 1 verification: every service-graph edge in Prometheus, alert rules with `service` and `severity`, Grafana datasources healthy and the dashboard provisioned. |

## Incidents

| ID | Proof |
|----|-------|
| IN-1 | Phase 2: a wrong webhook token gets `401` and stores nothing. |
| IN-2 | Phase 2: S3's five alerts on three services made one incident. Again in Phase 6: INC-41 took all of S3's alerts. |
| IN-3 | Phase 2, and in every scenario since: `open → investigating → mitigating → resolved`, resolved automatically after 5 quiet minutes. |
| IN-4 | Phase 2: S1's timeline shows `checkout 1.4.1 → 1.4.2` before the first alert. INC-40's timeline shows it at 14:38:28, before the alert at 14:39:46. |
| IN-5 to IN-7 | Phase 2 verification. |

## AI investigation

| ID | Proof |
|----|-------|
| AI-1 | Phase 3. Guests can start a manual run on an open incident too. They can't re-run resolved ones, which would spend the shared budget (`403`). |
| AI-2 to AI-5 | Phase 3 verification. |
| AI-6 | [evaluation.md](evaluation.md): every scenario 4/5 or better, and the AI was right every time it got to answer. |

## Knowledge

| ID | Proof |
|----|-------|
| KN-1, KN-2, KN-4, KN-5 | Phase 4 verification. |
| KN-3 | Phase 4, and the postmortem since Phase 6. When INC-40's postmortem was made final, its memory was rewritten within a second: it stores the full postmortem, and the embedded description ends with its summary (see PM-3). |

## Remediation

| ID | Proof |
|----|-------|
| RM-1, RM-2, RM-5, RM-6, RM-7 | Phase 5 verification, including RM-7 through the UI for all four scenarios (INC-15, 16, 18, 19). On the public site, S1's rollback (INC-45) and S4's scale-out (INC-47) were both verified. |
| RM-3 | Phase 5. Changed in Phase 6 to let guests approve in the demo (the reason is next to the requirement). INC-40's rollback was approved by "Guest 010d". |
| RM-4 | Re-checked after the executor moved to the `opspilot` namespace. `kubectl auth can-i --as=system:serviceaccount:opspilot:opspilot-executor` says yes to get, list, watch and patch Deployments and patch their scale in `shop`. It says no to update, create and delete, to pods, exec, secrets and ReplicaSets, to `loadgen` and `opspilot`, and to nodes. |

## Postmortems

| ID | Proof |
|----|-------|
| PM-1 | INC-40 (S1, started by a guest from the demo page) was resolved at 14:49:57. Its draft was there at the next check, written by `gemini-3.5-flash-lite`: facts, summary, impact with peak error rates, a 24-line timeline, root cause, resolution, what went well and badly, and one action item. Without a model, a template fills the same structure (unit tests). |
| PM-2 | As a responder in the browser: Edit, a new line typed into "What went well", Preview (rendered, with the task list), Save ("edited by UI check (responder)"). Then Mark as final: the editing buttons disappear. The **.md** button produces `INC-040-postmortem.md` with the edited text (3,020 characters). Guests and viewers get no editing buttons, and the API refuses them (`403`). |
| PM-3 | `incidentmemories` for INC-40, after it was made final: `postmortem` holds the edited document, and the embedded text gained the line `Postmortem: A bad deploy of checkout version 1.4.2 introduced a TypeError…`. |

## User interface

| ID | Proof |
|----|-------|
| UI-1 | Overview, incidents, incident detail (with the postmortem), runbooks, audit log, and now demo control (`g d`). |
| UI-2 | Phase 2 design tokens and IBM Plex type, in dark and light themes (screenshots in the README). |
| UI-3 | Phase 2. The demo page and the postmortem update live (`demo.updated`, `postmortem.updated`), and the shortcut help lists `g d`. |
| UI-4 | Phase 2. The demo page and the postmortem panel are usable at 375 px, with no horizontal scroll, and the navigation scrolls sideways. |
| UI-5 | The postmortem panel has loading, empty ("No postmortem yet"), writing, failed and error states. The demo page has loading, error and "switched off" states. |
| UI-6 | Phase 7. The sidebar shows the open incidents' count (red when one is critical) and a running scenario, and collapses with `[`. Ctrl+K finds "pay" in the payments service, two runbooks and every payments incident, opens `INC-041` from "41", and starts scenarios. |
| UI-7 | Phase 7. `?service=payments` opens payments' panel over any page: its numbers now, 1/6/24 h charts from `GET /api/services/payments/metrics`, callers and calls, the last day's changes, its incidents and its runbooks. |
| UI-8 | Phase 7. `/incidents/40/replay` plays INC-40 from 2 minutes before the first alert to a minute after it resolved. Paused on "Waiting for approval", the map shows checkout as the likely origin and gateway impacted, with both HighErrorRate alerts firing. |
| UI-9 | Phase 7. Over 30 days: 42 incidents, a median of 1 m 23 s to the root cause, 5 m 19 s to a verified fix, 2 m 22 s to resolution, 8 of 9 fixes worked. Each chart has a table view. |
| UI-10 | Phase 7. During INC-42 the console showed "INC-042 opened", "Root cause for INC-042", "Fix waiting for approval · INC-042" and "Fix rolling out · INC-042" as they happened. Browser notifications ask for permission when turned on; the notification itself could not be seen in the test browser. |
| UI-11 | Phase 7. A guest's first visit starts the seven-step tour over the demo page, the overview, the incident list and insights, each step lighting its element. It can be taken again from the demo page or Ctrl+K. |

## Security

| ID | Proof |
|----|-------|
| SE-1 | Phase 2 (bcrypt, httpOnly cookie, roles, admin from the environment). One-click guest sessions (2 h) exist only with `DEMO_MODE=true`. Guests reach the demo shop and nothing else: `403` for postmortem edits, demo resets and the user list. |
| SE-2 | Every route that changes data has `requireRole`. The webhook checks its token (IN-1). |
| SE-3 | No secret in the repository or its history: a search of `git log -p --all` for Atlas credentials and Gemini keys finds none. `.env.example` and `.env.cloud.example` document every setting. In the cloud they become Secrets. The Gemini relay stores no key, since the key comes with each request, and it answers `401` to any request without its token. |
| SE-4 | Rate limits cover sign-in, guest sessions, investigations, postmortem drafts, scenario starts and fixes. Guests are counted by address, so a new session doesn't reset them. Only requests that go through count. |
| SE-5 | The rendered cloud overlay has no NodePort, LoadBalancer, hostPort or hostNetwork. The only way in is the Ingress (`/api` and `/`). Grafana is internal and reached through an SSH tunnel. From outside the VM, ports 3000, 3100, 3200, 4000, 6443, 9090, 9093 and 10250 are closed. |
| SE-6 | Every request input goes through a zod schema: no route reads `req.body`, `req.query` or `req.params` without `parse`. Helmet sets the API's headers. nginx sets a strict CSP (`script-src 'self'`, `frame-ancestors 'none'`…) and the production build runs under it with no violations. Changes from another origin get `403`, and no CORS headers are ever sent. |
| SE-7 | Phase 7, against a scratch database: a responder added on the team page and demoted to viewer while signed in elsewhere got `403` on their very next fix rejection, and `401` once removed. Changing or removing yourself gets `409`, and so does demoting or removing the last admin (unit tested). The audit log holds `user.created`, `user.role_changed` and `user.removed` with names and roles only, and the chain verified. |

## Deployment

| ID | Proof |
|----|-------|
| DP-1 | `apps/server/Dockerfile` and `apps/web/Dockerfile` are multi-stage. The server runs as `node` (uid 1000) and nginx as uid 101. Both ran with a read-only root filesystem: the server reached Atlas and answered `/api/health`, and nginx served the console. The server image is 719 MB, with ONNX Runtime trimmed to Linux CPUs. |
| DP-2 | `deploy/k8s/overlays/cloud` and one procedure, [DEPLOYMENT.md](DEPLOYMENT.md). `npm run cloud -- setup` and `deploy` put everything on an Azure Standard_B2als_v2 VM (2 vCPUs, 4 GiB, Ubuntu 24.04, k3s v1.36.5). The first deploy found two problems, both fixed. The server's pod couldn't prove that its named user isn't root, so it now sets `runAsUser: 1000`. Docker's provenance attestations also gave unchanged shop images new IDs, so every deploy restarted the shop; they're built without them now, and later deploys restart nothing in the shop. The whole stack idles at about 0.2 of a CPU and 2.6 GB. |
| DP-3 | Traefik with a Let's Encrypt HTTP-01 resolver (`traefik.yaml`). The certificate for opspilot-main.duckdns.org arrived during the first deploy. `http://` answers `301` to `https://`, along with HSTS, the CSP, `X-Frame-Options: DENY` and `nosniff`. After a reboot, Traefik loaded the stored certificate instead of asking for a new one. |
| DP-4 | Checked through the API with a 1-minute reset and cooldown. A guest started S2, and a second scenario got `409`. The shop reset itself after a minute, and a scenario during the cooldown got `409`. After the cooldown, a guest started S1 (checkout on 1.4.2), and the admin's reset put 1.4.1 back. S3 and S4 start and reset too. Then S1 ran from the demo page itself, as a guest, through to its postmortem (INC-40). The defaults are a 20-minute reset and a 3-minute cooldown. On the public site, with those defaults: S2 during S1 got `409` ("A bad release is still running, and the shop resets itself at 19:46 UTC"), S1 reset itself at 19:46, and S4 during the cooldown got `409` until it ended at 19:49. |
| DP-5 | Every workload is a Deployment with probes, and k3s runs as a systemd service. Prometheus (3 days, at most 4 GB), Loki (3 days) and Tempo (1 day) keep their data on persistent volumes. After a VM reboot the site answered again within 168 s, with nothing done by hand. Every pod came back with one restart, Prometheus still had the hour before, and the scenario that was running still reset itself on time. OpsPilot recorded the reboot itself as INC-46 (TargetDown on three services), which resolved itself. |
| DP-6 | At most 200 model calls per UTC day, shown on the demo page. One scenario at a time, a 3-minute cooldown, 4 scenarios per person per half hour, and guests may only investigate open incidents. |

## Quality

| ID | Proof |
|----|-------|
| QA-1 | 120 unit tests pass: 14 new in Phase 6 (the postmortem document, roles, rate limit keys, the origin check and image tags) and 12 in Phase 7 (insights statistics, team rules and incident progress). |
| QA-2 | `npm run lint` is clean, and Prettier has formatted every file. |
| QA-3 | The layout matches the README's. |
| QA-4 | The README has the overview, the architecture, screenshots, local setup, deployment and a demo walkthrough. |
| QA-5 | [evaluation.md](evaluation.md). |

## Definition of done

1. Every requirement is ticked off in the roadmap with its proof: Phases 1–5 in the
   [roadmap](ROADMAP.md), Phases 6 and 7 here.
2. The full demo on the public URL: S1 (INC-45) and S4 (INC-47), each started by a guest
   from the demo page, went through the AI's root cause, the guest's approval, a verified
   fix and automatic resolution to the postmortem. Locally, S1 did the same as INC-40.
