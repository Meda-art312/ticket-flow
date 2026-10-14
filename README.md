# TicketFlow

An event ticketing platform with a **Node.js/TypeScript backend** and a compact React frontend. The API handles discovery, inventory holds, checkout, refunds, ticket issuance and organizer admission. PostgreSQL owns inventory and financial state; Redis and RabbitMQ support caching and background delivery.

## Backend

- NestJS/Express REST API with a backend-owned OpenAPI contract, request validation, JWT access tokens, rotating HttpOnly refresh cookies and role/ownership checks.
- PostgreSQL and Drizzle migrations, transactional inventory holds, price snapshots and idempotent booking/payment/refund operations.
- Durable inbox/outbox processing, RabbitMQ workers, bounded retries and recovery after cache/broker/container restarts.
- Redis public catalog caching with SQL fallback; separate booking, payment, refund, ticket and artifact states.
- Deterministic local payment simulator and a Stripe test provider. Real Stripe account smoke tests require your test credentials.

## Frontend

React, Vite, strict TypeScript, React Router and TanStack Query. Customer discovery, reservations, owned bookings/tickets, demo checkout and an organizer workspace use the real API through a same-origin proxy. A non-root Nginx container serves the muted editorial interface.

## Run locally

Requires Docker Desktop/Engine with Compose. Host Node.js is unnecessary. From the cloned repository in PowerShell:

```powershell
cd backend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build --wait -d
docker compose --profile tools run --rm seed

cd ../frontend
if (!(Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build --wait -d
```

- Browser: http://localhost:8080
- API: http://localhost:3000/api/v1
- API documentation: http://localhost:3000/docs
- Demo customer: `customer@ticketflow.local`; organizer: `organizer@ticketflow.local`. Password is the configured backend `SEED_PASSWORD`.

The backend starts first and creates the configurable `ticketflow-local` network. Each application builds independently. `.env.example` contains explicit local-only defaults; actual `.env` files and generated evidence are excluded from Git. Stop a stack with `docker compose stop` from its directory; development volumes remain intact.

## Verification

Observed local results on 14 October 2026:

- **35 backend tests** against actual PostgreSQL, Redis, RabbitMQ and worker/API instances, including 100 competing reservations for 10 tickets yielding exactly 10 successful bookings.
- A five-minute isolated **k6 test at 100 combined requests/s** handled 30,004 HTTP requests with zero HTTP failures. Catalog/reservation p95 were 3.53/9.70 ms on the documented developer machine; these are local measurements, not production capacity claims.
- **11 passing Chromium browser tests** using the actual backend, workers and simulator. Contract checks, lint, strict types, independent production builds, proxy/deep links and non-root runtimes were also verified.

```powershell
# From backend/
./scripts/test.ps1
./scripts/recovery.ps1
./scripts/load.ps1

# From frontend/
docker compose --profile tools run --build --rm check
./scripts/e2e.ps1
```

POSIX equivalents are documented in each application's README. Tests own isolated networks/data. GitHub Actions workflows run backend and frontend checks on pushes and pull requests.

Hosted verification also passed for code commit `8ee1079`: [backend checks/build/runtime](https://github.com/Meda-art312/ticket-flow/actions/runs/38618510419) and [frontend standalone/browser checks](https://github.com/Meda-art312/ticket-flow/actions/runs/38618510296). The initial Linux browser-job credential ownership failure is retained in the workflow history and documented with its correction.

## Documentation and scope

[Backend setup](backend/README.md) · [Architecture](backend/docs/architecture.md) · [API contract](backend/docs/openapi.json) · [Backend evidence](backend/docs/verification.md) · [Performance measurements](backend/docs/performance.md) · [Frontend setup](frontend/README.md) · [Browser walkthrough](frontend/docs/browser-walkthrough.md) · [Frontend evidence](frontend/docs/verification.md)

Real Stripe account flows and other browser engines are outside the recorded local verification. Organizer management currently loads up to 100 owned venues/events; a narrow compatibility adapter covers missing organizer pagination parameters in the OpenAPI artifact. See [integration notes](frontend/docs/backend-integration.md).
