---
owner: Shop platform team
services: [gateway, checkout, payments, inventory]
alerts: [PodCrashLooping, FrequentRestarts, ReplicasUnavailable]
causes: [crash_loop, bad_deploy, memory_leak]
actions: [rollback, restart]
---

# Pods crash-looping or restarting

A container that keeps exiting gets restarted by Kubernetes with growing delays, and ends up
in `CrashLoopBackOff`. While it is down, its service runs on fewer replicas or none. Find out
why it exits before doing anything: the right fix depends entirely on the reason.

## Recognise a crash loop

- `PodCrashLooping` fires, or `FrequentRestarts` reports three or more restarts in ten minutes.
- Kubernetes warning events: `BackOff`, `OOMKilled`, or `Unhealthy` from a failing liveness
  probe.
- `ReplicasUnavailable` often follows, because a crashing pod is never ready.

## Find out why it exits

Check the reason and exit code of the last termination, then read the logs of the container
that died:

```sh
kubectl -n shop describe pod <pod>
kubectl -n shop logs <pod> --previous
```

- `OOMKilled` (exit code 137): the process ran out of memory.
- `Error` with an exception in the logs: the code crashes, often on startup.
- Killed after failed liveness probes: the process hangs or answers `/healthz` too slowly.

## Fix by cause

- Crashes that started right after a rollout: roll back with **Roll back a bad release**.
- OOM kills with steady traffic: a leak. Follow **Memory climbing towards the limit**.
- OOM kills because traffic grew: the limit is too small for the load. Raising it is a change
  for the service team; meanwhile scale out to spread the load.
- Liveness failures while a dependency is slow: fix the dependency first.

A restart doesn't fix a crash loop: Kubernetes is already restarting the container.

## Verify the fix

- Restart counts stop increasing and every pod stays `Running` and ready.
- `ReplicasUnavailable` clears and the service's error rate is back to normal.
