# TicketFlow backend implementation plan

Baseline: SRS 2.0, ticketflow-api-v1. Backend only. Repository review: specification files only; no Git repository or AGENTS.md found in workspace ancestry. Original files preserved.

## Before critical flows

- [x] Read full specification and pasted implementation request; preserve SRS verbatim.
- [x] Define architecture, invariants, lock order, failure recovery, deployment and initial ADRs.
- [x] Export exact OpenAPI baseline; keep runtime and export from one source.

## Runnable slices

1. [x] Foundation: Nest/Express API and separate worker, Drizzle migrations, Docker, identity and ownership.
2. [x] Catalog and reservations: draft CRUD, publication, SQL inventory, concurrent command idempotency, expiry.
3. [x] Payments and tickets: persisted operation identity, simulator and Stripe test adapters, durable webhook inbox, confirmation and compensation.
4. [x] Recovery: refunds, cancellation sweep, check-in, confirmed outbox delivery, durable notification jobs, DLQ and replay.
5. [x] Cache and reports: generation keys, Redis fallback, financial fact aggregation, drift detection.
6. [x] Release: real database/API/infrastructure tests, multi-instance contention, k6, query plans, documentation and traceability.

## Assumptions and implementation decisions

- Node 24 LTS; Nest 11 with Express. PostgreSQL is the sole authority. Money uses bounded integer minor units.
- All inventory-changing paths lock event, then booking (when existing), then category, then financial rows, then tickets. A preliminary unlocked lookup may discover immutable IDs only; authoritative eligibility is reread under locks.
- Command idempotency uses a transaction-scoped advisory lock scoped to actor/operation/key before business locks. No path acquires that lock after business locks. Durable results and business effects commit together. Retention is at least seven days; no automatic deletion in MVP.
- Database `clock_timestamp()` is evaluated after locks, with strict `< expires_at`; PostgreSQL transaction start time is unsuitable after waiting for a lock.
- External provider, broker, SMTP and QR work occurs outside business transactions. Identity persists before a financial call. Concurrent workers lease durable operations; retries reuse provider keys. Unknown Stripe operations older than 23 hours require manual reconciliation rather than key reuse.
- Booking outcomes and financial outcomes are independent. Late captures never resurrect holds. Compensation does not decrement sold stock. Normal refunds suspend tickets before provider calls and release sold stock only on verified success.
- Refresh rotation commits family revocation before returning reuse errors. Access tokens may survive logout for 15 minutes; role checks read current SQL roles.
- Public cache is eventually consistent, 60 seconds plus jitter, and indicative only. PostgreSQL catalog generation protects stale fills even after Redis invalidation failure.
- Local credentials/secrets are development configuration, never production defaults. No Stripe credentials are assumed.

## Verification checkpoint

Docker Desktop was started successfully after the initial missing-daemon probe. All compilation, lint, types, tests, runtime, demos and measurements ran in Docker; host Node was not used. SRS copy SHA-256 matches its original.

35 tests pass on real PostgreSQL/Redis/RabbitMQ/Mailpit, with two API instances for the 100-request/10-ticket race. Fresh schema startup and upgrade migrations work. Actual broker/cache/container restart recovery passes. Optimized non-root image completes API-only purchase with two durable tickets.

Final isolated five-minute load: 30,004 HTTP requests (30,002 scenario iterations plus two warmup requests), zero failures, no dropped iterations reported; catalog p95 3.53ms and reservation p95 9.70ms. Post-load snapshot: 15,001 units/bookings, zero inventory violations, zero pending/dead outbox rows. Earlier sequential-confirm backlog was measured and fixed using bounded concurrent publication with per-publication mandatory-return tracking; expiry/outbox batches are 100, ticker 250ms. See ADR 006 and performance.md for exact fixture/machine/evidence and preliminary failed/interrupted measurements.

Final review also added: winning capture association, immutable capture timestamps, nonterminal Stripe card-failure handling, durable rejected-command results, request/message correlation, logout/refresh family serialization, explicit APP_MODE and HTTPS cookie validation. No frontend implementation or browser tests were added. Development volumes were preserved.

Final handoff verification completed on 14 October 2026 (Africa/Cairo): rebuilt the optimized local API/worker, reran authenticated purchase to CONFIRMED with two tickets, checked API/worker readiness and empty outbox, verified Swagger HTTP 200 and non-root UID 1000, and compared the served OpenAPI JSON against both the runtime file and the delivered source artifact. All matched. Evidence: artifacts/delivery-runtime.log, artifacts/delivery-demo.log and artifacts/delivery-parity.json. Performance and traceability documents were regenerated from retained evidence.

Remaining external verification: real Stripe test account checkout/refund/reconciliation needs supplied test credentials; hosted GitHub Actions dispatch needs a Git remote. Implementations and commands exist; neither was fabricated as passed. Continuation when configured: run the read-only account smoke first, then exercise test-account checkout, signed webhook delivery, refund and reconciliation; dispatch the provided CI workflow after publishing the repository. No local backend implementation or handoff check remains pending.
