# Frontend requirement traceability

Baseline: SRS 2.0; backend-owned ticketflow-api-v1 snapshot and generated types. This table maps code and implemented scenarios; the verification record separately states what actually ran.

| Requirements | Implementation | Browser/check evidence |
|---|---|---|
| FE-ARCH-01…04 | package/lock, src/api/schema.d.ts, precompiled validators, src/pages, components and session | contract:check, lint, typecheck/build; independent image |
| UI-01…03, FE-AT-02 | Events, Auth, protected routes, real typed client | discovery/filter/pagination, registration, selection restoration |
| UI-04…05, FE-AT-03/04/12 | Bookings countdown/bounded polling, DemoCheckout, checkout URL allowlist | actual simulator confirmation, decline, expiry/late compensation, delayed signed evidence |
| UI-06, FE-AT-07 | Tickets image rendering/copy, organizer JSON check-in | QR readiness, admission/repeat/wrong-event/ownership |
| UI-07, FE-AT-05/06 | Organizer draft editors/publication freeze, sales, confirmation dialogs, booking refunds | browser draft/publication/update/cancel and customer refund |
| UI-08…09, FE-AT-08/09 | memory session, Web Locks, session broadcast, query cancellation/cache clear, command registry | same-key offline transport retry, reload restoration, multi-tab logout, no token storage/secret assets |
| UI-10…11, FE-AT-01/10 | Nginx/Vite proxy, non-root image, setup/walkthrough | independent image, health/API JSON/deep-link checks |
| UI-12, FE-DOCKER-01…06, FE-AT-12 | isolated Compose/harness, matching Playwright package/image, CI | real API/worker/PostgreSQL/Redis/RabbitMQ/Mailpit; no business-response replacement |
| UI-02, FE-AT-11 | responsive CSS, semantic controls/focus, dialogs/status/errors, reduced motion | desktop/mobile screenshots, widths 1440/390/375, keyboard and form assertions |

Test files: e2e/journeys.spec.ts and e2e/runtime.spec.ts. Logs, HTML/JSON reports and failure traces/screenshots/video live in ignored artifacts/. Design review images live in .impeccable/review/. Never publish those artifacts without inspecting their private ticket content. Hosted CI and remote Stripe flows require external configuration and are not implied by local tests.
