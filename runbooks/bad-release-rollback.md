---
owner: Shop platform team
services: [checkout, gateway, payments, inventory]
alerts: [HighErrorRate, PodCrashLooping]
causes: [bad_deploy]
actions: [rollback]
---

# Roll back a bad release

A new version that breaks requests shows up as errors that start within minutes of its rollout.
Roll back first and investigate afterwards: the previous version was working, and the fix can
ship later without customers waiting for it.

## Recognise a bad release

- The error rate of one service jumps shortly after a rollout of that same service finished.
- The errors come from the new version only. Every request metric carries a `version` label.
- Logs show exceptions that didn't exist before, such as a `TypeError` in code that changed.
- The callers of that service fail too, for example the gateway when checkout breaks.

A release that went out hours before the errors began is probably not the cause. Look for
something else that changed.

## Confirm it is the new version

Compare errors by version. If only the new one fails, the release is the cause.

```promql
sum by (version) (rate(http_requests_total{namespace="shop", service="checkout", status_code=~"5.."}[5m]))
```

Check which revision is running and what changed in it:

```sh
kubectl -n shop rollout history deployment/checkout
kubectl -n shop get deployment checkout -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Open one failing trace from the error logs to see the exception and the line of code it came
from.

## Roll back

Roll the deployment back to its previous revision. In OpsPilot, approve the **Roll back**
action on the incident. By hand it is:

```sh
kubectl -n shop rollout undo deployment/checkout
kubectl -n shop rollout status deployment/checkout
```

The shop's services keep no state of their own and every release stays compatible with the
one before it, so rolling back is always safe. Don't try to fix forward during the incident.

## Verify the rollback

- The rollout finishes and every replica runs the previous version.
- The service's error ratio falls below 1% within about three minutes.
- The callers recover too: gateway errors stop without any action of their own.

If the errors continue on the previous version, the release was not the cause. Go back to
**Triage an alert on the shop**.

## Follow up

Keep the broken version from going out again until it is fixed. Reproduce the failure with a
test before fixing it, and ship the fix as a new version rather than re-deploying the old
number. Add the exception to the release checks so the next rollout stops early.
