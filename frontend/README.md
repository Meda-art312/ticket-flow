# TicketFlow frontend

An independent React browser app for the backend-owned **ticketflow-api-v1** contract. Discovery, reservations, local demo/Stripe test checkout, bookings, refunds, tickets and an organizer workspace. Muted editorial design; no backend implementation is included.

Requires Docker Desktop/Engine with Compose; no host Node.js. Start and seed the separate backend using its own README first. It creates the default `ticketflow-local` network and expects frontend origin `http://localhost:8080`.

From the project root, with the backend `.env` configured as described in [backend setup](../backend/README.md):

```powershell
cd backend
docker compose up --build --wait -d
docker compose --profile tools run --rm seed
cd ../frontend
```

From `frontend/`:

```powershell
Copy-Item .env.example .env
docker compose up --build --wait -d
# Browser: http://localhost:8080
docker compose logs -f web

# Independent checks and image build; API need not be running:
docker build --target test -t ticketflow-frontend-check .
docker run --rm ticketflow-frontend-check
docker build --target production -t ticketflow-frontend:local .

# Real, isolated browser integration (builds configurable ../backend):
./scripts/e2e.ps1
# POSIX: sh scripts/e2e.sh

# Hot reload:
docker compose -f compose.yaml -f compose.dev.yaml up --build -d

# Stop only this frontend; backend data remains intact:
docker compose down
```

Only public/runtime proxy settings belong in `.env`: WEB_PORT, TICKETFLOW_NETWORK, BACKEND_UPSTREAM. A separately hosted backend can be selected with an HTTP(S) upstream origin. Browser requests always use `/api/v1`; do not put Docker DNS URLs in the bundle. Match backend FRONTEND_ORIGIN to the actual browser origin. Backend owns secure cookie configuration for HTTPS. The static container runs as non-root Nginx, with SPA deep links and JSON API failure responses.

Local demo accounts are described in the backend setup: customer@ticketflow.local and organizer@ticketflow.local. Enter the configured SEED_PASSWORD yourself; the frontend does not contain it. Registration creates an ordinary customer and then signs in through the actual login endpoint. The simulator uses no Stripe credentials or card details.

The e2e script creates ignored `.env.e2e` credentials, resets only the disposable `ticketflow-frontend-e2e` volumes, then starts that project with its own PostgreSQL/RabbitMQ volumes and network. It builds the actual backend via BACKEND_SOURCE_DIR (default `../backend`), migrates/seeds it and runs matching Playwright 1.64.0 package/image. Browser user actions call real APIs. Delayed signed events use backend-owned protected tooling from tests only. Offline transport testing does not replace business responses. Tests retain traces/screenshots/video on failure in artifacts/; inspect the HTML report there. This harness deliberately starts services before running tests so successful one-shot migrations cannot trigger premature abort-on-exit teardown.

Manual harness commands:

```sh
docker run --rm --mount "type=bind,source=$PWD,target=/work" -w /work node:24.21.0-bookworm-slim node scripts/e2e-env.mjs
# Reset only disposable test fixtures before a fresh run:
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml down --volumes --remove-orphans
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml up --build --wait -d web unavailable worker rabbitmq redis mailpit
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml run --build --rm --no-deps seed
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml run --build --rm --no-deps e2e
docker compose --env-file .env.e2e -p ticketflow-frontend-e2e -f compose.e2e.yaml stop
```

Web liveness: `/health/live`; actual upstream reachability: `/health/integration`. The app visibly reports unavailable APIs. Access tokens stay in memory; cookies are HttpOnly. Web Locks serialize refresh on supporting browsers, and logout/account changes broadcast cache clearing. Browsers without Web Locks support one active tab per session; concurrent refresh there can revoke a family, requiring sign-in again. No token persistence or automatic financial command retries.

[Walkthrough](docs/browser-walkthrough.md) · [Architecture](docs/frontend-architecture.md) · [Backend integration](docs/backend-integration.md) · [OpenAPI snapshot](docs/ticketflow-api-v1.openapi.json) · [Plan/checkpoint](docs/frontend-implementation-plan.md) · [SRS](docs/frontend-srs.md) · [Design system](DESIGN.md) · [Verification](docs/verification.md)

Observed verification on 14 October 2026: independent Docker contract/client checks, lint, strict types and production build pass; all 11 real-backend Chromium tests pass with zero skipped/flaky tests. The final local production container serves healthy static/API routes and SPA deep links, preserves JSON API errors, and runs as UID 101. Responsive checks cover 1440/390/375px; the four recorded design fixes are resolved. See the verification record for evidence and review scope. Hosted CI and a real Stripe test-account journey remain unrun pending remote/credential configuration. The organizer pagination contract omission and 100-item workspace limit are documented integration limits.
