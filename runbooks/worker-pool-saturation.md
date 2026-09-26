---
owner: Payments team
services: [payments, checkout, gateway]
alerts: [WorkerPoolSaturated, HighErrorRate, HighLatency]
causes: [resource_saturation, traffic_surge]
actions: [scale]
---

# Payments worker pool saturated

Each payments pod holds two connections to the card processor. When charges arrive faster
than those connections can handle, they queue, and after 1.5 seconds in the queue they are
rejected with `payment processor busy`. It happens during traffic spikes such as a flash sale,
and the fix is more payments pods.

## Recognise saturation

- `WorkerPoolSaturated` fires: more than 90% of the processor connections are busy.
- `worker_queue_depth` is above zero and `worker_pool_rejected_total` keeps rising.
- Checkout and the gateway return errors for part of the checkouts, and latency goes up.
- The request rate is well above its normal level.

## Confirm it is load

Compare the request rate with the same time an hour earlier. A rate several times higher
means a traffic surge is using up the capacity:

```promql
sum(rate(http_requests_total{namespace="shop", service="payments"}[5m]))
sum(rate(http_requests_total{namespace="shop", service="payments"}[5m] offset 1h))
```

Check how full the pool is on each pod:

```promql
sum by (pod) (worker_pool_busy{namespace="shop"}) / sum by (pod) (worker_pool_size{namespace="shop"})
```

A charge takes 80–160 ms, so each pod handles roughly 15 charges per second at most.

## Scale out payments

Add pods: each one brings two more processor connections. In OpsPilot, approve the **Scale**
action on the incident with the new replica count (the catalog allows 1 to 6). By hand:

```sh
kubectl -n shop scale deployment/payments --replicas=4
```

Pick the count from the traffic: charges per second divided by 15, plus one pod of headroom.
Don't restart payments during saturation. Restarting takes capacity away while the pods come
back.

## Verify the scale-out

- Pool usage drops below 70% and nothing is rejected any more.
- The queue stays empty.
- Checkout and gateway errors return to normal.

When the traffic is back to normal, scale payments back to two replicas.

## Follow up

Plan capacity before announced sales. Consider autoscaling payments on pool usage, and ask the
card processor whether more connections per pod are possible.
