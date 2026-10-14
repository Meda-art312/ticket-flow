# Frontend Software Requirements Specification: TicketFlow

Version: 2.0  
Date: 13 October 2026  
Status: Small, separately buildable browser application  
Build prompt: `frontend-codex-prompt.md`  
Backend counterpart: `backend-srs.md`  
Integration contract: `ticketflow-api-v1`

## 1. Purpose, scope, and ownership

Build a compact frontend that lets someone test TicketFlow live through a browser: discover events, reserve tickets, complete local demo checkout or Stripe test checkout, view tickets, request refunds, and use organizer forms/reports/check-in. Core journeys must not require Swagger or manually constructed API requests.

This SRS covers frontend code, browser API integration, authentication UX, responsive/accessibility behavior, frontend Docker build/runtime, and browser end-to-end verification. Backend business logic, SQL/migrations, inventory locking, Stripe secret calls, RabbitMQ, Redis, refund execution, and email generation are owned by `backend-srs.md`. Do not implement a second backend or duplicate those responsibilities in the browser.

The frontend is deliberately modest: a few shared forms, event cards, status badges, and tables. Marketing pages, visual seating, camera scanning, charts, a full admin console, complex animation, theme switching, and SSR are optional/outside the required scope. Swagger remains an independent developer tool.

MUST/SHALL requirements are mandatory. SHOULD permits a documented alternative; MAY is optional. Backend-returned state and eligibility always override the frontend's estimates. Component previews/fixtures may help development, but cannot satisfy live integration acceptance.

## 2. Technology and independent project boundaries

FE-ARCH-01: Use React, Vite, TypeScript strict mode, React Router, TanStack Query, and simple CSS/CSS modules. Use Playwright for browser tests; use focused component tests only where they prove useful behavior. Pin compatible versions and commit an npm lockfile. No large design system is required.

FE-ARCH-02: For a new project, use a self-contained `frontend/` directory with its own package manifest, lockfile, Dockerfile, Compose files, environment example, and docs. The backend lives in sibling `backend/` or a separately checked-out repository. Adapt to compatible existing layouts without moving/deleting existing work. The frontend build must not compile backend source or require database/broker credentials.

FE-ARCH-03: Keep route components, shared controls/layout, typed API client, authentication/session handling, and server-query hooks distinct. Use the backend-owned OpenAPI artifact to generate types or verify a maintained typed client. Do not expose internal backend models or share database entities with the web bundle.

FE-ARCH-04: Backend source of truth is its `docs/openapi.json` or local `/api/v1/openapi.json`, contract identifier ticketflow-api-v1. Keep a versioned snapshot and record the source/version in frontend integration docs. Exact DTOs come from the validated artifact; required semantics are summarized in section 4. If the artifact is missing, establish a documented candidate contract from the two SRS files, keep assumptions visible, and mark live integration unverified until the actual API agrees. Do not silently change backend code to fit UI assumptions.

## 3. Actors and minimum screen map

| Actor | Browser access |
|---|---|
| Visitor | Browse/search events, event details, register/login |
| Customer | Visitor capabilities plus own bookings, checkout/refunds, own tickets |
| Organizer | Customer capabilities plus own venues/events/categories, sales reports, check-in |
| Administrator | No dedicated admin console required; may use backend tooling for recovery/role grants |

| Screen/route | Minimum capability |
|---|---|
| `/events` | Browse published events, search/filter, pagination |
| `/events/:id` | Event/venue/time information, category prices, quantity picker, reserve action |
| `/login`, `/register` | Sign in/register with ordinary forms; local demo account guidance without embedded passwords |
| `/bookings`, `/bookings/:id` | Own booking list/detail, hold countdown, payment/refund progress, checkout/cancel/refund |
| `/tickets/:id` | Own QR ticket, usability state, copyable check-in credential |
| `/checkout/return` | Backend refetch after provider return; confirmed/declined/expired/processing feedback |
| `/demo/checkout/:sessionId` | Clearly labeled local payment simulation, succeed/decline controls |
| `/organizer` | Owned venue/event lists, draft forms/category editor, publish/cancel actions |
| `/organizer/events/:id` | Sales totals/category table and manual credential check-in |

Shared pages/dialogs may combine these capabilities if navigation and deep links stay clear. A logged-in organizer can still buy tickets. Role-based navigation is convenience; the backend enforces access.

## 4. Backend integration contract

Browser requests use relative `/api/v1` URLs through a same-origin proxy. All listed HTTP routes below are relative to that prefix. Resource IDs are UUID strings except opaque demo-session IDs/ticket credentials as documented. JSON uses snake_case; timestamps are UTC ISO-8601 strings; money is integer minor units with currency. Render display dates using the event's IANA timezone and label it clearly. Render money with currency-aware formatting and correct minor-unit conversion; never recompute authoritative totals from rounded display strings.

### 4.1 Required API surface

| API | Frontend use |
|---|---|
| POST /auth/register, /login, /refresh, /logout; GET /me | Auth lifecycle/current roles |
| GET /events, /events/:id | Discovery and category selection |
| POST /bookings; GET /bookings, /bookings/:id | Reserve/read authoritative state |
| POST /bookings/:id/cancel, /checkout, /refund | Idempotent booking commands |
| GET /bookings/:id/tickets, /tickets/:id | Issued tickets/QR readiness |
| GET /demo/checkout/:sessionId; POST /demo/checkout/:sessionId/complete | Owned, local-only demo payment session |
| Organizer venue/event/category CRUD under /organizer | Draft management; exact routes from OpenAPI |
| POST /organizer/events/:id/publish, /cancel | Event lifecycle commands |
| GET /organizer/events/:id/reports/sales | Sales summary/category table |
| POST /organizer/events/:id/check-ins | Token in request body; never query string |

### 4.2 Response and state expectations

- Auth login/refresh returns access_token and expires_in, with a separate opaque HttpOnly refresh cookie. `/me` provides id, display_name, and current roles.
- Paginated lists use items and pagination {page, page_size, total}; default page=1/page_size=20 and maximum page_size=100.
- Booking data includes id, state, quantity, unit_price_minor, total_minor, currency, expires_at, server_time, event/category snapshots, payment status/reconciliation_required, refund status/reason or null, ticket/artifact status, and allowed_actions. Each action has {allowed, reason}.
- Checkout returns attempt_id, status=ready|pending, checkout_url or null, and mode=simulator|stripe_test. Do not treat pending as permission to create another payment attempt.
- Demo session returns id, booking_id, amount_minor, currency, status, and allowed_outcomes. Completion body uses outcome=success|decline and an Idempotency-Key.
- Ticket detail exposes state, artifact_status, QR representation, and the opaque check-in credential to its owner. Use protected artifact fetching or documented SVG rendering; do not inject arbitrary raw SVG into the DOM. QR data contains no PII.
- Check-in returns status=admitted|already_checked_in, or structured wrong-event/unusable errors.
- Reports expose captured_minor, refunded_minor, net_collected_minor, currency, ticket/inventory counts, and category rows.
- Errors use code, message, request_id, and optional field_errors. Handle validation (400), authentication (401), authorization (403/404), conflicts (409), throttling (429), and dependency failures (503) explicitly.

| Domain | States to represent |
|---|---|
| Event | DRAFT, PUBLISHED, CANCELED, COMPLETED |
| Booking | RESERVED, CONFIRMED, EXPIRED, CANCELED, REFUND_PENDING, REFUNDED |
| Payment | CREATED, PENDING, SUCCEEDED, FAILED, CANCELED; reconciliation marker is separate |
| Refund | REQUESTED, PROCESSING, SUCCEEDED, FAILED, or absent |
| Ticket | VALID, CHECKED_IN, SUSPENDED, VOID |
| Artifact | PENDING, READY, FAILED |

Do not collapse these into one boolean such as is_paid. EXPIRED/CANCELED bookings can still have successful payments and pending/successful compensating refunds. A refunded payment remains SUCCEEDED in its payment record while the refund is tracked separately. Show safe fallback text for unknown enum values and record a contract mismatch instead of presenting success.

## 5. Functional browser requirements

UI-01: Implement the screen map using the real backend APIs. No fake confirmation, local-only booking mutation, or seeded browser array may replace live backend data. Administrator recovery can remain API-only.

UI-02: Use a readable responsive layout at approximately 375 px mobile width and desktop width. Supply labeled inputs, semantic buttons/links, visible keyboard focus, accessible error/status announcements, and loading/empty/error states. Keep content hierarchy simple and use shared controls instead of an elaborate design system.

UI-03: Permit browsing without login. An attempted reservation prompts login and returns to the selected event/quantity, but does not automatically create a booking. Show server prices, currency, event timezone, quantities 1-6 for one category, and sold-out/conflict feedback. Public availability is indicative; backend acceptance determines the outcome.

UI-04: Booking detail shows a hold countdown adjusted using server_time. PostgreSQL remains authoritative. On displayed expiry, disable pay and refetch; the countdown must not invent final booking/payment state. On checkout return, poll at a bounded interval, default 2 seconds for up to 60 seconds, stop on a settled outcome/unmount, and show processing plus manual refresh if unresolved. Permit focus/user-triggered refresh. A return parameter never confirms payment. Display refund progress separately, including on EXPIRED/CANCELED bookings.

UI-05: Local demo checkout must work without Stripe keys or API tools. Read the authenticated customer's owned demo session and POST an allowed success/decline outcome with a stable idempotency key. The backend creates signed simulator evidence and processes it; the UI only observes state. Never possess the signing/control secret or call internal fault-injection endpoints. In Stripe test mode redirect to the backend-provided hosted URL and return to /checkout/return?booking_id=:id. Validate checkout URLs against documented allowed simulator/provider origins/protocols; never navigate arbitrary schemes or accept client-invented return destinations.

UI-06: Show QR artifacts when ready; show artifact pending/failed with retry/refetch guidance otherwise. Mark VALID/CHECKED_IN/SUSPENDED/VOID clearly and make the credential copyable for its owner. The organizer's manual check-in form submits that credential in a JSON body and reports admission, repeat use, wrong event, or unusable ticket. Camera scanning is optional. Do not log tokens, put them in URLs, or expose them on public event pages.

UI-07: Organizer workspace supports venue/event/category draft CRUD, publication, cancellation, sales summary, and manual check-in. Freeze published commercial fields according to the backend (venue, times, capacity, currency, price); keep title/description editable. Explain read-only fields. Confirm event cancellation and customer refunds with dialogs describing the action and pending outcome. Use backend allowed_actions/errors as authoritative. Do not implement a general admin console.

UI-08: Prevent double submission. Generate a fresh Idempotency-Key per deliberate reserve/checkout/cancel/refund/demo-completion command and retain it with the unchanged payload for retries after ambiguous network outcomes. Do not retry a financial command automatically with a new key. Invalidate affected TanStack Query entries after mutations. Clear user-specific caches and any pending-command state on logout/account change. Avoid caching credentials or sensitive responses in persistent browser storage. A page reload during an uncertain command should fetch authoritative state and show recovery guidance rather than blindly resubmit.

UI-09: Keep access tokens only in memory; refresh tokens are backend-set HttpOnly cookies with Path=/api/v1/auth, SameSite=Lax, Secure under HTTPS and local HTTP exceptions only in explicit local mode. Use credentialed auth fetches, restore session via refresh on reload, and deduplicate concurrent refresh calls within the client. Coordinate refresh across tabs if supported, or document/test the supported session behavior so rotation races do not silently log users out. Auth POSTs must satisfy the backend's exact Origin/CSRF checks through the same-origin proxy. Clear state on refresh rejection and redirect safely. Wait for restoration before displaying protected cached data. Never put tokens in localStorage, sessionStorage, query strings, or Vite variables.

UI-10: Use Vite API proxying in development and a static server/reverse proxy for built assets. Internal upstream http://api:3000 is server-only; browser fetches remain /api/v1. Proxy Set-Cookie/Origin and allowed headers correctly; keep deployment HTTPS/forwarded-header trust explicit. Supply SPA fallback for frontend routes without converting API failures into HTML. Only public config enters the web bundle. Render sanitized/plain event text; avoid unsafe HTML injection. Static runtime container must work under a non-root user.

UI-11: Document local account setup and the browser walkthrough. Get credentials from the backend's local setup documentation or user configuration; do not embed demo passwords into production assets or add an unauthenticated role-switch endpoint. Use backend fixtures for refund-eligible events (>24 hours away), currently check-in-eligible events, and separate contention events. A local shorter-hold backend configuration may be documented for observing expiry but the frontend must never override server time/eligibility to make demos pass.

UI-12: Implement Dockerized Playwright coverage against real frontend/API/worker/PostgreSQL/Redis/RabbitMQ plus the simulator. Cover the acceptance scenarios below, including pending outcomes and deep links. Fixture setup may use protected test tooling, but tested user actions must use the browser and real API. No interception replacing required business responses. Capture traces/screenshots on failure. Browser tests supplement backend SQL concurrency tests; this frontend task does not implement those database tests.

## 6. Docker, networking, and independent delivery

FE-DOCKER-01: Build/lint/type-check/test through Docker; host Node.js is not required. Provide dependency/development/build/test/production stages, lockfile-based install, .dockerignore, and a lean non-root static runtime image. Vite development server is not the production server. Supply a hot-reload development override.

FE-DOCKER-02: Frontend Compose owns web and frontend tooling/e2e profiles only; do not copy the backend's migrations, database, queues, or workers into its application. For default local integration, start backend Compose first. Backend creates ticketflow-local (configurable via TICKETFLOW_NETWORK); frontend joins that external network and uses server-side BACKEND_UPSTREAM=http://api:3000. Publish web on loopback port 8080 by default. Do not declare Compose depends_on for a service outside the frontend project. Report unavailable upstream clearly and document startup order/retry behavior.

FE-DOCKER-03: The web image is independently buildable even if the backend is offline. Functional browsing/purchase requires the real backend. Provide a server health route for static-service liveness and an integration check for API reachability. Keep API configuration public URL versus internal upstream distinct; BACKEND_UPSTREAM is runtime server config, never a browser API URL. Document an alternate upstream when hosting separately.

FE-DOCKER-04: Provide a frontend-owned isolated e2e orchestration file/harness that starts the backend test services plus web and Playwright, using configurable backend source/image location. It must be self-contained or explicitly document file combinations, fixtures, migrations, and lifecycle. Use a unique project-scoped network/database/volumes, never the shared development network/database. Do not remove development data during teardown. Pin Playwright image/browser dependencies to the installed package version. The harness may reference/build the backend but must not silently modify its source.

FE-DOCKER-05: Implement equivalent commands from frontend/ (adjust names only with matching documentation):

```sh
# First start and seed the backend per its own README.
# Then copy frontend .env.example to .env for your shell:
docker compose up --build -d
# Open http://localhost:8080
docker compose logs -f web

# Build frontend alone, no running backend required:
docker build --target production -t ticketflow-frontend:local .

# Dedicated real integration stack; BACKEND_SOURCE_DIR points to its checkout:
docker compose -p ticketflow-frontend-e2e -f compose.e2e.yaml up --build --abort-on-container-exit --exit-code-from e2e

# Stop web; do not stop/delete backend data:
docker compose down
```

These are required implementation workflows, not commands already tested in this documentation package. Backend-specific commands belong to backend documentation. With separate checkouts, set BACKEND_SOURCE_DIR appropriately; no fixed user machine paths.

FE-DOCKER-06: Frontend CI runs containerized lint, type-check, build, any meaningful component tests, and real Playwright integration through the supplied harness. Keep standalone web build checks separate from backend-dependent browser checks. Missing Docker/backend/credentials must be reported as explicit unrun checks, never replaced with a fabricated pass.

## 7. Acceptance criteria

| ID | Required result |
|---|---|
| FE-AT-01 | Frontend production image builds without host Node.js or backend source; with documented backend/network setup, Compose serves the browser URL and real API |
| FE-AT-02 | Visitor filters/paginates real events; login/register and protected-route restoration work without granting privileged roles |
| FE-AT-03 | Customer reserves, completes owned demo checkout, observes backend confirmation, and opens issued QR tickets without Swagger/Stripe credentials |
| FE-AT-04 | Declined checkout, sold-out conflicts, expired holds, unresolved/reconciling payments, and late-payment refunds show accurate separate states |
| FE-AT-05 | Eligible customer refund shows pending/final status and corresponding ticket usability; unavailable refund explains why |
| FE-AT-06 | Organizer creates venue/event/categories, publishes, edits permitted fields, reads sales, and cancels with explicit confirmation |
| FE-AT-07 | Organizer manual check-in admits once; repeated/wrong-event/unusable token responses are clear; other organizers/customers cannot access private resources |
| FE-AT-08 | Ambiguous retries reuse command identities; mutation/cache refresh, logout/account-change clearing, session expiry, and refresh restoration work |
| FE-AT-09 | No secrets/tokens in web assets or persistent browser storage; auth/proxy/cookie/Origin handling matches actual backend contract |
| FE-AT-10 | Deep links/reload work in built web container; API errors remain JSON errors, not SPA HTML; static upstream failure is visible |
| FE-AT-11 | Loading/empty/error/validation states, keyboard focus/forms, and mobile/desktop layouts are verified |
| FE-AT-12 | Dockerized Playwright uses real infrastructure; delayed webhook work remains pending and return URL alone cannot show successful purchase; failed tests retain artifacts |

Verification should include two independent browser contexts for customer/organizer and unauthorized-access checks, not a privileged shortcut account switch. Use separate events/bookings for refundable versus checked-in cases. Do not claim production performance or completed integration from component previews.

## 8. Implementation phases

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0. Contract/plan | Inspect actual OpenAPI, screen map, API/auth/proxy assumptions, task plan | v1 client contract and dependencies documented |
| 1. Foundation | Standalone Docker web build/runtime, proxy, layout, typed client, auth/session routing | FE-AT-01/02 foundations; browser reaches real backend |
| 2. Customer journey | Events, reservation, booking countdown/status, checkout modes, tickets | FE-AT-03/04; real Playwright purchase journey |
| 3. Organizer/refunds | Draft forms, publish/cancel, reports, check-in, customer refunds | FE-AT-05/06/07 |
| 4. Hardening/handoff | Retry/idempotency, refresh/cache isolation, responsive/accessibility, isolated browser harness, docs | FE-AT-08 through FE-AT-12 and remaining cases pass or exact blockers recorded |

Keep completed slices runnable. If a backend endpoint is missing or contradicts its contract, record a precise integration issue and continue unaffected frontend work. Do not implement payments or inventory in React to work around it.

## 9. Required frontend deliverables

- README with standalone build, backend startup dependency/network setup, browser URL, local account setup, and customer/organizer walkthrough.
- `docs/frontend-srs.md`, `docs/frontend-implementation-plan.md`, `docs/frontend-requirements-traceability.md`.
- `docs/frontend-architecture.md`: screen map, component/client boundaries, session/polling/retry handling, proxy/deployment diagram.
- Backend OpenAPI snapshot/generated types with source/version and `docs/backend-integration.md` listing exact dependencies and mismatches.
- Web source, Dockerfile, Compose/dev/e2e configuration, environment examples, CI, tests and failed-test artifact instructions.
- No required backend implementation, SQL migrations, broker consumers, or provider-secret code.

## 10. References and revision history

- [React SPA tooling/routing/data fetching](https://react.dev/learn/build-a-react-app-from-scratch).
- [Vite server/proxy options](https://vite.dev/config/server-options.html).
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/).
- [Playwright Docker setup](https://playwright.dev/docs/docker).

Version 2.0 extracts the required browser functionality from the combined v1.1 specification and establishes separate frontend ownership, Docker delivery, and FE-AT acceptance IDs. UI-01 through UI-12 preserve the original requirement identities, with independent integration details added.
