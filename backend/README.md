# TicketFlow backend

NestJS/Express modular monolith with separate API/worker entrypoints, PostgreSQL transactional inventory, Drizzle SQL migrations, Redis public caching, RabbitMQ outbox delivery, Stripe test and deterministic simulator providers. No frontend dependency.

Prerequisites: Docker Desktop/Engine with Compose. No host Node or database installation. From `D:\Projects\ticket-flow\backend`:

```sh
# PowerShell: Copy-Item .env.example .env
cp .env.example .env
docker compose up --build --wait -d
docker compose --profile tools run --rm seed
docker compose --profile tools run --rm demo
# Optional live logs:
docker compose logs -f api worker
```

API http://localhost:3000/api/v1, docs http://localhost:3000/docs, contract http://localhost:3000/api/v1/openapi.json, readiness http://localhost:3000/health/ready, metrics http://localhost:3000/metrics, Mailpit http://localhost:8025. RabbitMQ management http://localhost:15672 uses the explicit local-only Compose account. API port is 3000 on network alias `api`; independent frontend can join configurable `ticketflow-local` without being required for startup/tests.

```sh
sh scripts/test.sh
# PowerShell equivalents and isolated operational checks:
./scripts/test.ps1
./scripts/recovery.ps1
./scripts/load.ps1
docker build --target production -t ticketflow-backend:local .
# Development container commands (tooling lives in image):
docker build --target development -t ticketflow-backend-dev .
docker run --rm ticketflow-backend-dev npm run typecheck
docker run --rm ticketflow-backend-dev npm run lint
docker run --rm ticketflow-backend-dev node scripts/contract.mjs
# Alternative load against the local stack; creates a fresh load fixture/token:
docker compose --profile load run --build --rm prepare-load
docker compose --env-file .env --env-file artifacts/load.env --profile load run --rm load
docker compose down
```

Tests use their own project-scoped network and database; never the fixed development network. `down` preserves named development volumes. Do not use `down -v` on development data. Test stack cleanup is explicitly opt-in and scoped to its project. See runbook for backup/restore.

Local account emails/password setup, cookie jars/Origin and API flows: [frontend integration](docs/frontend-integration.md). [SRS](docs/backend-srs.md), [plan/checkpoint](docs/backend-implementation-plan.md), [traceability](docs/backend-requirements-traceability.md), [architecture](docs/architecture.md), [runbook](docs/runbook.md), [demo](docs/demo.md), [performance](docs/performance.md).

Observed verification: 35 passing tests, including 100 competing requests through two API instances yielding exactly 10 reservations for 10 tickets. Real dependency restart recovery passed. The isolated five-minute load completed 30,004 HTTP requests with zero failures and no dropped iterations reported; catalog/reservation p95 were 3.53/9.70ms, with zero pending/dead outbox rows in the final snapshot. Hosted CI also passed the real-infrastructure checks, production build and optimized runtime demo. See [verification](docs/verification.md) and [performance](docs/performance.md) for fixtures, evidence and limits. Remote Stripe test-account flows remain unrun pending credentials.

Build optimization (`NODE_ENV=production`) is distinct from `APP_MODE`. Default optimized local image supports simulator demos. APP_MODE=production rejects simulator, local credentials and insecure cookies; production requires explicit test-provider secrets and secure deployment configuration. Only `sk_test_` Stripe keys are accepted. Stripe smoke verification requires your test account credentials and is opt-in. Access JWTs may remain valid 15 minutes after logout. Rate limiting is per API process. SMTP may duplicate after send-before-record crashes; there is no exactly-once email guarantee.
