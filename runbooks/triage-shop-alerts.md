---
owner: Shop on-call
services: [gateway, checkout, payments, inventory]
alerts: [HighErrorRate, HighLatency, TargetDown]
causes: [unknown]
actions: []
---

# Triage an alert on the shop

Start here when an alert fires in the `shop` namespace and it isn't obvious yet which service
is at fault. The goal of the first ten minutes is to find where the problem starts, not to
fix the service that looks the worst.

## Find where the problem starts

Failures travel upstream. When inventory or payments fails, checkout fails with it, and the
gateway fails because checkout does. The service that alerts loudest is often just the one
closest to customers.

Follow the calls down from the gateway and stop at the deepest service that is still unhealthy.
Look at how each caller sees its dependencies: timeouts and errors on calls to a service point
at that service.

```promql
sum by (service, target, outcome) (rate(http_client_requests_total{namespace="shop"}[5m]))
```

If every service alerts at once, check the ones with no dependencies first: payments and
inventory.

## Check what changed

Most incidents follow a change. Look at the incident timeline in OpsPilot, or at the rollout
history of the suspected service, for deploys, configuration changes and scaling in the 30
minutes before the first alert.

```sh
kubectl -n shop rollout history deployment/checkout
```

A change counts as a suspect only if it landed on the service where the symptoms begin, shortly
before they began. A change that was already rolled back before the incident is not the cause.

## Match the symptoms to a runbook

- Errors that start right after a new version rolled out: **Roll back a bad release**.
- Memory rising towards the limit while traffic is flat: **Memory climbing towards the limit**.
- Payments answering slowly and checkout timing out on it: **Payments slow or hanging**.
- Payments connections all busy, requests rejected, traffic far above normal: **Payments worker
  pool saturated**.
- Containers restarting or stuck in CrashLoopBackOff: **Pods crash-looping or restarting**.
- A settings change with no new version right before the trouble: **Bad configuration change**.
- Replicas missing or a rollout that never finishes: **Replicas unavailable or rollout stuck**.

## Keep the incident under control

Don't restart the gateway to make its alert go away. It hides where the problem starts and
drops every request in flight. Fix the origin and the gateway recovers on its own.

Make one change at a time and give it a few minutes to show an effect before trying the next
one. Two changes at once make it impossible to tell which one helped. Note every action in the
incident so the timeline stays complete for the postmortem.
