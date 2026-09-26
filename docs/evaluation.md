# AI investigation: evaluation

Requirement AI-6: for each failure scenario, the correct root cause (right service and right cause
type) must be ranked first in at least 4 out of 5 runs. Produced by `npm run evaluate`.

Last run: 2026-09-26T13:54:31.874Z · models used: gemini-3.5-flash-lite

| Scenario | Expected | Correct | Required | Result |
|----------|----------|---------|----------|--------|
| S1 `bad-deploy` | checkout / bad_deploy | 4/5 | 4/5 | pass |
| S2 `memory-leak` | inventory / memory_leak | 4/5 | 4/5 | pass |
| S3 `payments-latency` | payments / slow_dependency | 5/5 | 4/5 | pass |
| S4 `traffic-spike` | payments / resource_saturation or traffic_surge | 4/4 | 4/4 | pass |

## Runs

| Scenario | Run | Incident | Top hypothesis | Confidence | Model calls | Evidence | Time | Correct |
|----------|-----|----------|----------------|------------|-------------|----------|------|---------|
| S1 | 1 | INC-20 | checkout / bad_deploy: Bad deploy of checkout version 1.4.2 introducing a TypeError in pricing | 100% | 2 | 7 | 6s | yes |
| S1 | 2 | INC-21 | checkout / bad_deploy: Bad deploy of checkout version 1.4.2 introducing a TypeError in pricing | 100% | 3 | 8 | 18s | yes |
| S1 | 3 | INC-22 | checkout / bad_deploy: Bad deploy of checkout version 1.4.2 introducing a TypeError in pricing | 100% | 2 | 7 | 211s | yes |
| S1 | 4 | INC-23 | checkout / bad_deploy: Bad deploy of checkout version 1.4.2 introducing a TypeError in pricing | 100% | 2 | 7 | 132s | yes |
| S1 | 5 | — | gave up waiting for the investigation | — | — | — | — | no |
| S2 | 1 | INC-25 | fetch failed | — | 0 | 6 | 12s | no |
| S2 | 2 | INC-26 | inventory / memory_leak: Memory leak in inventory service | 95% | 2 | 9 | 5s | yes |
| S2 | 3 | INC-27 | inventory / memory_leak: Memory leak in inventory service | 100% | 4 | 9 | 160s | yes |
| S2 | 4 | INC-28 | inventory / memory_leak: Memory leak in inventory service | 100% | 3 | 8 | 115s | yes |
| S2 | 5 | INC-29 | inventory / memory_leak: Memory leak in inventory service | 100% | 5 | 10 | 40s | yes |
| S3 | 1 | INC-30 | payments / slow_dependency: Slow downstream card processor causing high latency in payments | 100% | 8 | 13 | 245s | yes |
| S3 | 2 | INC-31 | payments / slow_dependency: Slow downstream card processor causing high latency in payments | 100% | 3 | 8 | 215s | yes |
| S3 | 3 | INC-32 | payments / slow_dependency: Slow downstream card processor causing high latency in payments | 100% | 4 | 9 | 10s | yes |
| S3 | 4 | INC-33 | payments / slow_dependency: Slow downstream card processor causing high latency in payments | 100% | 3 | 8 | 8s | yes |
| S3 | 5 | INC-34 | payments / slow_dependency: Slow downstream card processor causing high latency in payments | 100% | 3 | 8 | 8s | yes |
| S4 | 1 | INC-35 | payments / resource_saturation: Resource saturation on payments due to traffic surge | 100% | 3 | 8 | 17s | yes |
| S4 | 2 | INC-36 | payments / resource_saturation: Resource saturation on payments due to traffic surge | 100% | 2 | 7 | 60s | yes |
| S4 | 3 | INC-37 | payments / resource_saturation: Resource saturation on payments due to insufficient worker pool capacity / replicas | 100% | 5 | 10 | 10s | yes |
| S4 | 4 | INC-38 | payments / resource_saturation: Resource saturation on payments due to insufficient worker pool capacity / replicas | 100% | 3 | 8 | 7s | yes |
