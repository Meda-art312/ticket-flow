# Backend Software Requirements Specification: TicketFlow

Version: 2.0  
Date: 13 October 2026  
Status: Backend implementation baseline; independently buildable API and workers  
Build prompt: `backend-codex-prompt.md`  
Companion specification: `frontend-srs.md` (separate implementation scope)

## 1. Purpose and success criteria

TicketFlow's backend manages event publication, transactional inventory reservations, payments, refunds, ticket issuance/check-in, asynchronous notifications, and organizer reports. It exposes an HTTP API used by a separately specified small frontend.

This SRS covers backend work only: Node.js, TypeScript, SQL modeling/optimization, architecture/planning, CRUD, concurrency-safe transactions, payment integration, Redis caching, RabbitMQ messaging, automated tests, and Docker-based build/runtime/delivery. React code, screen design, frontend containers, and browser test implementation belong to `frontend-srs.md`.

Success means a developer can build/run the backend using Docker without the frontend or host Node.js, complete credential-free API purchase/recovery demonstrations, and supply a stable OpenAPI contract to a separate frontend implementation. A real Stripe test-mode adapter must exist alongside the local simulator.

MUST/SHALL requirements are mandatory; SHOULD allows a documented alternative; MAY is optional. Sections 3-16 define backend requirements. Section 17 defines phases. Performance values are targets, not claimed measurements. The backend owns business rules and the API contract; the frontend owns presentation and browser interactions. Both specifications use integration contract version `ticketflow-api-v1`; neither requires implementing the other application's code.

## 2. Scope and assumptions

### 2.1 Included

- Email/password authentication, refresh sessions, role-based and ownership-based authorization.
- Venue, event, and ticket-category management.
- Public event discovery, filtering, and pagination.
- A browser-compatible HTTP contract, cookie/session support, and owned local checkout simulation endpoints; frontend implementation is separate.
- Time-limited inventory reservations and server-calculated price snapshots.
- Checkout, asynchronous payment confirmation, full-booking refunds, and reconciliation.
- Durable ticket records, QR payload generation, and single-use online check-in.
- Asynchronous notification delivery to a local SMTP capture service.
- Organizer sales reports, audit history, structured logs, health checks, and metrics.
- SQL migrations, seed data, OpenAPI documentation, automated tests, and CI.
- Dockerized compilation, development, runtime, test execution, and load testing.

### 2.2 Excluded from the MVP

Assigned seats, ticket transfers/resale, waiting lists, discount codes, partial refunds, multi-currency conversion, taxes, organizer payouts, connected merchant accounts, native mobile apps, offline check-in, Kubernetes, and independently deployed business microservices. All frontend code, styling, frontend image builds, and Playwright browser tests are outside this backend SRS. Keep Swagger and scripted API demonstrations for backend verification; the separate frontend supplies live browser journeys.

### 2.3 Product defaults

- Each event has one owner, one venue, one occurrence, and one configured currency.
- Default demo currency: USD; monetary amounts are integer minor units. Do not use floating point for money.
- Each booking contains one ticket category and 1-6 tickets. Buying multiple categories requires separate bookings.
- Reservation duration: configurable, default 10 minutes, measured using PostgreSQL time.
- Customers can cancel unpaid reservations. Confirmed purchases use the refund workflow.
- Customer-initiated full refunds are allowed strictly before 24 hours before the event starts, if no ticket in the booking has been checked in.
- Canceling an event triggers full refunds for confirmed bookings regardless of the normal refund cutoff.
- Stripe is the initial provider, using test credentials only. A deterministic simulator supports offline/local development.
- Product times are stored as UTC instants; each event also records an IANA timezone for display.
- No real-money processing is part of the portfolio acceptance criteria.

## 3. Actors and access rules

| Actor | Allowed capabilities |
|---|---|
| Visitor | Browse published events and register as a customer |
| Customer | Manage own profile and sessions, reserve tickets, manage own bookings, initiate checkout/refunds, read own tickets |
| Organizer | Customer capabilities plus manage own venues/events/categories, read own sales reports, check in tickets for own events |
| Administrator | Grant/revoke organizer access, inspect audit and recovery records, initiate event cancellation/refund recovery, replay failed work |
| Worker | Process internal jobs using infrastructure credentials; no public interactive login |
| Payment provider | Deliver signed webhooks to the designated endpoint |

AUTH-01: Public registration MUST create only a customer. Client-supplied privileged roles MUST be rejected or ignored safely. Organizer access requires an administrator action.

AUTH-02: Enforce ownership in the database query or service operation, not only in controllers. A customer cannot inspect another customer's booking; an organizer cannot modify another organizer's event or check in its tickets. Return 404 for inaccessible individual resources when appropriate to avoid enumeration.

AUTH-03: Hash passwords with Argon2id using configurable parameters. Use short-lived JWT access tokens, default 15 minutes, and opaque refresh tokens, default 7 days. Store refresh-token hashes, rotate refresh tokens, detect reuse, revoke the affected session family, and support logout. Never log tokens or credentials.

Logout revokes refresh sessions; previously issued access tokens may remain usable until their short expiry, which must be documented. Privileged role/ownership decisions must use current database authorization state so a revoked organizer/admin role cannot persist through stale JWT claims. MVP profile editing covers display name; email/password-change and account-recovery workflows are optional future work.

AUTH-04: Apply request validation, login/registration rate limits, explicit CORS configuration, request-size limits, and security headers. Document whether the initial rate limiter is per process; distributed enforcement is optional. Cache failure must not disable a security control silently.

AUTH-05: Seed one customer, two organizers, and one administrator for local demonstrations. Seed credentials must be local-only, supplied/documented through development configuration, and disallowed in a production configuration.

AUTH-06: Supply browser-safe authentication for the independent frontend: login/refresh return a short-lived access_token and expires_in; refresh tokens are opaque HttpOnly cookies with Path=/api/v1/auth and SameSite=Lax, Secure under HTTPS, and non-Secure only in explicit local HTTP mode. Logout clears the cookie using matching attributes. Browser access tokens are used as Authorization: Bearer credentials; do not require a refresh token in browser-readable JSON. Validate the Origin of cookie-using auth POSTs against an exact configured allowlist, reject missing/null/untrusted origins, and reject cross-site fetch metadata where provided. Do not use wildcard credentialed CORS. CLI/API tests must supply a permitted Origin and cookie jar. Support frontend origins through trusted reverse proxies without accepting arbitrary forwarded headers. Document refresh rotation/reuse behavior and test concurrent refresh protection on the backend.
## 4. Event and catalog requirements

CAT-01: Organizers SHALL create, read, update, and delete unreferenced venues they own. Venue fields include name, address, city, country, capacity, and timezone. Referenced venues may be archived, not hard deleted.

CAT-02: Organizers SHALL manage events with title, description, venue, start/end instants, display timezone, category label, sales-open/sales-close instants, and total capacity. Require sales-open < sales-close <= event-start < event-end. Event capacity cannot exceed venue capacity.

CAT-03: Event states are DRAFT, PUBLISHED, CANCELED, and COMPLETED. Valid transitions: DRAFT -> PUBLISHED or CANCELED; PUBLISHED -> CANCELED or COMPLETED. Completion requires event end time to have passed. Canceled/completed events cannot accept new reservations. State changes are audited.

CAT-04: Each ticket category has name, capacity, price, currency, and inventory counters. Sum of category capacities cannot exceed event capacity. The event must have at least one category to publish. A category with reservations or sales cannot be deleted.

CAT-05: Publishing freezes venue, event/sales times, capacity, currency, and category prices/capacities for the MVP. Title and description remain editable. This avoids changing the commercial terms of existing purchases. More flexible rescheduling is optional future work.

CAT-06: Public list/detail APIs expose only published events and public fields. Support city, category, start-date range, and bounded keyword filtering, with allowlisted sorting and pagination. Exclude private organizer/customer/payment information.

CAT-07: Canceling a published event MUST stop reservations and confirmation immediately through a durable event-state change. Expiration and refund fan-out may run asynchronously in bounded batches. Repeated cancellation must not duplicate inventory release or refunds.

## 5. Reservations, transactions, and inventory

BOOK-01: An authenticated customer SHALL reserve 1-6 tickets from one category while its event is PUBLISHED and inside its sales window. Snapshot category name, quantity, unit price, currency, total, and event reference. Never trust client-supplied totals.

BOOK-02: For each category, maintain capacity, reserved_count, and sold_count with constraints:

```text
capacity >= 0
reserved_count >= 0
sold_count >= 0
reserved_count + sold_count <= capacity
available = capacity - reserved_count - sold_count
```

BOOK-03: Reservation creation MUST atomically verify event eligibility and inventory, increment reserved_count, create a RESERVED booking with expires_at, persist the request's idempotency result, and insert relevant outbox records. Either all database changes commit or none do. Use row locks or a conditional SQL update with a correctness argument; an application-level read-then-write is insufficient.

BOOK-04: All competing booking/event operations MUST follow a documented lock order, recommended event -> booking when present -> category -> payment/refund. Multi-row category locks use stable identifier order. Use the same policy in API handlers and workers. Apply bounded retries for explicitly retryable transaction failures; do not retry arbitrary business failures.

BOOK-05: A successful confirmation moves quantity from reserved_count to sold_count, changes booking to CONFIRMED, creates exactly quantity durable ticket records, records the payment outcome, and inserts outbox records within one SQL transaction. Ticket uniqueness must prevent duplicate issuance. QR/email rendering happens after commit.

BOOK-06: Expiration/cancellation releases reserved inventory once. Confirmation and expiration MUST lock and re-check the same authoritative state so they cannot both win. A worker delay must never allow confirmation after the booking deadline. Workers should expire eligible reservations within 30 seconds under healthy local operation; processing time may exceed this while workers are stopped.

BOOK-07: Booking states are RESERVED, CONFIRMED, EXPIRED, CANCELED, REFUND_PENDING, and REFUNDED. EXPIRED and CANCELED are terminal reservation outcomes, even if a late payment subsequently requires a refund. Payment and refund states are recorded separately.

| Trigger | Transition | Inventory effect |
|---|---|---|
| Reserve | new -> RESERVED | reserved += quantity |
| Eligible payment success | RESERVED -> CONFIRMED | reserved -= quantity; sold += quantity |
| Hold expires | RESERVED -> EXPIRED | reserved -= quantity |
| Customer/event cancels hold | RESERVED -> CANCELED | reserved -= quantity |
| Eligible refund requested | CONFIRMED -> REFUND_PENDING | No release yet; block ticket use |
| Provider confirms full refund | REFUND_PENDING -> REFUNDED | sold -= quantity once; invalidate tickets |
| Terminal refund failure | REFUND_PENDING -> CONFIRMED | Retain sold inventory; restore ticket use only if event remains eligible |

BOOK-08: Use PostgreSQL time for deadline checks. At confirmation processing time, the booking must still be RESERVED, current database time must be strictly before expires_at, and the event must remain PUBLISHED. This is an explicit processing-time policy: even a payment captured earlier is refunded if its success is processed after the hold expires. Do not resurrect an expired booking or allocate inventory again for it.

BOOK-09: Require `Idempotency-Key` for reservation, checkout, cancellation, and refund commands. Scope by authenticated actor + operation + key; store a request hash and durable result. Same key/same payload returns the same logical outcome; different payload returns 409. Concurrent duplicates must be safe. Retain command keys for at least 7 days; financial provider keys and deduplication identities remain with their financial records. Bound key length and validate its format.

## 6. Payments, refunds, and reconciliation

PAY-01: Provide a `PaymentProvider` interface with Stripe and simulator adapters. Configure the adapter through environment validation. Stripe integration SHALL create hosted checkout sessions in test mode, verify webhooks, retrieve payment/refund state, and initiate full refunds. Application financial records must store provider identifiers and operation keys.

PAY-02: Checkout creation checks ownership, event eligibility, booking state, and deadline. Allow at most one unresolved payment attempt per booking. Persist the attempt/operation identity before the external call; call the provider outside database transactions using a stable provider idempotency key; persist the response afterward. On ambiguous timeout, recover that operation rather than create another charge attempt. Enforce provider-ID uniqueness and document recovery for a crash between provider success and local persistence. Respect the provider's idempotency-retention window: after it expires, do not blindly repeat an uncertain financial call; retrieve/reconcile the existing operation or require visible manual resolution.

PAY-03: The booking hold deadline is independent of the checkout provider's allowed session lifetime. Attempt to close an expired booking's provider session as cleanup, but never rely on session closure for inventory correctness. If the provider can still accept payment after the local hold ends, handle success through the late-payment refund path.

PAY-04: The browser success redirect MUST NOT confirm a booking. Accept only verified provider evidence through a signed webhook or authenticated reconciliation retrieval. Verify provider account/context, attempt association, currency, and paid amount against server-side records. Mismatches must not issue tickets and must enter a visible reconciliation state.

PAY-05: Verify webhook signatures against the raw request body before trusting content. Persist a unique provider event and durable processing work before returning 2xx; return a retryable error if durable storage fails. Process asynchronously. Duplicate deliveries must return success after verifying that the event is already durably accepted. Do not assume event delivery order.

PAY-06: Represent payment attempts using CREATED, PENDING, SUCCEEDED, FAILED, or CANCELED states, plus an explicit reconciliation marker for uncertain outcomes. A captured payment remains SUCCEEDED when refunded; use separate refund records. Do not regress SUCCEEDED because an older failure event arrives. A failed payment does not immediately release a still-valid hold; the customer may retry after its previous attempt is definitively resolved.

PAY-07: Late success, success for a canceled event/booking, or an unexpected extra successful attempt MUST NOT issue tickets. Record the actual payment and durably request a full compensating refund. Deduplicate using the provider payment ID and refund business reason. An additional successful attempt must not alter an already confirmed booking's inventory or tickets.

If a late-success handler finds the hold still RESERVED because the expiry worker has not run, it must atomically move it to EXPIRED and release its reserved quantity before scheduling the refund. If the event is canceled, move a still-RESERVED hold to CANCELED instead. A hold already EXPIRED/CANCELED requires no inventory change. The compensation refund for an unconfirmed payment must never decrement sold_count.

PAY-08: A customer's refund command checks ownership, the cutoff using database time, confirmed state, and absence of checked-in tickets while holding the booking lock. Persist REFUND_PENDING, ticket-use suspension, a refund request, and outbox work atomically. A refund worker calls the provider outside the transaction with a stable idempotency key. Only verified provider refund success releases sold inventory. Transient failures remain pending with retries; terminal failures are visible and audited. Canceled events always keep tickets unusable, even if a refund fails.

PAY-09: Event cancellation and payment confirmation MUST serialize using the event lock. Whichever operation commits first determines the booking path; a booking confirmed immediately before cancellation must be picked up by cancellation refund processing. The cancellation sweep must be resumable and reconcile missed work until all affected bookings reach an appropriate outcome.

PAY-10: Run periodic reconciliation, default every 5 minutes, for unresolved attempts/refunds and accepted but unfinished webhooks. Query provider state through the adapter and reuse the same transition handlers and idempotency protections. Provide administrator visibility and controlled retry actions. Never mark refunds successful only because a request was accepted.

PAY-11: Simulator mode SHALL provide deterministic success, failure, delayed success, duplicate/out-of-order delivery, refund failure, and ambiguous-timeout scenarios. Its internal fault-injection/control endpoints must be authenticated with a separate local test secret and enabled only in explicit development/test mode. A distinct customer-facing demo checkout may accept success/decline actions using normal customer authentication, session ownership, and server-side validation as defined in PAY-12; it must not reveal or accept the internal simulator secret. Test signatures and event identities must exercise the durable webhook path. Never expose simulator controls in production or accept unsigned fabricated events on the Stripe endpoint.

PAY-12: Provide local-only customer demo checkout endpoints distinct from internal fault injection. Create an opaque checkout session tied to a persisted payment attempt and booking owner; GET returns safe session details and POST /complete accepts outcome=success|decline plus Idempotency-Key. Require normal authentication, session ownership, and APP_MODE=local|test. Atomically guard completion so repeated or conflicting requests cannot produce different provider outcomes. The server generates signed simulator evidence and feeds the durable webhook pipeline; never directly confirm a booking from a browser command. Keep signing/control secrets server-side. Configure FRONTEND_ORIGIN (local default http://localhost:8080) to construct demo checkout and provider-return URLs; allowlist redirects. Return paths are /demo/checkout/:sessionId and /checkout/return?booking_id=:id. A return URL is navigational only and conveys no proof of payment. Disable local demo routes in production application mode. API contract tests must prove this flow without a frontend.
## 7. Tickets, check-in, and notifications

TKT-01: Create one ticket per booked unit using a unique (booking_id, ordinal) constraint. Ticket states include VALID, CHECKED_IN, SUSPENDED, and VOID. Include a non-guessable check-in token; store its hash and protect any recoverable representation. Customers may fetch only their own tickets.

TKT-02: QR payloads MUST contain no customer PII or financial secrets. They encode the ticket's opaque credential. Public catalog endpoints must never expose it.

TKT-03: Organizer check-in verifies ownership, event state, event time window, confirmed booking, and usable ticket in one transaction. Default entry window: 2 hours before event start through event end. Lock the booking before the ticket, consistent with the global lock order. Repeated scans return a clear already-checked-in result without a second admission. Refund initiation and check-in must serialize so a checked-in booking cannot receive a normal customer refund.

TKT-04: Consumers generate QR artifacts and send confirmation/refund emails to Mailpit locally. A rendering/email failure must not undo a confirmed purchase. Persist notification jobs, retry transient failures, and expose failure/retry status. An authenticated ticket retrieval endpoint remains available if email fails.

TKT-05: Database updates and broker consumption must be idempotent. SMTP sending can still duplicate after a crash between send and local recording; document that limit and use a provider idempotency mechanism if a future provider supports one. Do not claim exactly-once email delivery.

## 8. SQL data model and reporting

Use PostgreSQL with migrations and explicit foreign keys, not schema synchronization at application startup. Suggested entities:

| Entity | Important data and constraints |
|---|---|
| users / user_roles | UUID, normalized unique email, password hash, role memberships |
| refresh_sessions | user, hashed token, family, expiry, revocation/rotation metadata |
| venues | owner, address, timezone, positive capacity, archived_at |
| events | owner, venue, state, sales/start/end instants, capacity, currency, version |
| ticket_categories | event, price_minor, capacity, reserved_count, sold_count; inventory checks |
| bookings | customer, event, category, quantity, snapshots, state, expires_at |
| payment_attempts | booking, provider, unique provider payment/session identities, amount/currency, state, operation key |
| refunds | payment attempt, optional confirmed booking association, amount, reason, state, unique operation/provider IDs |
| tickets | booking, ordinal, state, token hash, check-in timestamp/actor |
| webhook_events | unique (provider, event_id), processing state, attempts, redacted/limited payload |
| outbox_events | stable UUID, event type/version, aggregate ID, payload, timestamps, lease/retry metadata |
| processed_messages | unique (consumer_name, event_id), completion timestamp |
| notification_jobs | unique business delivery key, state, retry metadata |
| idempotency_requests | actor/operation/key uniqueness, request hash, durable result, expiry |
| audit_logs | actor, action, resource, correlation ID, timestamp, redacted metadata |

DATA-01: Add check constraints for quantities, money, counters, date order, and state-dependent nullability where practical. Cross-table rules require transactional enforcement; do not pretend a row check constraint validates other rows automatically.

DATA-02: Index event discovery filters, bookings by customer/date, RESERVED bookings by expires_at, pending outbox/refund/webhook work, and ticket lookup. Use partial indexes where useful. Explain index selection in the architecture document.

DATA-03: Provide organizer-scoped SQL reports for confirmed/refunded ticket quantities by event/category, captured payments, successful refunds, net collected amount, and daily sales. Define financial reports from payment/refund facts, separately from inventory state. Aggregate child tables before joining where necessary to avoid multiplying totals.

DATA-04: Include parameterized handwritten SQL for the concurrency-critical inventory operation and at least two reporting queries. Include realistic seed data and `EXPLAIN (ANALYZE, BUFFERS)` evidence for discovery and a report query, showing an actual measured optimization if one is needed. Run analysis against demo/test data only.

DATA-05: Reconcile counters against authoritative booking states and flag differences. A drift check must alert/report; automatic repair is optional and requires an audited procedure. Preserve financial and audit history; delete only unreferenced drafts and never cascade-delete payments.

## 9. Architecture and module boundaries

ARCH-01: Use a backend modular monolith with separate API and worker entrypoints and one PostgreSQL database. Modules: identity, catalog, reservations, payments, ticketing, notifications, reporting, and operations. Keep HTTP DTOs, business use cases, and infrastructure adapters distinct. The independent frontend communicates over HTTP only and never accesses infrastructure directly. For new code, use a self-contained backend/ directory with its own package manifest, lockfile, Dockerfile, and Compose configuration; frontend/ is a separate sibling or repository. Preserve compatible existing layouts.

ARCH-02: Baseline stack: Node.js supported LTS, TypeScript strict mode, NestJS with its default Express adapter, PostgreSQL, Drizzle ORM/migrations plus parameterized SQL, Redis, RabbitMQ, Jest, Supertest, k6, and npm with a committed lockfile. Select compatible stable versions during implementation and record them. Use SQL transactions that retain one database connection across all statements.


ARCH-03: Controllers validate input and delegate; use cases own transaction boundaries. Other modules must not write a module's tables through arbitrary repositories. Expose explicit application services for cross-module changes that must share a transaction.

ARCH-04: Database state and outbox insertion commit together. An outbox publisher leases pending rows in bounded batches, publishes with confirms and routing checks, then records publication. A crash after publish but before marking published causes redelivery, which consumers must tolerate. Never mark publication before confirmation or assume a broker confirm means consumer completion.

ARCH-05: Workers and schedulers must support multiple instances using row claiming/leases or `FOR UPDATE SKIP LOCKED`, including lease recovery. Do not hold a database transaction open during payment, broker, SMTP, or other remote network calls.

ARCH-06: Provide architecture, ERD, reservation/payment sequence, state-transition, and deployment diagrams as text-maintainable Mermaid or equivalent files. Document lock ordering, authoritative states, failure handling, and trust boundaries.

## 10. RabbitMQ and asynchronous workflows

MSG-01: Use durable exchanges/queues, persistent messages, publisher confirms, manual consumer acknowledgements, and bounded prefetch. Document that single-node local Docker infrastructure demonstrates recovery behavior, not high availability.

MSG-02: Each message envelope has event_id, event_type, schema_version, occurred_at, aggregate_id, correlation_id, and payload. Suggested events: ReservationCreated, ReservationExpired, BookingConfirmed, EventCanceled, RefundRequested, RefundSucceeded, and TicketArtifactsRequested. Exclude passwords, card data, and access/refresh tokens.

MSG-03: A consumer records its deduplication identity with its transactional database effects, then acknowledges after commit. Use a separate deduplication scope per consumer. Remote side effects require their own durable job and operation identity; a processed-message record alone cannot guarantee exactly-once remote execution.

MSG-04: Retry transient errors with bounded delayed retries, default 5 attempts with increasing delays. Avoid immediate infinite requeue loops. Send exhausted or malformed jobs to a dead-letter queue with metadata and redacted error details. Support audited administrator replay using the original business identity; a replay must not create duplicate financial effects.

MSG-05: RabbitMQ downtime must not roll back an otherwise valid reservation/confirmation transaction: outbox work remains durable and catches up after recovery. Expose backlog age and failed deliveries. A database poller must independently discover expired reservations; expiration cannot depend solely on one delayed broker message.

## 11. Redis caching

CACHE-01: Use cache-aside for public event list/detail responses. Default TTL: 60 seconds with small jitter. Keys include normalized filters/pagination, schema version, and a catalog generation identifier. Bound key creation and query limits.

CACHE-02: After catalog mutation commits, attempt cache invalidation promptly and also persist a durable invalidation event. Account for in-flight cache fills by generation/versioned keys or a documented equivalent. If invalidation cannot run, cached catalog content may remain stale until TTL; document this bounded eventual consistency.

CACHE-03: Inventory and payment decisions MUST always read/write PostgreSQL. Cached catalog responses must label availability as indicative or omit exact availability. A canceled event shown briefly by a stale cache still cannot accept a booking.

CACHE-04: Redis errors/timeouts must fall back to bounded database reads, with short cache-operation deadlines, metrics, and graceful behavior. No private customer responses are cached in the MVP. Measure hit/miss behavior and verify invalidation and outage scenarios.

## 12. API requirements

Prefix application routes with `/api/v1`. Publish OpenAPI at `/docs` in development; explicitly configure its production exposure. Representative required surface:

| Route | Purpose |
|---|---|
| POST /auth/register, /auth/login, /auth/refresh, /auth/logout | Identity lifecycle |
| GET/PATCH /me | Own profile |
| POST/GET/PATCH/DELETE /organizer/venues[/:id] | Owned venue management |
| POST/GET/PATCH/DELETE /organizer/events[/:id] | Owned event management; draft deletion only |
| POST /organizer/events/:id/publish, /cancel | Event commands |
| POST/GET/PATCH/DELETE /organizer/events/:id/categories[/:categoryId] | Owned category management |
| GET /events, /events/:id | Public discovery |
| POST /bookings | Reserve inventory |
| GET /bookings, /bookings/:id | Own bookings |
| POST /bookings/:id/cancel, /checkout, /refund | Idempotent booking commands |
| GET /bookings/:id/tickets | Own issued tickets/artifact status |
| GET /tickets/:id | Own ticket detail/QR representation |
| POST /organizer/events/:id/check-ins | Online check-in using token in request body |
| GET /organizer/events/:id/reports/sales | Owned event report |
| POST /webhooks/stripe | Signed Stripe webhook |
| GET /demo/checkout/:sessionId | Local-only demo checkout details for the authenticated session owner |
| POST /demo/checkout/:sessionId/complete | Local-only, idempotent success/decline action; server emits signed simulator evidence |
| GET /admin/operations/* | Failed work, reconciliation, audit visibility |
| POST /admin/operations/:kind/:id/retry | Authorized, audited replay/reconciliation |

API-01: Use consistent JSON errors with code, message, request_id, and optional field errors. Typical status codes: 400 invalid input, 401 unauthenticated, 403 forbidden action, 404 inaccessible/missing resource, 409 state/idempotency/inventory conflict, 429 throttled, and 503 required dependency unavailable.

API-02: Use bounded pagination, default 20 and maximum 100. Reject unknown sort columns and malformed timestamps/UUIDs. Parameterize SQL. Add request IDs to responses/logs and propagate correlation IDs to messages.

API-03: Reservation creation returns id (the booking identifier), state, quantity, price snapshot, expires_at, and indicative availability if included. Checkout returns an attempt ID and hosted URL when ready, or an explicit pending/recovery result. Refund submission returns an asynchronous status; clients query the booking for completion. Document these response schemas and retries.

Booking detail SHALL also expose server_time, current payment/refund status, safe ticket/artifact status, and permitted actions with useful unavailability reasons, so the UI can represent pending work and eligibility without inventing financial state. `/me` returns current role memberships for navigation. Financial/provider secrets must never appear in these responses.

API-04: Protect simulator routes separately and document them only in local/test mode. Never place ticket tokens in URL query strings that would appear in access logs. Check-in submits the token in a request body, redacted from logs.

### 12.1 Frontend integration contract (backend-owned)

API-05: Publish a machine-readable OpenAPI artifact at `docs/openapi.json` and serve it at `/api/v1/openapi.json` in local/test mode. Define exact request/response/error DTOs, nullable fields, enums, auth/cookie behavior, idempotency headers, and pagination. Contract identifier: ticketflow-api-v1. Use UUID strings, snake_case JSON keys, UTC ISO-8601 instants, integer minor-unit amounts, and explicit currency strings. Freeze the contract before independent frontend integration. Preserve backward compatibility within v1; document intentional breaking changes and coordinate consumers rather than silently changing fields. Validate representative responses with contract tests. This SRS defines required semantics; generated/validated OpenAPI supplies exact DTOs.

Minimum response semantics to specify in OpenAPI:

| Resource | Required fields/behavior |
|---|---|
| Auth | access_token, expires_in; HttpOnly refresh cookie; /me contains user id, display_name and current roles |
| Public events | id, title, venue/location, start/end and sales instants, timezone, category data with price_minor/currency and indicative availability |
| Lists | items array and pagination {page, page_size, total}; default page 1/page_size 20, maximum 100 |
| Reservation | id, state, quantity, unit_price_minor, total_minor, currency, expires_at, server_time, event/category snapshots |
| Booking detail | reservation fields plus payment {state, reconciliation_required}, refund {state, reason} or null, ticket/artifact status, allowed_actions and unavailability reasons; never financial secrets |
| Checkout | attempt_id, status=ready|pending, checkout_url or null, mode=simulator|stripe_test; pending indicates safe recovery, not an invitation to create another attempt |
| Demo session | id, booking_id, amount_minor, currency, status, allowed_outcomes; signed evidence generated only server-side |
| Tickets | id, booking_id, state, artifact_status, QR representation and opaque check-in credential for the owner only; expose QR SVG or a protected artifact URL with documented rendering rules |
| Check-in | status=admitted|already_checked_in on successful/repeated admission; documented structured errors for wrong event or unusable ticket |
| Sales report | captured_minor, refunded_minor, net_collected_minor, currency, inventory/ticket counts and category rows with defined aggregation |
| Errors | code, message, request_id, optional field_errors; stable inventory/deadline/auth/idempotency conflict codes |

Refund states for the contract: REQUESTED, PROCESSING, SUCCEEDED, FAILED, with nullable absence before a refund exists. Artifact states: PENDING, READY, FAILED. allowed_actions is an object keyed by checkout, cancel, refund, with {allowed: boolean, reason: string|null}. Booking states remain BOOK-07; payment states remain PAY-06. Current enum values, example payloads, and HTTP codes must agree with OpenAPI.

API-06: Publish `docs/frontend-integration.md` with auth/Origin/cookie setup, proxy expectations, frontend return URLs, simulator routes, local fixtures, and contract-export instructions. The normal browser API path is same-origin /api/v1 through a frontend-owned proxy; upstream API listens on port 3000. The backend may run and be tested without that proxy. Provide seeded refund-eligible, check-in-eligible, and contention events. Document an optional shorter local-only reservation duration, retaining the normal default elsewhere. If deployed separately, configure exact allowed origins and public URLs explicitly; never assume Docker DNS names are browser URLs.

## 13. Docker build, local runtime, and CI

DOCKER-01: Docker is required for backend development/build/test. Docker Engine/Desktop with Compose v2 and Git are prerequisites; host Node.js or infrastructure installations are not. The backend starts and passes its own acceptance tests without any frontend source/container.

DOCKER-02: Provide dependency, development, build, test, and production stages in the backend Dockerfile. Use the lockfile, compile TypeScript in Docker, and copy only compiled assets/runtime dependencies to a non-root production image. Supply .dockerignore and no embedded secrets. Do not build React assets in this image.

DOCKER-03: Backend Compose owns api, worker, postgres, redis, rabbitmq, mailpit, a one-shot migrate service, and seed/test/load/demo tooling. API and worker can share the image with distinct commands. No web service is required by this specification. For new local setups, create a named Compose network, default ticketflow-local, configurable via TICKETFLOW_NETWORK; give the API network alias api and container port 3000. The separate frontend joins this existing network and proxies to http://api:3000. The backend does not depend on a frontend container. Bind host API/admin ports to loopback for local development where practical.

DOCKER-04: Health-check PostgreSQL, Redis, and RabbitMQ; use readiness-aware dependencies and wait for successful one-shot migrations before API/worker startup. Do not run migrations concurrently in each replica. Also handle dependency loss/reconnection after startup.

DOCKER-05: Persist database/broker/artifact data in named volumes. Use private networking and graceful shutdown. Never delete development volumes automatically. Document backup/restore and separate opt-in test cleanup.

DOCKER-06: Pin compatible image versions and dependencies, commit the lockfile, and supply .env.example. Configure simulator and Stripe-test modes without secrets in source control. Separate APP_MODE=local|test|production from NODE_ENV/build optimization: optimized images may run in explicit local simulator mode. Production application mode must reject demo credentials/simulator endpoints; reject live Stripe keys for portfolio acceptance. Configure FRONTEND_ORIGIN and trusted proxy/origin settings independently of whether the frontend is running.

DOCKER-07: Implement equivalent commands, run from backend/ (or the documented backend repository root):

```sh
# Copy .env.example to .env for your shell, then:
docker compose up --build -d
docker compose --profile tools run --rm seed
docker compose logs -f api worker

# Self-contained isolated test stack, never the development database:
docker compose -p ticketflow-backend-test -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from test

docker build --target production -t ticketflow-backend:local .
docker compose --profile tools run --rm demo
docker compose --profile load run --rm load
docker compose down
```

Use isolated, project-scoped test networks/volumes; do not give test stacks the fixed ticketflow-local development network. Publish the API/Swagger URLs and explain how the frontend can join the configured development network after backend startup. Exact file/service names may differ if the documentation and independent build guarantees remain accurate.

DOCKER-08: Backend CI runs containerized lint, type-check, unit/integration/API/contract tests and a production image build/start. Use real PostgreSQL, Redis, RabbitMQ, and the simulator where applicable. Stripe smoke tests are opt-in with test credentials. Browser/Playwright tests are owned by the frontend SRS, not a prerequisite for declaring backend-only verification passed. Report unrun checks honestly.

## 14. Nonfunctional and operational requirements

NFR-01: Correctness takes priority over throughput. No accepted workflow may violate inventory bounds, issue duplicate ticket records, or intentionally repeat a financial operation on retry. Do not promise end-to-end exactly-once delivery.

NFR-02: Benchmark targets on a documented developer machine: cached public reads p95 < 200 ms and reservation requests p95 < 500 ms at 50 requests/second for 5 minutes, excluding third-party checkout latency. Report observed latency, errors, resource limits, dataset, and configuration. An unmet target requires analysis, not invented results or weakened consistency.

NFR-03: Expose `/health/live`, `/health/ready`, and metrics. API readiness requires PostgreSQL and a compatible migrated schema. Redis/RabbitMQ failures are degraded conditions when database-backed functionality can still operate. Worker readiness reports ability to process work; include separate status for broker and backlog. Use dependency timeouts so health routes cannot hang.

NFR-04: Emit structured JSON logs with request/correlation IDs and redaction. Metrics include request latency/errors, cache hit/miss/failure, reservation conflicts/expiry lag, outbox backlog/oldest age, message retries/dead letters, payment/refund reconciliation age, and notification failures. Do not use unbounded customer or booking IDs as metric labels.

NFR-05: On SIGTERM, stop accepting/claiming work, finish bounded in-flight work, close database/broker connections, and allow leases/unacknowledged messages to recover. Provide an operational runbook for restarts, stuck jobs, provider uncertainty, database backup/restore, and safe replay.

NFR-06: Use environment-based secrets, authorization on operational endpoints, redacted audit data, and no card-number/CVC storage. Store only required provider references and limited webhook payloads. Document retention defaults and avoid presenting the demo as certified or compliant with a specific regulation.

## 15. Verification and acceptance criteria

Use a controllable clock abstraction for unit tests and seeded database deadlines for integration tests. Test true competing database connections, not serialized mocks. Use deterministic synchronization where possible rather than flaky sleeps.

| ID | Acceptance scenario and required result |
|---|---|
| BE-AT-01 | Fresh backend-only Docker setup builds, migrates, starts healthy API/worker/infrastructure, seeds local users, and exposes the API without frontend source or host Node.js |
| BE-AT-02 | Public registration cannot create organizer/admin privileges; cross-customer/organizer access fails without leaking private data |
| BE-AT-03 | CRUD validation, draft deletion, referenced-resource restrictions, publication rules, and catalog filtering/pagination work |
| BE-AT-04 | With capacity 10 and no other inventory, 100 concurrent one-ticket reservations using distinct keys and multiple API instances yield exactly 10 successful reservations; remaining requests fail with documented conflicts; counters stay valid |
| BE-AT-05 | Concurrent identical reservation requests with the same key create one booking and one inventory change; changed payload with that key returns 409 |
| BE-AT-06 | Inject a failure before reservation/confirmation transaction commit: no partial booking, ticket, counter, idempotency result, or outbox effect persists |
| BE-AT-07 | Reservation expiry versus payment success produces one winning reservation outcome, no double release, and no oversell; include the exact deadline boundary and cancellation races |
| BE-AT-08 | A verified eligible successful payment creates one confirmed booking and exactly quantity ticket rows; browser redirect alone cannot confirm |
| BE-AT-09 | Repeated/out-of-order webhook deliveries, including semantic duplicates referencing the same payment, do not repeat ticket issuance or counters; invalid signatures and amount/currency mismatches cannot confirm |
| BE-AT-10 | Success processed after expiry or cancellation creates no tickets, records actual payment, and requests one compensating refund; refund success causes no second reservation release |
| BE-AT-11 | Provider success followed by a simulated local crash/timeout is recovered using stored operation identity/reconciliation without a second charge/refund operation |
| BE-AT-12 | Eligible full refund blocks check-in while pending and releases sold inventory only on verified refund success; terminal failure retains inventory and tickets remain blocked for canceled events |
| BE-AT-13 | Concurrent check-in scans admit one ticket once; concurrent check-in/customer refund cannot both succeed; wrong organizer and invalid/revoked tokens fail |
| BE-AT-14 | Catalog cache hit/miss is observable; mutation invalidation, stale-fill protection, TTL behavior, and Redis outage fallback work without using cached inventory for booking |
| BE-AT-15 | Stop RabbitMQ, commit business changes, restart it: outbox work eventually publishes; publisher/consumer crash redelivery creates no duplicate database business effects |
| BE-AT-16 | Exhausted retries enter a dead-letter queue; authorized replay is audited and idempotent; two workers cannot double-expire a booking |
| BE-AT-17 | Event cancellation racing with reservation/confirmation stops future sales, releases holds once, and eventually refunds every captured affected payment |
| BE-AT-18 | Reports reconcile against payment/refund facts and booking inventory across duplicate deliveries and refunds; joins do not multiply totals |
| BE-AT-19 | Refresh rotation/reuse detection, logout, input validation, rate limiting, and simulator-mode protection pass API tests |
| BE-AT-20 | Restart containers without deleting volumes: bookings, financial identities, pending jobs, and tickets persist and unfinished work resumes |
| BE-AT-21 | Mail delivery/QR rendering failure preserves confirmed bookings; jobs retry and ticket retrieval remains available; known SMTP duplicate-delivery limitation is documented |
| BE-AT-22 | Containerized backend checks, API contract tests, production image build/start, and API simulator checkout pass without a frontend; load report contains measured results/SQL analysis and README commands are exercised |

Test layers: unit domain/state tests; real PostgreSQL constraint/locking/rollback/report tests; HTTP/API and authorization tests; real Redis/RabbitMQ cache/recovery tests; OpenAPI/DTO contract tests including browser-compatible auth and owned demo checkout; simulator contracts; opt-in Stripe test smoke tests; k6 contention/load. Map requirements and BE-AT IDs to real tests. Browser journeys are a separate frontend verification responsibility.

## 16. Required repository deliverables

- Backend README: independent Docker setup, API/Swagger URLs, local account configuration, API purchase/demo/recovery walkthrough, limitations.
- `docs/backend-srs.md`, `docs/backend-implementation-plan.md`, and `docs/backend-requirements-traceability.md` with progress and tests.
- `docs/architecture.md`, ERD/state/sequence/deployment diagrams, and ADRs for locking, SQL, outbox, payment recovery, caching, auth contract, and Docker.
- `docs/openapi.json` and `docs/frontend-integration.md`: backend-owned contract artifacts for the separate frontend.
- `docs/runbook.md`, `docs/demo.md`, `docs/performance.md` with observed evidence.
- API/worker code, migrations, seed data, environment examples, backend Dockerfile/Compose, CI, tests, demo/load scripts.
- No required frontend application or browser-test code; no placeholders presented as completed backend features.

## 17. Incremental implementation plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Plan/contract | Requirements inventory, architecture/ERD/state/sequence diagrams, initial ADRs, OpenAPI baseline, integration notes | Invariants, lock order, deadlines, auth and payment recovery documented; v1 consumer contract reviewable |
| 1. Foundation | Independent Docker API/worker stack, migrations, logs/health, auth/ownership, OpenAPI export | BE-AT-01/02/19 foundations; containerized checks and cookie/Origin tests pass |
| 2. Catalog/reservations | CRUD/publication, inventory SQL, idempotency, expiry, outbox | BE-AT-03 through BE-AT-07 reservation cases; real contention passes |
| 3. Purchase/tickets | Simulator plus Stripe-test adapters, durable webhooks, recovery, confirmation/tickets, owned demo checkout HTTP contract | BE-AT-08 through BE-AT-11; API-only purchase journey and contract examples pass |
| 4. Reliability/refunds | RabbitMQ, retries/DLQ/replay, cancellation, refunds/reconciliation, check-in, notifications | BE-AT-12/13/15/16/17/20/21 |
| 5. Cache/reports | Redis cache/invalidation/fallback, SQL reporting and query analysis | BE-AT-14/18; measured evidence recorded |
| 6. Backend release | CI, multi-instance/load/recovery checks, final OpenAPI compatibility and traceability | BE-AT-22 and remaining backend cases pass or exact blockers listed |

Keep completed slices independently runnable. Export/update contract artifacts as endpoints stabilize and notify the frontend through documentation, not silent field changes. Do not wait for frontend implementation to prove backend correctness. If credentials or Docker are unavailable, complete unaffected work and record exact unrun checks; never invent results.

## 18. Backend demonstration script

1. Start backend Docker services, seed scenario events/users, log in using an API client/script with the permitted Origin and cookie jar.
2. Run 100 competing reservations against 10 tickets using multiple API instances; print outcomes and SQL invariants.
3. Create a reservation/owned demo checkout session, complete success through its protected HTTP action, poll the booking, and fetch tickets. Replay webhook evidence and show no duplicate issuance.
4. Expire a hold and send late signed success through protected tooling; show compensation without tickets or duplicate inventory release.
5. Stop/restart RabbitMQ around committed work; show outbox catch-up and notification processing.
6. Exercise one-time check-in and refund on separate eligible events/bookings.
7. Cancel an event with holds and captured payments; show eventual release/refunds and blocked admission.
8. Show scoped SQL reports, cache metrics, actual test/load/query-plan evidence, and the exported frontend contract.

## 19. Technical references

These references inform implementation mechanics. Product choices such as hold length and late-payment policy are defined by this SRS.

- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/): separate compilation/test dependencies from the runtime image.
- [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/): health-aware startup and successful one-shot dependencies.
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): coordinating competing transactional updates.
- [Stripe webhooks](https://docs.stripe.com/webhooks): signature verification, duplicate delivery, ordering, and asynchronous processing.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests): stable operation identities and provider retries; respect provider-specific retention/behavior during reconciliation.
- [RabbitMQ acknowledgements and publisher confirms](https://www.rabbitmq.com/docs/confirms): publication acceptance versus consumer processing acknowledgement.

## 20. Revision history

| Version | Change |
|---|---|
| 1.0 | Original backend baseline |
| 1.1 | Combined backend/frontend baseline |
| 2.0 | Independent backend SRS; frontend requirements moved to frontend-srs.md; explicit backend-owned API/auth/demo/Docker integration contract |
