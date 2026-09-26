# Deploying OpsPilot

OpsPilot runs publicly on one free virtual machine. [k3s](https://k3s.io) (a small
Kubernetes) runs the demo shop, the observability stack and OpsPilot itself. Traefik, which
comes with k3s, serves the site over HTTPS with a Let's Encrypt certificate. MongoDB Atlas
and Gemini stay where they are.

Everything is driven from your own machine over SSH with one script:

```bash
npm run cloud -- setup    # once: installs Docker and k3s on the VM
npm run cloud -- deploy   # every time: copies the code, builds the images there, deploys
npm run cloud -- status   # what runs, and whether the site answers
```

Everything used here costs nothing: an Always Free VM, a DuckDNS subdomain, Let's Encrypt,
the Atlas M0 cluster and the Gemini free tier.

## What ends up where

```
                    internet
                       │  443 (80 only redirects to HTTPS)
┌──────────────────────▼─────────────── VM: k3s ───────────────────────────────┐
│  Traefik ── /api ──> opspilot-server ──> MongoDB Atlas, Gemini API           │
│     └────── /    ──> opspilot-web (nginx, static console)                    │
│                                                                               │
│  shop: gateway, checkout, payments, inventory      loadgen                    │
│  observability: OTel Collector, Prometheus, Alertmanager, Loki, Tempo, Grafana│
└───────────────────────────────────────────────────────────────────────────────┘
```

Only Traefik listens on the internet. Prometheus, Loki, Tempo, Alertmanager, Grafana and
the shop are cluster-internal services with no NodePort or ingress. SSH is the only other
open port, and the Kubernetes API (6443) stays closed.

## 1. Create the VM

You need about 4 GB of memory for everything. The Oracle Cloud **Always Free** Ampere A1
shape fits with room to spare:

1. In the Oracle Cloud console, go to Compute → Instances → Create instance.
2. Choose the image **Canonical Ubuntu 24.04**. Choose the shape **VM.Standard.A1.Flex**
   with 2 OCPUs and 12 GB of memory (up to 4 and 24 are free).
3. Paste your SSH public key, create the instance, and note its public IP address.
   Reserve the IP (Networking → IP management) so it stays the same.

Then open ports 80 and 443:

- **In the cloud firewall.** On Oracle, open the instance's subnet → its security list,
  and add two ingress rules: source `0.0.0.0/0`, TCP, destination ports `80` and `443`.
- **On the VM.** Oracle's Ubuntu images also filter traffic with iptables:

  ```bash
  ssh ubuntu@<vm-ip>
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save
  ```

Any other Ubuntu VM with 4 GB or more works the same way. Only these firewall steps differ.

## 2. Give it a name

Let's Encrypt needs a domain name that points to the VM. [DuckDNS](https://www.duckdns.org)
provides free subdomains: sign in, create a subdomain (for example
`opspilot-yourname.duckdns.org`), and set its IP address to the VM's public IP. If you
already have a domain, an A record pointing to the VM works too.

Check it before you continue:

```bash
nslookup opspilot-yourname.duckdns.org
```

## 3. Let the VM reach Atlas

In MongoDB Atlas, add the VM's public IP under Network Access.

Keep the same database name as your local setup (`MONGODB_DB=opspilot`). A second database
would need two more vector search indexes, and the free M0 tier allows three in total.

**Don't run the local server while the public one runs.** Both would write to the same
database, and each would mark the other's alerts as resolved, since its own Alertmanager
doesn't know about them.

## 4. Fill in `.env.cloud`

```bash
cp .env.cloud.example .env.cloud
```

| Setting | What goes in it |
|---|---|
| `CLOUD_SSH` | How you reach the VM, e.g. `ubuntu@203.0.113.10` |
| `CLOUD_SSH_KEY` | The private key's path, if it isn't your default key |
| `DOMAIN` | The name from step 2, e.g. `opspilot-yourname.duckdns.org` |
| `MONGODB_URI`, `MONGODB_DB` | The same as in `.env` |
| `GEMINI_API_KEY` | The same as in `.env` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | The admin account. Choose a strong password: this one is public |

`SESSION_SECRET` and `ALERTMANAGER_WEBHOOK_TOKEN` are generated on the first run. The file
is gitignored and never leaves your machine. The deploy script sends these settings to the
cluster over SSH's standard input, where they become Kubernetes Secrets. They never appear
in a command line.

## 5. Install and deploy

```bash
npm run cloud -- setup
npm run cloud -- deploy
```

`setup` installs Docker and k3s with their official install scripts. Run it once.

`deploy` does the following:

1. Copies the repository to `~/opspilot` on the VM: everything git knows about, without
   `.env` files, `node_modules` or build output.
2. Builds every image on the VM (the shop's releases, the load generator, the server and the
   console), so they match its CPU. It then imports them into k3s. No registry is involved.
3. Stores the server's settings and Alertmanager's webhook address as Secrets.
4. Applies `deploy/k8s/overlays/cloud` and waits for every deployment to roll out.
5. Waits for `https://<DOMAIN>/api/health` to answer.

The first deploy takes 10 to 15 minutes, mostly for image builds. Later deploys reuse the
build cache. The first certificate arrives within a minute of the site going up.

Open `https://<DOMAIN>`. The sign-in page offers **Try the demo as a guest**, which leads
to the demo page.

## Operating it

**Updating.** Run `npm run cloud -- deploy` again. Each deploy gets a new image tag, so
Kubernetes rolls the server and the console over to it. Older OpsPilot images are removed
from the VM.

**Reboots and crashes.** k3s runs as a systemd service, and every workload is a Deployment
with health probes. After a crash or a reboot, everything comes back on its own.

**Telemetry storage.** Prometheus keeps 3 days of metrics, capped at 4 GB. Loki keeps 3 days
of logs and Tempo keeps 1 day of traces. All three live on persistent volumes, so a restart
loses nothing.

**Staying inside the free quotas.** The server stops calling Gemini after
`LLM_DAILY_REQUEST_BUDGET` requests (200) per UTC day, and the demo page shows what is left.
Visitors can start one scenario at a time. After a scenario resets there is a 3-minute
cooldown, and the shop resets itself 20 minutes after a scenario starts. Each person can
start 4 scenarios per half hour.

**Logs:**

```bash
ssh ubuntu@<vm-ip> sudo k3s kubectl -n opspilot logs deploy/opspilot-server --tail=100
```

**Grafana** stays internal. Tunnel to it when you need it, then open http://localhost:3000
and sign in as `admin`/`admin`. Nothing but this tunnel can reach it.

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@<vm-ip> sudo k3s kubectl -n observability port-forward svc/grafana 3000:3000
```

## When something is off

| Symptom | Where to look |
|---|---|
| The browser warns about the certificate | Traefik hasn't got one yet. `sudo k3s kubectl -n kube-system logs deploy/traefik \| grep -i acme` on the VM. The domain has to resolve to the VM, and port 80 has to be open, for the HTTP-01 challenge. |
| The site doesn't load at all | Ports 80 and 443 in both firewalls (step 1). `npm run cloud -- status` shows whether the pods run. |
| `opspilot-server` isn't ready | Its log. `MongoServerSelectionError` means the VM's IP is missing from the Atlas access list. |
| No incidents appear | `sudo k3s kubectl -n observability logs deploy/alertmanager` shows whether webhooks reach the server. |
| Guests can't start scenarios | The demo page says why: a scenario is running, the shop is settling, or the person's limit is reached. |
