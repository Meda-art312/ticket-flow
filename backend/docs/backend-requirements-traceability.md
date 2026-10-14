# Backend requirements and test traceability

Baseline: preserved SRS 2.0; contract ticketflow-api-v1. References identify implemented code and concrete exercised scenarios, not a claim that every possible input/failure permutation is exhaustively tested.

Evidence: `artifacts/handoff-verification.log`, `artifacts/recovery-evidence.json`, `artifacts/isolated-load.log`, `artifacts/k6-summary.json`, `artifacts/query-plans.json`, `artifacts/npm-runtime-audit.json`. Artifacts are intentionally ignored (load.env contains a short-lived token); measured summaries are recorded in docs/performance.md and docs/verification.md.

| Requirement | Implementation | Test/evidence |
|---|---|---|
| AUTH-01 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| AUTH-02 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| AUTH-03 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| AUTH-04 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| AUTH-05 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| AUTH-06 | src/identity/service.ts; src/http.ts; src/infra/config.ts | BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter |
| CAT-01 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-02 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-03 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-04 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-05 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-06 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| CAT-07 | src/catalog/service.ts | BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation |
| BOOK-01 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-02 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-03 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-04 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-05 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-06 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-07 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-08 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| BOOK-09 | src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql | BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback |
| PAY-01 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-02 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-03 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-04 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-05 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-06 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-07 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-08 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-09 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-10 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-11 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| PAY-12 | src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql | BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts |
| TKT-01 | src/ticketing/service.ts; src/notifications/service.ts | BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry |
| TKT-02 | src/ticketing/service.ts; src/notifications/service.ts | BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry |
| TKT-03 | src/ticketing/service.ts; src/notifications/service.ts | BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry |
| TKT-04 | src/ticketing/service.ts; src/notifications/service.ts | BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry |
| TKT-05 | src/ticketing/service.ts; src/notifications/service.ts | BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry |
| DATA-01 | drizzle/; src/reporting/service.ts; scripts/analyze.ts | BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture |
| DATA-02 | drizzle/; src/reporting/service.ts; scripts/analyze.ts | BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture |
| DATA-03 | drizzle/; src/reporting/service.ts; scripts/analyze.ts | BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture |
| DATA-04 | drizzle/; src/reporting/service.ts; scripts/analyze.ts | BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture |
| DATA-05 | drizzle/; src/reporting/service.ts; scripts/analyze.ts | BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture |
| ARCH-01 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| ARCH-02 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| ARCH-03 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| ARCH-04 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| ARCH-05 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| ARCH-06 | src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/ | API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance |
| MSG-01 | src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts | BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart |
| MSG-02 | src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts | BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart |
| MSG-03 | src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts | BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart |
| MSG-04 | src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts | BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart |
| MSG-05 | src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts | BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart |
| CACHE-01 | src/infra/cache.ts; src/catalog/service.ts; compose.yaml | BE-AT-14; real Redis hit/miss, TTL, stale fill barrier, generation invalidation; recovery harness stops Redis and confirms fallback; memory bound 128MB |
| CACHE-02 | src/infra/cache.ts; src/catalog/service.ts; compose.yaml | BE-AT-14; real Redis hit/miss, TTL, stale fill barrier, generation invalidation; recovery harness stops Redis and confirms fallback; memory bound 128MB |
| CACHE-03 | src/infra/cache.ts; src/catalog/service.ts; compose.yaml | BE-AT-14; real Redis hit/miss, TTL, stale fill barrier, generation invalidation; recovery harness stops Redis and confirms fallback; memory bound 128MB |
| CACHE-04 | src/infra/cache.ts; src/catalog/service.ts; compose.yaml | BE-AT-14; real Redis hit/miss, TTL, stale fill barrier, generation invalidation; recovery harness stops Redis and confirms fallback; memory bound 128MB |
| API-01 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| API-02 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| API-03 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| API-04 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| API-05 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| API-06 | src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md | BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits |
| DOCKER-01 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-02 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-03 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-04 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-05 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-06 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-07 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| DOCKER-08 | Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml | BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured) |
| NFR-01 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |
| NFR-02 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |
| NFR-03 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |
| NFR-04 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |
| NFR-05 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |
| NFR-06 | src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md | BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code |

## Acceptance matrix

All BE-AT scenarios below have executable coverage in test/acceptance.spec.ts, supplemented by the real container recovery harness and k6/SQL analysis. Credentials-dependent Stripe remote checkout/refund smoke is explicitly unrun.

| Scenario | Specific evidence |
|---|---|
| BE-AT-01 | Fresh Docker API/worker/infrastructure, successful migrations, independent contract and local seed/demo |
| BE-AT-02 | Customer-only registration, query ownership and current-role checks |
| BE-AT-03 | Venue/event/category CRUD, archive/reference restrictions, date constraints, publication freeze and public filters |
| BE-AT-04 | 100 concurrent distinct-key HTTP requests through api/api2; exactly 10 successes and 90 inventory conflicts; SQL bounds |
| BE-AT-05 | Concurrent same-key booking result; changed-payload conflict; persisted rejection remains rejected after stock changes |
| BE-AT-06 | Injected reservation/confirmation rollback checks bookings, counters, command result, tickets, payment and outbox |
| BE-AT-07 | Event lock held across deadline boundary; confirmation/expiry/cancel race; FixedClock equality policy test |
| BE-AT-08 | Verified eligible capture produces exactly quantity tickets; demo action is asynchronous |
| BE-AT-09 | Duplicate/out-of-order signed events; invalid signature, mismatch and additional capture handling; SDK raw-byte test |
| BE-AT-10 | Expired/canceled holds never revive; one compensation; no second reserved/sold release |
| BE-AT-11 | Provider-success/local-crash simulation, stored identities, one remote operation, >23h manual resolution |
| BE-AT-12 | Pending suspension, verified release only, terminal failure retaining sold stock; canceled event blocks admission |
| BE-AT-13 | Twelve competing scans admit once; owner/token/window rejection; real refund/check-in competition |
| BE-AT-14 | Real Redis hit/miss/TTL, generation invalidation and deterministic stale-fill barrier; actual Redis-stop fallback |
| BE-AT-15 | Real broker confirms; crash after consumer commit and redelivery; actual broker stop/purchase/catch-up |
| BE-AT-16 | Expired hold processed by two pools once; exhausted message in actual DLQ; admin-only audited replay |
| BE-AT-17 | Cancellation versus capture race; bounded release/refund sweep; old failed refund evidence cannot revert new recovery |
| BE-AT-18 | Preaggregated money and ticket quantities, no multiplied totals, zero drift, actual report query plans |
| BE-AT-19 | Refresh family reuse/rotation, logout/cookie clearing, exact/missing/null Origin, cross-site metadata, limiter and production guards |
| BE-AT-20 | Restart API/worker/PostgreSQL without deleting data; stable payment identity/tickets and recovered unfinished notification |
| BE-AT-21 | Real QR rendering and deliberately corrupted artifact retry; real failed SMTP connection then Mailpit retry; purchase remains retrievable |
| BE-AT-22 | Container lint/types/35 tests/build, owned API-only simulator checkout, production image/local runtime/demo, k6 and measured SQL |

## Explicit limits

Stripe remote API operations need an actual test account and were not run. Local SDK signature verification uses generated test evidence and no remote credentials. Hosted GitHub Actions cannot be dispatched from this non-Git workspace; equivalent container checks run locally. SMTP has a documented send-before-record duplicate window. Single-node Docker recovery is demonstrated, not high availability. Terminal provider refund failures remain visible for operator review; automatic new financial identities are deliberately not created.
