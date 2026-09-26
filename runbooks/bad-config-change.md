---
owner: Shop platform team
services: [gateway, checkout, payments, inventory]
alerts: [HighErrorRate, HighLatency, WorkerPoolSaturated]
causes: [config_change]
actions: [rollback]
---

# Bad configuration change

Settings such as timeouts, pool sizes and feature flags live in each deployment's environment.
Changing them rolls out new pods just like a release, but the image version stays the same, so
a bad setting is easy to overlook when you only look for new versions.

## Recognise a configuration problem

- The trouble starts right after a rollout that changed no image: OpsPilot shows it as a
  config change in the timeline, with the setting's old and new value.
- Only the service whose settings changed misbehaves at first, and then its callers.
- Typical culprits: a timeout set too low, fewer processor connections for payments, a
  feature flag switched on everywhere at once.

## Confirm the change

Compare the pod template of the current revision with the previous one:

```sh
kubectl -n shop rollout history deployment/payments
kubectl -n shop rollout history deployment/payments --revision=<previous>
```

Look at the `env` section of both. Ask whoever made the change what it was meant to do: a
setting that only makes sense together with a code change needs both rolled back.

## Roll back the setting

Rolling back to the previous revision restores the whole pod template, environment included.
In OpsPilot, approve the **Roll back** action on the incident. By hand:

```sh
kubectl -n shop rollout undo deployment/payments
```

Then fix the setting where it is defined in the Kustomize manifests, or the next deploy puts
the bad value back.

## Verify the rollback

- The deployment runs with the old value again.
- The service and its callers are back to normal error rates and latency.
