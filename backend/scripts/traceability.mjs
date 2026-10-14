import { readFileSync, writeFileSync } from "node:fs";
const ids = [
  ...new Set(
    readFileSync("docs/backend-srs.md", "utf8").match(
      /\b(?:AUTH|CAT|BOOK|PAY|TKT|DATA|ARCH|MSG|CACHE|API|DOCKER|NFR)-\d{2}(?=:)/g,
    ),
  ),
];
const groups = {
  AUTH: [
    "src/identity/service.ts; src/http.ts; src/infra/config.ts",
    "BE-AT-02, BE-AT-19; API role/ownership, cookie/Origin, concurrent refresh reuse, logout, production guards and limiter",
  ],
  CAT: [
    "src/catalog/service.ts",
    "BE-AT-03, BE-AT-17; draft CRUD, venue archive/reference restrictions, immutable publication, filtering and cancellation",
  ],
  BOOK: [
    "src/reservations/service.ts; src/reservations/policy.ts; drizzle/0000_initial.sql",
    "BE-AT-04–07, BE-AT-08, BE-AT-10, BE-AT-16; two API instances, true SQL competing connections, CHECK failures, durable command results and rollback",
  ],
  PAY: [
    "src/payments/service.ts; src/payments/provider.ts; drizzle/0002_confirmed_payment.sql",
    "BE-AT-07–12, BE-AT-17, BE-AT-22; verified inbox, late/extra compensation, winning capture, uncertainty/retention, refund failure and owned demo; Stripe SDK signatures in test/stripe.spec.ts",
  ],
  TKT: [
    "src/ticketing/service.ts; src/notifications/service.ts",
    "BE-AT-08/13/21; quantity uniqueness, concurrent admission, refund exclusion, encrypted credentials, actual rendering and SMTP failure/retry",
  ],
  DATA: [
    "drizzle/; src/reporting/service.ts; scripts/analyze.ts",
    "BE-AT-04/06/18; constraints, aggregate facts, drift; actual EXPLAIN plans on 10k-event fixture",
  ],
  ARCH: [
    "src/infra/services.ts; src/main.ts; src/worker.ts; docs/architecture.md; docs/adr/; docs/diagrams/",
    "API/worker separate entrypoints; service boundaries; ordered SQL locks; inbox/outbox/lease recovery; containerized acceptance",
  ],
  MSG: [
    "src/infra/messaging.ts; src/notifications/service.ts; src/worker.ts",
    "BE-AT-15/16/20/21; mandatory confirmed publication, actual RabbitMQ redelivery/DLQ, audited replay; scripts/recovery.ps1 real container outage/restart",
  ],
  CACHE: [
    "src/infra/cache.ts; src/catalog/service.ts; compose.yaml",
    "BE-AT-14; real Redis hit/miss, TTL, stale fill barrier, generation invalidation; recovery harness stops Redis and confirms fallback; memory bound 128MB",
  ],
  API: [
    "src/http.ts; src/main.ts; scripts/contract.mjs; docs/openapi.json; docs/frontend-integration.md",
    "BE-AT-01/02/19/22; Ajv schema validation of auth/events/bookings/checkout/tickets/reports/errors; API-only owned checkout, Origin/cookies and body limits",
  ],
  DOCKER: [
    "Dockerfile; compose.yaml; compose.test.yaml; compose.recovery.yaml; .github/workflows/backend.yml",
    "BE-AT-01/20/22; Docker lint/types/tests/build/start/demo/load; local/recovery isolated networks; hosted CI dispatch not run (no remote configured)",
  ],
  NFR: [
    "src/infra/metrics.ts; src/infra/readiness.ts; src/main.ts; src/worker.ts; docs/runbook.md; docs/performance.md",
    "BE-AT-04/06/14–22; real recovery, load/SQL evidence, compatible schema health, bounded waits/leases, JSON route logs and operational metrics; security/retention also reviewed in code",
  ],
};
let text =
  "# Backend requirements and test traceability\n\nBaseline: preserved SRS 2.0; contract ticketflow-api-v1. References identify implemented code and concrete exercised scenarios, not a claim that every possible input/failure permutation is exhaustively tested.\n\nEvidence: `artifacts/handoff-verification.log`, `artifacts/recovery-evidence.json`, `artifacts/isolated-load.log`, `artifacts/k6-summary.json`, `artifacts/query-plans.json`, `artifacts/npm-runtime-audit.json`. Artifacts are intentionally ignored (load.env contains a short-lived token); measured summaries are recorded in docs/performance.md and docs/verification.md.\n\n| Requirement | Implementation | Test/evidence |\n|---|---|---|\n";
for (const id of ids) {
  const [implementation, evidence] = groups[id.split("-")[0]];
  text += `| ${id} | ${implementation} | ${evidence} |\n`;
}
text +=
  "\n## Acceptance matrix\n\nAll BE-AT scenarios below have executable coverage in test/acceptance.spec.ts, supplemented by the real container recovery harness and k6/SQL analysis. Credentials-dependent Stripe remote checkout/refund smoke is explicitly unrun.\n\n| Scenario | Specific evidence |\n|---|---|\n";
const cases = [
  "Fresh Docker API/worker/infrastructure, successful migrations, independent contract and local seed/demo",
  "Customer-only registration, query ownership and current-role checks",
  "Venue/event/category CRUD, archive/reference restrictions, date constraints, publication freeze and public filters",
  "100 concurrent distinct-key HTTP requests through api/api2; exactly 10 successes and 90 inventory conflicts; SQL bounds",
  "Concurrent same-key booking result; changed-payload conflict; persisted rejection remains rejected after stock changes",
  "Injected reservation/confirmation rollback checks bookings, counters, command result, tickets, payment and outbox",
  "Event lock held across deadline boundary; confirmation/expiry/cancel race; FixedClock equality policy test",
  "Verified eligible capture produces exactly quantity tickets; demo action is asynchronous",
  "Duplicate/out-of-order signed events; invalid signature, mismatch and additional capture handling; SDK raw-byte test",
  "Expired/canceled holds never revive; one compensation; no second reserved/sold release",
  "Provider-success/local-crash simulation, stored identities, one remote operation, >23h manual resolution",
  "Pending suspension, verified release only, terminal failure retaining sold stock; canceled event blocks admission",
  "Twelve competing scans admit once; owner/token/window rejection; real refund/check-in competition",
  "Real Redis hit/miss/TTL, generation invalidation and deterministic stale-fill barrier; actual Redis-stop fallback",
  "Real broker confirms; crash after consumer commit and redelivery; actual broker stop/purchase/catch-up",
  "Expired hold processed by two pools once; exhausted message in actual DLQ; admin-only audited replay",
  "Cancellation versus capture race; bounded release/refund sweep; old failed refund evidence cannot revert new recovery",
  "Preaggregated money and ticket quantities, no multiplied totals, zero drift, actual report query plans",
  "Refresh family reuse/rotation, logout/cookie clearing, exact/missing/null Origin, cross-site metadata, limiter and production guards",
  "Restart API/worker/PostgreSQL without deleting data; stable payment identity/tickets and recovered unfinished notification",
  "Real QR rendering and deliberately corrupted artifact retry; real failed SMTP connection then Mailpit retry; purchase remains retrievable",
  "Container lint/types/35 tests/build, owned API-only simulator checkout, production image/local runtime/demo, k6 and measured SQL",
];
cases.forEach((e, i) => {
  text += `| BE-AT-${String(i + 1).padStart(2, "0")} | ${e} |\n`;
});
text +=
  "\n## Explicit limits\n\nStripe remote API operations need an actual test account and were not run. Local SDK signature verification uses generated test evidence and no remote credentials. Hosted GitHub Actions cannot be dispatched from this non-Git workspace; equivalent container checks run locally. SMTP has a documented send-before-record duplicate window. Single-node Docker recovery is demonstrated, not high availability. Terminal provider refund failures remain visible for operator review; automatic new financial identities are deliberately not created.\n";
writeFileSync("docs/backend-requirements-traceability.md", text);
