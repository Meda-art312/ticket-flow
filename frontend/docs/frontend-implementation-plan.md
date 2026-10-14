# Frontend implementation plan

Baseline: frontend SRS 2.0, preserved verbatim; backend contract ticketflow-api-v1 copied from ../backend/docs/openapi.json. Existing backend source and development data are preserved. No applicable AGENTS.md was found in project ancestry or workspace.

## Slices

1. [x] Contract and foundation: generated types, runtime response validation, Docker static proxy, session restoration, navigation.
2. [x] Customer journey: discovery/filters, details/reservation, bookings, countdown, owned demo checkout, bounded return polling and QR tickets.
3. [x] Organizer/refunds: venue/event/category draft CRUD, publication freezes, reports, cancellation, manual check-in and customer refund.
4. [x] Verification: container lint/types/build, independent image/proxy checks, isolated real Playwright backend stack, mobile/desktop accessibility checks and scoped design review.
5. [x] Handoff: README, walkthrough, integration gaps, requirement traceability and measured results.

## Decisions before implementation

- Use a muted editorial world chosen by the user: bone ground, dark ink, controlled cobalt and authored typographic event posters derived from actual event content. No invented events, prices, availability or promotional claims.
- App screens are built code-first; no standing workflow preference is saved.
- Relative /api/v1 only; runtime upstream is server-only. Proxy preserves browser Origin and backend refresh cookie attributes. API errors never fall through to SPA HTML.
- Access token is in memory. Single-flight refresh plus Web Locks where supported coordinates cookie rotation across tabs. Logout/account changes cancel queries and clear private caches and pending command identities.
- Generate TypeScript from the contract snapshot and validate API responses against its schemas, including enums. Unknown values produce a visible contract error.
- Commands retain one key and exact body for ambiguous manual retry; no automatic financial mutation retry. Reload fetches state without resubmitting a command.
- Countdown estimates use server_time. Return polling is two seconds for at most 60 seconds. URL parameters are never confirmation evidence.
- E2E owns isolated services/networks/data and references configurable backend source. Test tooling alone may access protected fault controls; browser source never does.

## Continuation checkpoint

Completed 14 October 2026. Final independent container contract/client-boundary/lint/strict-type/build checks pass (artifacts/delivery-check.log). The full final browser run passes all eleven real-infrastructure tests in 113.5 seconds, with zero skipped/unexpected/flaky (artifacts/final-browser-results.json). This includes an actual unavailable upstream and the sixty-second polling limit. Failed first-run traces are retained in artifacts/first-run and artifacts/runtime-first-run. Docker Desktop required one restart; local backend dependencies were started again and API/worker readiness recovered without deleting development data.

The independent finish review resolved its four material fixes and records ship at that fix-list scope in docs/design-review.md. Final tokens are documented in DESIGN.md and .impeccable/design.json. The final local image is rebuilt and healthy at http://localhost:8080; production proxy, real events, JSON 404, deep links, CSP, preserved SRS/contract hashes and non-root UID 101 are recorded in artifacts/delivery-parity.json. The isolated e2e project is stopped; development services/data remain intact. Backend OpenAPI omits organizer pagination parameters; compatibility typing and the 100-item workspace limit are explicit in docs/backend-integration.md. Real Stripe test-account flow and hosted CI remain unrun for lack of credentials/remote. No additional implementation work is pending within the verified local scope.
