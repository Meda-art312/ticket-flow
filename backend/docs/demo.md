# API-only backend demonstration

1. Start and seed with README commands. Sign in using Origin=http://localhost:8080 and cookie jar; use returned bearer access_token.
2. Execute isolated acceptance tests: BE-AT-04 sends 100 concurrent distinct-key requests through api and api2 to a fresh ten-ticket category and asserts exactly ten successes plus SQL counters.
3. `docker compose --profile tools run --rm demo` reserves two refund-fixture tickets, obtains owned checkout, completes simulator success via authenticated HTTP, polls confirmation and prints ticket count. Browser is unnecessary.
4. Internal local tooling: POST `/api/v1/internal/simulator/events` with X-Internal-Secret and `{attempt_id,outcome:'success',event_id,delay_seconds:0}`. It signs server-generated evidence and accepts through the durable signature/inbox pipeline. Use a distinct event_id to test semantic duplicates; `decline` followed by `success` tests ordering. Only explicit local/test modes expose this endpoint. Never send its secret to a frontend.
5. Expire a hold in the isolated test fixture, submit late signed evidence, observe EXPIRED booking, SUCCEEDED payment, one compensation refund, no tickets and unchanged released stock.
6. In a disposable test project, stop RabbitMQ around a reservation, restart and observe pending outbox publication. Stop/restart workers to observe leases/redelivery. Do not delete volumes.
7. Check-in uses the +1h event; refunds use +72h. Submit check-in token in JSON body. Repeated admission is already_checked_in. Pending refunds suspend ticket use; sold inventory remains until verified success.
8. Cancel an event, inspect sweep/refunds and organizer financial report. Review query-plan/load artifacts and traceability for exact executed versus pending scenarios.

Simulator controls and Stripe credentials remain server-side. Return URLs never confirm a booking. The interactive frontend is deliberately outside this deliverable.
