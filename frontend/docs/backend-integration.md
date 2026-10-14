# Backend integration

Contract: ticketflow-api-v1, OpenAPI 3.1 snapshot docs/ticketflow-api-v1.openapi.json, copied from sibling backend/docs/openapi.json. Generated types: src/api/schema.d.ts. Runtime responses are validated against the same artifact. Record its SHA-256 in verification evidence. Backend source remains unchanged by this frontend task.

Browser uses /api/v1 through Nginx/Vite. Default public origin http://localhost:8080 must exactly match backend FRONTEND_ORIGIN. Server BACKEND_UPSTREAM defaults to http://api:3000. Refresh HttpOnly cookie Path=/api/v1/auth and SameSite=Lax are preserved; HTTPS requires backend COOKIE_SECURE=true. No secrets belong in Vite config or frontend assets.

Start and seed backend using its own README before local web Compose. Demo credentials come from backend SEED_PASSWORD configuration; only account emails are described in the UI. Distinct backend seed fixtures cover refund, check-in and contention. Seed windows age; isolated browser tests create fresh fixtures using real organizer APIs.

Assumptions: organizer management lists are bounded items collections, while public events/bookings use pagination. Contract exposes no event image field: artwork is decorative typography generated from real event titles, not invented event photography. Ticket snapshots reference bookings; event timezone is fetched from its public event when available. Cancelled/non-public event timezone may be unavailable, in which case UTC is explicitly labeled.

Observed contract omission: GET /organizer/venues and GET /organizer/events return pagination and accept page/page_size in the actual backend, but their OpenAPI parameter lists are empty. src/api/client.ts isolates a typed compatibility extension for only those two routes; response validation and the preserved OpenAPI snapshot remain unchanged. Actual backend Catalog.ownedList implements the parameters. Browser checks validate this behavior; the backend owner should add the missing parameter declarations in a future contract correction. Organizer workspace lists/selectors currently fetch up to 100 owned venues/events; larger workspaces need paginated management.

Real Stripe test-account redirects cannot be completed without credentials; simulator journeys require none.
