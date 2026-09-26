---
owner: Inventory team
services: [inventory, checkout, payments, gateway]
alerts: [MemoryNearLimit, FrequentRestarts]
causes: [memory_leak]
actions:
  restart: Restart the service
---

# Memory climbing towards the limit

A service whose memory keeps rising while its traffic stays the same is leaking. Left alone it
reaches its container limit and gets OOM-killed, and every request in flight on that pod
fails. A rolling restart buys time, and the leak has to be fixed in the code.

## Recognise a leak

- `MemoryNearLimit` fires: a pod uses more than 80% of its memory limit.
- Memory grows steadily for many minutes instead of following the traffic.
- The request rate is about the same as before the memory started to climb.
- Later, `OOMKilled` restarts appear and `FrequentRestarts` fires.

More memory with more traffic is load, not a leak. More memory with the same traffic is a
leak.

## Tell a leak from load

Put memory next to the request rate for the same service:

```promql
max by (pod) (process_resident_memory_bytes{namespace="shop", service="inventory"})
sum(rate(http_requests_total{namespace="shop", service="inventory"}[5m]))
```

If the heap (`nodejs_heap_size_used_bytes`) grows with it, the leak is in JavaScript objects.
Work out how fast it grows and how long is left before the limit: inventory's limit is 384 MiB
and it normally uses about 100 MiB. If memory started to climb right after a deploy, the new
version brought the leak: use **Roll back a bad release** instead.

## Restart the service

Do a rolling restart. In OpsPilot, approve the **Restart** action on the incident. By hand:

```sh
kubectl -n shop rollout restart deployment/inventory
kubectl -n shop rollout status deployment/inventory
```

Pods are replaced one at a time and each new pod has to pass its readiness probe first, so
the service keeps answering during the restart. Don't delete pods by hand: that can take
both replicas down at once.

## Verify the restart

- Memory of every new pod is back near its normal level.
- No pod is OOM-killed and the restart counts stop increasing.
- Watch for fifteen minutes. If memory climbs again at the same rate, the leak is still
  there and the restart only reset the clock. Escalate to the owning team.

## Follow up

Before restarting next time, take a heap snapshot from one of the two pods so the leak can be
found: compare two snapshots a few minutes apart and look for the objects that keep growing.
Add a test that runs the leaking code path many times, and keep the memory alert: it is the
early warning that gives you time before the OOM kills start.
