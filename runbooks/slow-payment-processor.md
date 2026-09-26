---
owner: Payments team
services: [payments, checkout, gateway]
alerts: [HighLatency, HighErrorRate]
causes: [slow_dependency]
actions: [restart]
---

# Payments slow or hanging

Payments charges cards through a card processor. When those calls hang, payments answers
slowly, checkout gives up waiting for it after two seconds, and the gateway returns errors
for every checkout. The fix starts at payments even though checkout and the gateway alert too.

## Recognise a slow payments service

- `HighLatency` fires for payments, usually together with `HighLatency` and `HighErrorRate`
  on checkout and the gateway.
- Checkout reports timeouts on its calls to payments: `outcome="timeout"` on
  `http_client_requests_total{target="payments"}`.
- Payments' own request rate and memory look normal. Requests are accepted, they just take
  seconds instead of about a hundred milliseconds.

## Confirm payments is the origin

See how checkout experiences its dependencies. Timeouts on payments with healthy inventory
calls put the problem in payments:

```promql
sum by (target, outcome) (rate(http_client_requests_total{namespace="shop", service="checkout"}[5m]))
```

Find slow traces and check where the time goes. Long payments spans with nothing slow beneath
them mean payments itself is waiting:

```traceql
{ resource.service.name = "payments" && duration > 1s }
```

This is not saturation: when the worker pool is full, requests are rejected quickly with
`payment processor busy`. Here they are slow but not rejected.

## Restart payments

A rolling restart replaces the processes and their connections to the card processor, which
clears hung calls. In OpsPilot, approve the **Restart** action on the incident. By hand:

```sh
kubectl -n shop rollout restart deployment/payments
kubectl -n shop rollout status deployment/payments
```

Scaling out doesn't help here: every new pod waits on the same slow calls.

## Verify the restart

- Payments p95 latency drops back under 300 ms.
- Checkout stops reporting timeouts on payments.
- Checkout and gateway error rates fall back to normal without any action of their own.

If payments is still slow after the restart, the card processor itself is slow. Check the
provider's status page and open a ticket with them, and keep the incident open.

## Follow up

Add a circuit breaker in checkout so a slow processor fails orders quickly instead of tying
up requests, and alert on the processor's latency directly so the next slowdown is visible
before customers notice.
