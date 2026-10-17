# Remaining steps

OpsPilot is live at https://opspilot-main.duckdns.org, and its acceptance checks pass
([acceptance.md](acceptance.md)). What's left needs your admin account or your decision.
Delete this file once it's done.

## 1. Check the admin side on the public site

Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env.cloud`, not as a guest:

- [ ] Open INC-045's postmortem: Edit, change a line, Save, download the `.md`, and Mark as
      final.
- [ ] The Team page (`g t`) lists you as the admin. Add teammates there if you want.

## 2. Decide on the incident history

The public database still holds every incident from local testing and from these checks
(INC-1 to INC-47). Insights counts them, and the AI cites similar past incidents as
evidence, so they make the demo richer. A reset would give visitors a clean start, but it
deletes incidents, memory and postmortems for good.

## 3. Commit and push

Phase 7, the deployment fixes and the Gemini relay are not committed. The Phase 6 commit
(06677a5) is only local, and GitHub is still at 8d1eee4. `git status` should list no `.env`,
`.env.cloud` or `.vercel` file.

```bash
git status
git add -A
git commit -m "Phase 7 and the public deployment"
git push
```

Then run `npm run cloud -- deploy` once more, so the running images are tagged with that
commit.

## Keeping it running

- **Credit.** The VM, its disk and its IP draw on the $100 student credit every hour they
  exist; Cost Management in the Azure portal shows how fast. Stop the VM in the portal when
  nobody needs the site. It comes back on its own when started again, and the static IP
  keeps the DuckDNS name valid.
- **Certificate.** Traefik renews it on its own before it expires on 15 January 2027.
- **Gemini relay.** It runs on Vercel's Hobby plan and needs nothing. If the VM ever moves
  to a region Gemini serves, remove `GEMINI_RELAY_URL` and `GEMINI_RELAY_TOKEN` from
  `.env.cloud` and deploy again.
- **Updating.** Change the code, commit, and run `npm run cloud -- deploy`.
- **AI budget.** 200 model calls per day. The demo page shows what's left. Scenarios still
  run at zero, but nothing gets investigated until midnight UTC.
- **Local cluster.** It's stopped, not deleted. `npm run cluster:up` brings it back, but
  don't run the local server while the public one runs: both use the same database.
