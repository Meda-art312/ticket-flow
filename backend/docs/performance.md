# Measured backend performance

Final isolated run: ticketflow-backend-load, API and worker from the optimized production stage, APP_MODE=test / NODE_ENV=production, simulator, QUIET_TEST_LOGS=true. CPU: Intel Core i5-12400F; Docker 12 CPUs and 15.53 GiB memory. No per-container CPU/memory limits. Other local development/test projects existed; these figures describe this developer machine, not production capacity or high availability. Benchmark API image: `sha256:6ccc707add7d37ddf0346f756a62ec314582330589fd935c609fe4b409b10924`.

## Five-minute HTTP measurement

Two constant-arrival-rate scenarios each offered 50 requests/second for 300 seconds: cached public GET /events and authenticated one-ticket POST /bookings. Setup verifies auth and primes the public cache. Fixture: four published events/categories (three scenario seeds plus a dedicated capacity-20,000 load category), one customer, two organizers and one admin; USD 100 minor units per load ticket, default 600-second hold. The frontend was absent.

| Measurement | Observed | Target |
|---|---:|---:|
| Catalog p95 | 3.527 ms | <200 ms |
| Reservation p95 | 9.698 ms | <500 ms |
| Catalog maximum | 30.630 ms | reported |
| Reservation maximum | 87.916 ms | reported |
| HTTP requests including setup | 30004 | 100 combined requests/s |
| Achieved HTTP rate | 100.010 /s | 100 combined /s |
| Scenario iterations | 30002 | 30,000 nominal (inclusive scheduling can add boundary iterations) |
| HTTP failure rate | 0.000% | zero |
| Dropped iterations reported | 0 | reported |

Post-load SQL snapshot at 2026-10-13T21:33:45.26701+00:00: 15001 bookings / 15001 units; inventory-bound violations 0; expired-but-unprocessed holds 0; outbox pending 0, dead 0. No development data/volumes were deleted. Money correctness, captured/refunded ticket quantities and drift were separately verified by real SQL acceptance tests.

Reproduce on PowerShell: `./scripts/load.ps1`. It creates an isolated project/network/database and a fresh dedicated load category without resetting development data. Local alternative after normal startup/seed: `docker compose --profile load run --build --rm prepare-load`, then `docker compose --env-file .env --env-file artifacts/load.env --profile load run --rm load`. The generated ignored load.env contains a 15-minute token; regenerate before another run. Raw files: artifacts/isolated-load.log, artifacts/k6-summary.json, artifacts/load-fixture.json, artifacts/load-operations.json and artifacts/load-machine.json.

## SQL analysis

Measured 2026-10-13T21:33:59.061Z on the isolated test database: 10055 events, 78 real acceptance bookings and 38 durable tickets. 10,000 extra published catalog fixtures each have a category. Report event a43f303a-9402-44ee-82d9-3baa35fdec4f contains actual verified payment/refund facts.

| Query | Execution time |
|---|---:|
| Discovery without event_discovery index | 3.275 ms |
| Same discovery with partial state/start/id index | 0.022 ms |
| Preaggregated sales report | 0.348 ms |

Baseline removes only the discovery index within an explicitly rolled-back test transaction, then reruns with the intact schema. ANALYZE and EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output is in artifacts/query-plans.json. No production database is analyzed or altered by this tool. Financial children are aggregated before joining, preventing ticket/payment/refund multiplication; daily sales use immutable database capture-record timestamps in UTC.

## Findings and limitations

Early sequential publisher confirms fell behind the offered traffic: 5,533 pending records with oldest age 411 seconds were observed; a later batch-only change still accumulated backlog. Pipelined confirms, per-publication mandatory-return correlation, 100-row bounded batches and a 250ms non-overlapping worker ticker resolved this. The final isolated snapshot has no pending/dead outbox records. See ADR 006 for the correctness argument; confirms are not consumer completion.

An early cold/shared run reported 12 dropped iterations. A later development-stack run was interrupted by rebuilding/restarting that same API during measurement and reported 29 failed requests and 207 drops; it is not the accepted benchmark. The final isolated run above avoids API restarts and primes the cache. These earlier observations are retained in ignored artifacts/complete-load.log and artifacts/load-run.log. Cache outage/recovery and actual broker/container restarts are measured separately by scripts/recovery.ps1. Stripe remote latency is excluded and requires supplied test credentials.
