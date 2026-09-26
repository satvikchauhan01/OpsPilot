# Remaining steps

Phase 6 is built and checked locally. What's left is putting OpsPilot on the internet,
checking it there, and committing. Steps 1 to 4 are yours, since they need your accounts.
Steps 5 to 8 can be done with Claude, who can also run step 5 for you if you share SSH access.

Full detail for the VM steps is in [DEPLOYMENT.md](DEPLOYMENT.md).

## 0. Commit what's built (do this first)

Nothing from Phase 6 is committed yet. Review the changes and commit them, so the deploy in
step 5 builds from a known commit (the image tag includes the commit id).

```bash
git status
git add -A
git commit -m "Phase 6: postmortems, demo mode, hardening, images and cloud overlay"
```

`.env`, `.env.cloud` and `deploy.env` are gitignored. Check `git status` shows none of them.

## 1. Create the VM

1. In Oracle Cloud, create an instance: **Canonical Ubuntu 24.04**, shape
   **VM.Standard.A1.Flex** with 2 OCPUs and 12 GB (Always Free). If you can't get one, any
   Ubuntu VM with 4 GB of memory or more works (Azure for Students, for example).
2. Add your SSH public key and note the **public IP**. Reserve the IP so it never changes.
3. Open ports **80** and **443**:
   - In the cloud firewall (Oracle: subnet → security list → two ingress rules, source
     `0.0.0.0/0`, TCP).
   - On the VM itself (Oracle's Ubuntu image also filters with iptables):

     ```bash
     ssh ubuntu@<vm-ip>
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```

4. Don't open 6443 or anything else. Only 22, 80 and 443 should be reachable.

## 2. Get a domain

1. Sign in at https://www.duckdns.org and create a subdomain, e.g. `opspilot-yourname`.
2. Set its IP to the VM's public IP.
3. Check it resolves:

   ```bash
   nslookup opspilot-yourname.duckdns.org
   ```

Let's Encrypt needs this to work and port 80 to be open, or the certificate won't be issued.

## 3. Let the VM reach Atlas

In MongoDB Atlas → Network Access, add the VM's public IP.

Keep `MONGODB_DB=opspilot`, the same database as local. A different name would need two more
vector search indexes, and the free M0 tier only allows three.

## 4. Fill in `.env.cloud`

```bash
cp .env.cloud.example .env.cloud
```

| Setting | Value |
|---|---|
| `CLOUD_SSH` | `ubuntu@<vm-ip>` |
| `CLOUD_SSH_KEY` | path to your private key, if not the default one |
| `DOMAIN` | e.g. `opspilot-yourname.duckdns.org` |
| `MONGODB_URI`, `MONGODB_DB` | same as in `.env` |
| `GEMINI_API_KEY` | same as in `.env` |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | a **new, strong** admin password, since this site is public |

Leave `SESSION_SECRET` and `ALERTMANAGER_WEBHOOK_TOKEN` empty; the script generates them.

Test that SSH works before going on:

```bash
ssh -i <key> ubuntu@<vm-ip> echo ok
```

## 5. Install and deploy

Stop the local OpsPilot server first (`npm run dev`). If both run against the same
database, each marks the other's alerts as resolved.

```bash
npm run cloud -- setup     # once: Docker and k3s on the VM
npm run cloud -- deploy    # 10-15 minutes the first time
npm run cloud -- status
```

The deploy script has never run against a real k3s, so the first run may need small fixes.
If it stops with an error, paste the error to Claude. Likely spots:

- **Certificate.** If the browser warns about the certificate, look at Traefik's ACME log:
  `sudo k3s kubectl -n kube-system logs deploy/traefik | grep -i acme`. It's almost always
  DNS not pointing at the VM yet, or port 80 closed.
- **Traefik settings.** `deploy/k8s/overlays/cloud/traefik.yaml` is applied through k3s's
  HelmChartConfig. If Traefik doesn't pick it up, restart it:
  `sudo k3s kubectl -n kube-system rollout restart deploy/traefik`.
- **Server not ready.** `MongoServerSelectionError` in its log means the VM's IP isn't on
  the Atlas list yet (step 3).

## 6. Acceptance checks on the public URL

Open `https://<DOMAIN>` and check:

- [ ] The certificate is valid (no warning) and `http://` redirects to `https://`.
- [ ] **Try the demo as a guest** signs you in and lands on the demo page.
- [ ] Start **S1**. An incident opens within about 2 minutes, the AI investigates a minute
      later, and proposes a rollback.
- [ ] Approve the fix as the guest. It rolls out and is **verified**.
- [ ] The incident resolves after 5 quiet minutes, and a **postmortem** appears.
- [ ] Sign in as the admin, edit the postmortem, download the `.md`, mark it final.
- [ ] A second scenario while one runs gets refused, and the shop resets itself after
      20 minutes.
- [ ] Repeat with S2, S3 and S4 (RM-7 on the public URL).
- [ ] Nothing else is reachable from outside. From your own machine, these should time out
      or refuse: `<vm-ip>:9090`, `:3000`, `:6443`, `:3100`.

## 7. Resilience check (DP-5)

Reboot the VM and check everything comes back on its own:

```bash
ssh ubuntu@<vm-ip> sudo reboot
# wait about 2 minutes
npm run cloud -- status
```

All pods should be `Running`, and the site should answer without you doing anything.

## 8. Close out the project

1. Fill in the "pending" rows in [acceptance.md](acceptance.md): C-8, DP-2, DP-3, DP-5 and
   the Definition of Done's second point. Say what you saw.
2. In [ROADMAP.md](ROADMAP.md), tick "Deploy to a free VM" and change Phase 6's status to
   Done.
3. Add the public URL to the top of [README.md](../README.md).
4. Optional: reset the public database for launch (this deletes incidents, memory and
   postmortems from your testing), so visitors see a clean history. Ask Claude first; it
   is not reversible.
5. Commit and push.

## Good to know

- **Updating later:** change the code, commit, and run `npm run cloud -- deploy` again.
- **Logs:**
  `ssh ubuntu@<vm-ip> sudo k3s kubectl -n opspilot logs deploy/opspilot-server --tail=100`
- **Grafana** is internal only. Reach it with an SSH tunnel (see DEPLOYMENT.md).
- **AI budget:** 200 model calls per day. The demo page shows what's left, and scenarios
  still run when it hits zero, but nothing gets investigated until midnight UTC.
