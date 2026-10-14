# Architecture and correctness

The API and worker are entrypoints of one modular monolith. Identity, catalog, reservations, payments, ticketing, notifications, reporting and operations share PostgreSQL through explicit application services. HTTP validation is separate from transaction use cases and infrastructure adapters. SQL migrations are run by a single Compose service, never by replicas.

## Inventory and transactions

`capacity >= reserved_count + sold_count`, all counts nonnegative, are database CHECK constraints. Reservation uses a conditional UPDATE while holding the event lock. Category sums and venue limits are checked under the event/venue locks. Published commercial terms are immutable. A booking snapshots prices and commercial names.

Lock order is event → booking → category → payment/refund → tickets. Stable UUID ordering applies to sets. Discover immutable IDs before starting a transaction; acquire event lock before rereading any state. Canceling an event holds its event lock. Fan-out revisits affected bookings in bounded batches, so confirmation immediately preceding cancellation is included. Worker leases are claimed in separate short transactions and do not invert business locks. Retry only deadlocks and serialization failures, at most three attempts.

Confirmation uses database wall-clock time after lock acquisition. Only a RESERVED, unexpired booking for a PUBLISHED event can convert reserved into sold. Ticket `(booking_id, ordinal)` uniqueness protects issuance. Any other capture records a financial fact and one compensation refund. A still-RESERVED ineligible hold is released once; already terminal holds have no further inventory effect.

Refund requests lock the booking, inspect checked-in tickets, suspend use and persist the refund/outbox together. Check-in locks that same booking before ticket. Refund success releases sold stock only if the refund is associated with the confirmed purchase; compensating refunds never release sold stock. Failed customer refunds restore eligibility only for active events. Canceled events remain blocked independently of ticket state.

## Delivery and financial recovery

Checkout/refund identities commit before network calls. A crash can leave a leased unresolved operation; recovery uses the same identity. Stripe keys are reused only inside a conservative 23-hour window. Older unidentified operations are marked for manual reconciliation. Known provider IDs are retrieved safely. Signed webhook bodies are verified before a unique inbox insert; 2xx means durable acceptance, not confirmation. Inbox processing is independent of broker availability.

Outbox events commit with business writes. Publisher leases rows, uses mandatory routing and publisher confirms, and marks sent only after confirmation. Crash between confirm and marking produces redelivery. Consumer deduplication and durable notification creation commit in one transaction before acknowledgement. SMTP occurs later under a notification lease. SMTP can duplicate after send-before-record crashes. Retry work is bounded and dead-lettered; replay is admin-only, audited and preserves business identity.

## Data, performance and trust

Partial indexes cover reserved expiry and pending work. Discovery indexes cover state/start and venue/city. Report queries aggregate payments, refunds, tickets and inventory separately before joining, preventing multiplied money. Drift reports compare counters with booking states without automatically repairing history.

Redis cache keys include a PostgreSQL catalog generation and normalized bounded filters. A stale fill stays under an old generation. Redis timeouts fall back to bounded SQL; no private data or inventory decisions use Redis.

API trust boundaries: exact Origin checks on auth POSTs, bearer access tokens, HttpOnly rotated cookies, current SQL roles and query-level ownership, raw-body provider signatures, separate secret-gated internal simulator tooling. QR credentials are encrypted at rest and hashed for lookup; no PII is encoded. Logs include IDs/status only, never request bodies, tokens or financial credentials.

Diagram sources: [system](diagrams/system.mmd), [ERD](diagrams/erd.mmd), [booking states](diagrams/states.mmd), [purchase sequence](diagrams/purchase.mmd), [deployment](diagrams/deployment.mmd). Webhook payload associations, polymorphic aggregate IDs and processed-message identities are application-level associations, not SQL foreign keys; migrations are the physical schema authority.

The measured release uses 100-row outbox/expiry batches and a 250ms non-overlapping worker ticker. Publication is pipelined, with one mandatory-return dispatcher keyed by a unique transport publication identifier; individual rows are marked only after confirmation. Consumer prefetch is 10. Shutdown cancels the consumer and stops additional claims, leaving interrupted leases to recover. Commands preserve business rejections using a savepoint; unexpected/injected failures roll back the transaction. AsyncLocalStorage propagates HTTP request IDs into outbox/audit and verified webhook processing. See ADRs 005/006 and performance.md.

Production requires explicit APP_MODE, test-provider credentials and secure cookies; HTTPS URL configuration cannot silently issue non-Secure refresh cookies. Logout and refresh share a family advisory lock so a replacement cannot escape logout. A Stripe card decline does not close a hosted session: its attempt stays unresolved until terminal failure/expiry or verified success. The winning capture is independent of extra captures, and immutable captured_at supplies UTC daily capture aggregation.

Report definitions: captured/refunded money includes all verified facts, including compensation; net is the difference. confirmed_count includes CONFIRMED/REFUND_PENDING quantities; refunded_count includes REFUNDED quantities. ticket_count includes durable VOID rows; checked_in_count includes historical admission timestamps. Child aggregates are joined once per category. Daily sales use capture-record instants rather than later provider-observation times. Drift flags differences and never automatically repairs them.

Pinned versions include Node 24.21.0 LTS/npm 11.19.0, Nest 11.2.7/Express 5.3.0, TypeScript 5.9.3, Drizzle 0.45.4/pg 8.23.1, PostgreSQL 17.6, Redis 7.4.5, RabbitMQ 4.1.4, Jest 30.5.2 and k6 1.3.0. Manifests/lockfile and Compose hold exact pins. Production excludes test-only validators/types and test source. QR artifacts persist in PostgreSQL. Local single-node recovery is not high availability.

References: [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html), [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests), [Nest raw bodies](https://docs.nestjs.com/faq/raw-body), [RabbitMQ confirms](https://www.rabbitmq.com/docs/confirms).
