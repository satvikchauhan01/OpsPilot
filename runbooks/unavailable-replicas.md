---
owner: Shop platform team
services: [gateway, checkout, payments, inventory]
alerts: [ReplicasUnavailable, TargetDown]
causes: [bad_deploy, config_change, crash_loop]
actions:
  rollback: Fix by cause
  restart: Fix by cause
---

# Replicas unavailable or rollout stuck

Every shop service runs two replicas so it survives losing one. When replicas stay unavailable
for minutes, the service runs on half its capacity or not at all, and a rollout that never
finishes leaves old and new versions side by side.

## Recognise the problem

- `ReplicasUnavailable` fires: a deployment has had unavailable replicas for three minutes.
- A rollout doesn't finish: `kubectl rollout status` keeps waiting, and OpsPilot shows the
  rollout as stuck in the timeline.
- `TargetDown` fires when Prometheus can't reach a pod's metrics at all.

## Find the reason

```sh
kubectl -n shop get pods -l app.kubernetes.io/name=checkout
kubectl -n shop get events --field-selector type=Warning --sort-by=.lastTimestamp
```

- `ErrImagePull` or `ImagePullBackOff`: the image or tag doesn't exist.
- Readiness probe failures (`Unhealthy`): the new pods start but never report ready on
  `/readyz`.
- `FailedScheduling`: the node has no room for the pod's CPU or memory requests.
- Restarts: see **Pods crash-looping or restarting**.

## Fix by cause

- A new version that doesn't become ready, or a wrong image: roll back to the previous
  revision with the **Roll back** action, or `kubectl -n shop rollout undo deployment/<service>`.
- One pod stuck while the rest are fine: a **Restart** replaces it.
- `FailedScheduling`: the cluster is full. Free room by scaling down something less important
  before adding replicas anywhere.

## Verify the fix

- `kubectl -n shop rollout status deployment/<service>` completes.
- Every replica is ready and `ReplicasUnavailable` and `TargetDown` clear.
