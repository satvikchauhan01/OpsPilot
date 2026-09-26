# AI investigation: evaluation

Requirement AI-6: for each failure scenario, the correct root cause (right service and right cause
type) must be ranked first in at least 4 out of 5 runs. Produced by `npm run evaluate`.

Last run: 2026-09-26T05:52:27.535Z · models used: gemini-3.5-flash-lite

| Scenario | Expected | Correct | Required | Result |
|----------|----------|---------|----------|--------|
| S1 `bad-deploy` | checkout / bad_deploy | 5/5 | 4/5 | pass |
| S2 `memory-leak` | inventory / memory_leak | 4/5 | 4/5 | pass |
| S3 `payments-latency` | payments / slow_dependency | 4/5 | 4/5 | pass |
| S4 `traffic-spike` | payments / resource_saturation or traffic_surge | 5/5 | 4/5 | pass |

## Runs

| Scenario | Run | Incident | Top hypothesis | Confidence | Model calls | Evidence | Time | Correct |
|----------|-----|----------|----------------|------------|-------------|----------|------|---------|
| S1 | 1 | INC-12 | checkout / bad_deploy: Bad deploy of checkout 1.4.2 causing a TypeError in pricing logic | 100% | 3 | 6 | 7s | yes |
| S1 | 2 | INC-13 | checkout / bad_deploy: Bad deploy of checkout version 1.4.2 introducing a code exception | 100% | 3 | 6 | 6s | yes |
| S1 | 3 | INC-14 | checkout / bad_deploy: Checkout version 1.4.2 introduces a TypeError in pricing.js | 100% | 2 | 5 | 4s | yes |
| S1 | 4 | INC-15 | checkout / bad_deploy: Bad deploy of checkout 1.4.2 introducing a TypeError in pricing | 100% | 3 | 6 | 6s | yes |
| S1 | 5 | INC-16 | checkout / bad_deploy: Checkout 1.4.2 introduced a TypeError in pricing.js causing order processing failures | 100% | 2 | 5 | 4s | yes |
| S2 | 1 | INC-17 | inventory / memory_leak: Memory leak in the inventory service causing memory utilization to climb towards its limit. | 95% | 4 | 7 | 6s | yes |
| S2 | 2 | INC-18 | inventory / resource_saturation: Inventory memory usage is near its limit due to a low container memory limit under normal load | 80% | 7 | 10 | 18s | no |
| S2 | 3 | INC-19 | inventory / memory_leak: Memory leak in inventory service causing memory usage to climb toward limits | 95% | 6 | 9 | 11s | yes |
| S2 | 4 | INC-20 | inventory / memory_leak: Memory leak in inventory service causing memory near limit alerts | 95% | 4 | 7 | 7s | yes |
| S2 | 5 | INC-21 | inventory / memory_leak: Memory leak in inventory service causing memory usage to climb toward the limit | 95% | 5 | 8 | 9s | yes |
| S3 | 1 | INC-22 | payments / slow_dependency: Payments service responding slowly causing timeouts in checkout and gateway | 95% | 2 | 7 | 4s | yes |
| S3 | 2 | INC-23 | payments / slow_dependency: Payments service is responding slowly, causing checkout and gateway timeouts | 95% | 6 | 16 | 12s | yes |
| S3 | 3 | INC-24 | payments / slow_dependency: Payments service is responding slowly, causing downstream timeouts in checkout and gateway | 95% | 12 | 15 | 90s | yes |
| S3 | 4 | INC-25 | payments / resource_saturation: Payments service worker pool is saturated due to insufficient capacity | 95% | 12 | 15 | 67s | no |
| S3 | 5 | INC-26 | payments / slow_dependency: Payments service responses are slow, causing checkout and gateway timeouts | 100% | 8 | 13 | 32s | yes |
| S4 | 1 | INC-27 | payments / traffic_surge: Traffic surge leading to resource saturation in payments | 95% | 1 | 4 | 2s | yes |
| S4 | 2 | INC-28 | payments / traffic_surge: Traffic surge causing resource saturation in payments processor connections | 95% | 2 | 5 | 4s | yes |
| S4 | 3 | INC-29 | payments / resource_saturation: Payments processor connection pool is fully saturated | 100% | 3 | 6 | 6s | yes |
| S4 | 4 | INC-30 | payments / resource_saturation: Payments service worker pool saturation caused by insufficient capacity | 100% | 10 | 13 | 64s | yes |
| S4 | 5 | INC-31 | payments / traffic_surge: Traffic surge causing processor connection saturation in payments | 95% | 3 | 6 | 6s | yes |
