import { readFileSync,writeFileSync } from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const load=read('artifacts/k6-summary.json'),ops=read('artifacts/load-operations.json'),machine=read('artifacts/load-machine.json'),plans=read('artifacts/query-plans.json');
const metric=n=>load.metrics[n],format=n=>Number(n).toFixed(3);
const execution=n=>plans.queries[n][0]['QUERY PLAN'][0]['Execution Time'];
writeFileSync('docs/performance.md',`# Measured backend performance

Final isolated run: ticketflow-backend-load, API and worker from the optimized production stage, APP_MODE=test / NODE_ENV=production, simulator, QUIET_TEST_LOGS=true. CPU: ${machine.cpu}; Docker ${machine.docker_cpus} CPUs and ${(machine.docker_memory_bytes/1024**3).toFixed(2)} GiB memory. No per-container CPU/memory limits. Other local development/test projects existed; these figures describe this developer machine, not production capacity or high availability. Benchmark API image: \`${machine.api_image}\`.

## Five-minute HTTP measurement

Two constant-arrival-rate scenarios each offered 50 requests/second for 300 seconds: cached public GET /events and authenticated one-ticket POST /bookings. Setup verifies auth and primes the public cache. Fixture: four published events/categories (three scenario seeds plus a dedicated capacity-20,000 load category), one customer, two organizers and one admin; USD 100 minor units per load ticket, default 600-second hold. The frontend was absent.

| Measurement | Observed | Target |
|---|---:|---:|
| Catalog p95 | ${format(metric('http_req_duration{scenario:catalog}')['p(95)'])} ms | <200 ms |
| Reservation p95 | ${format(metric('http_req_duration{scenario:reservations}')['p(95)'])} ms | <500 ms |
| Catalog maximum | ${format(metric('http_req_duration{scenario:catalog}').max)} ms | reported |
| Reservation maximum | ${format(metric('http_req_duration{scenario:reservations}').max)} ms | reported |
| HTTP requests including setup | ${metric('http_reqs').count} | 100 combined requests/s |
| Achieved HTTP rate | ${format(metric('http_reqs').rate)} /s | 100 combined /s |
| Scenario iterations | ${metric('iterations').count} | 30,000 nominal (inclusive scheduling can add boundary iterations) |
| HTTP failure rate | ${(metric('http_req_failed').value*100).toFixed(3)}% | zero |
| Dropped iterations reported | ${metric('dropped_iterations')?.count||0} | reported |

Post-load SQL snapshot at ${ops.observed_at}: ${ops.bookings} bookings / ${ops.units} units; inventory-bound violations ${ops.inventory_violations}; expired-but-unprocessed holds ${ops.expired_reserved}; outbox pending ${ops.outbox_pending}, dead ${ops.outbox_dead}. No development data/volumes were deleted. Money correctness, captured/refunded ticket quantities and drift were separately verified by real SQL acceptance tests.

Reproduce on PowerShell: \`./scripts/load.ps1\`. It creates an isolated project/network/database and a fresh dedicated load category without resetting development data. Local alternative after normal startup/seed: \`docker compose --profile load run --build --rm prepare-load\`, then \`docker compose --env-file .env --env-file artifacts/load.env --profile load run --rm load\`. The generated ignored load.env contains a 15-minute token; regenerate before another run. Raw files: artifacts/isolated-load.log, artifacts/k6-summary.json, artifacts/load-fixture.json, artifacts/load-operations.json and artifacts/load-machine.json.

## SQL analysis

Measured ${plans.measured_at} on the isolated test database: ${plans.cardinalities.events} events, ${plans.cardinalities.bookings} real acceptance bookings and ${plans.cardinalities.tickets} durable tickets. 10,000 extra published catalog fixtures each have a category. Report event ${plans.report_event_id} contains actual verified payment/refund facts.

| Query | Execution time |
|---|---:|
| Discovery without event_discovery index | ${format(execution('discovery_without_index'))} ms |
| Same discovery with partial state/start/id index | ${format(execution('discovery'))} ms |
| Preaggregated sales report | ${format(execution('report'))} ms |

Baseline removes only the discovery index within an explicitly rolled-back test transaction, then reruns with the intact schema. ANALYZE and EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) output is in artifacts/query-plans.json. No production database is analyzed or altered by this tool. Financial children are aggregated before joining, preventing ticket/payment/refund multiplication; daily sales use immutable database capture-record timestamps in UTC.

## Findings and limitations

Early sequential publisher confirms fell behind the offered traffic: 5,533 pending records with oldest age 411 seconds were observed; a later batch-only change still accumulated backlog. Pipelined confirms, per-publication mandatory-return correlation, 100-row bounded batches and a 250ms non-overlapping worker ticker resolved this. The final isolated snapshot has no pending/dead outbox records. See ADR 006 for the correctness argument; confirms are not consumer completion.

An early cold/shared run reported 12 dropped iterations. A later development-stack run was interrupted by rebuilding/restarting that same API during measurement and reported 29 failed requests and 207 drops; it is not the accepted benchmark. The final isolated run above avoids API restarts and primes the cache. These earlier observations are retained in ignored artifacts/complete-load.log and artifacts/load-run.log. Cache outage/recovery and actual broker/container restarts are measured separately by scripts/recovery.ps1. Stripe remote latency is excluded and requires supplied test credentials.
`);
