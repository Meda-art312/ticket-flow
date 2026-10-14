# Operational runbook

## Start, stop and dependency recovery

Run commands from backend/. `docker compose up --build -d` waits for healthy PostgreSQL/Redis/RabbitMQ and successful migrate. API and worker reconnect after dependencies return. `docker compose down` preserves data; never delete development volumes to fix a transient failure. SIGTERM stops work claims and waits up to 30 seconds before closing connections; unacknowledged broker deliveries and expired SQL leases recover.

API readiness requires database and migrated schema, with 3-second connection and bounded statement timeouts. Redis is a degraded dependency; SQL still serves public reads. RabbitMQ outage leaves business transactions/inbox work intact in SQL. Worker readiness reports broker separately. Use `/metrics` and admin operations to inspect outbox age, expiry lag, retries and reconciliation.

## Stuck work and replay

Authenticate as admin with the configured Origin. GET `/api/v1/admin/operations/{payments,refunds,outbox,webhooks,notifications,dead-letters,audit}` returns at most 100 rows; `/api/v1/admin/operations/drift` reports all inconsistent categories. POST `/api/v1/admin/operations/:kind/:id/retry` queues supported dead/pending work and writes an audit entry; identities are retained. Never change payment amount/operation keys to bypass an uncertain provider operation. Old unidentified Stripe operations require provider-side investigation; record/reconcile the existing identity before retrying. A failed definitive refund is visible; recovery must revalidate eligibility and must never blindly create a second successful refund.

Dead letters retain original event identity. Broker publishes are persistent, mandatory and confirmed. Processed-message identities prevent database effects from repeating on replay. SMTP can duplicate after send-before-record; stable Message-ID reduces user confusion but is not a guarantee.

## Financial recovery

Default reconciliation cadence: 5 minutes. Unknown checkout/refund identities are retried only inside a conservative 23-hour window, then marked manual. Known provider IDs are retrieved outside transactions. Captured payment remains SUCCEEDED after refunds. Late captures are compensated, never reallocated. Event cancellation persists CANCELED first; repeated bounded sweeps release holds and request captured-payment refunds. Inventory drift is reported, not automatically repaired. Any correction needs an audited, reviewed transaction against booking/financial facts.

Stripe test configuration requires STRIPE_SECRET_KEY (`sk_test_...`), STRIPE_WEBHOOK_SECRET and STRIPE_ACCOUNT_ID. Verify account identity at deployment. Forward test webhooks to `/api/v1/webhooks/stripe`; the raw-body signature is mandatory. No live keys, card data or signing secrets in source/logs.

## Backup and restore

```sh
docker compose exec -T postgres pg_dump -U ticketflow -d ticketflow -Fc > ticketflow.dump
# Restore only into an explicitly selected empty recovery database:
docker compose exec -T postgres createdb -U ticketflow ticketflow_recovery
docker compose exec -T postgres pg_restore -U ticketflow -d ticketflow_recovery < ticketflow.dump
```

On PowerShell use binary-safe redirection (PowerShell 7.4+) or run these redirections in a shell with binary preservation. Keep TOKEN_ENCRYPTION_KEY backed up securely with the database; losing it prevents decrypting existing ticket credentials. Test restores separately; never overwrite the development DB casually. Broker volumes preserve queued messages; SQL inbox/outbox/leases remain the recovery source.

## Retention and security

Command keys retain at least 7 days (no automatic deletion currently). Financial identities, dedupe/audit history are retained; define an explicit archival policy before operating at scale. Inbox stores normalized limited evidence, not entire provider payloads. Cookies and ticket credentials must not be logged. Application logs emit route templates, status, request IDs and bounded operational fields. Metrics avoid customer/booking labels. Private endpoints are never cached. Demo secrets are explicit local-only environment values; production mode rejects them.
