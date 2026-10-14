import { writeFileSync } from "node:fs";
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const str = { type: "string" },
  int = { type: "integer", minimum: 0 },
  uuid = { type: "string", format: "uuid" },
  date = { type: "string", format: "date-time" },
  bool = { type: "boolean" };
const nullable = (s) => ({ anyOf: [s, { type: "null" }] });
const obj = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const arr = (s) => ({ type: "array", items: s });
const en = (...values) => ({ type: "string", enum: values });
const schemas = {
  Error: obj(
    {
      code: str,
      message: str,
      request_id: uuid,
      field_errors: arr(obj({ field: str, message: str })),
    },
    ["code", "message", "request_id"],
  ),
  Auth: obj({ access_token: str, expires_in: { type: "integer", const: 900 } }),
  User: obj({
    id: uuid,
    email: { type: "string", format: "email" },
    display_name: str,
    roles: arr(en("customer", "organizer", "admin")),
  }),
  Pagination: obj({
    page: { type: "integer", minimum: 1 },
    page_size: { type: "integer", minimum: 1, maximum: 100 },
    total: int,
  }),
  VenueInput: obj({
    name: str,
    address: str,
    city: str,
    country: { type: "string", minLength: 2, maxLength: 2 },
    capacity: { type: "integer", minimum: 1, maximum: 1000000 },
    timezone: { type: "string", example: "Africa/Cairo" },
  }),
  EventInput: obj({
    title: str,
    description: str,
    category_label: str,
    venue_id: uuid,
    starts_at: date,
    ends_at: date,
    sales_open_at: date,
    sales_close_at: date,
    timezone: str,
    capacity: { type: "integer", minimum: 1, maximum: 1000000 },
    currency: { type: "string", pattern: "^[A-Z]{3}$", example: "USD" },
  }),
  CategoryInput: obj({
    name: str,
    capacity: int,
    price_minor: { ...int, maximum: 100000000 },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
  }),
  Action: obj({
    allowed: bool,
    reason: nullable(
      en(
        "HOLD_INELIGIBLE",
        "NOT_RESERVED",
        "REFUND_INELIGIBLE",
        "REFUND_REQUIRES_REVIEW",
      ),
    ),
  }),
  BookingState: en(
    "RESERVED",
    "CONFIRMED",
    "EXPIRED",
    "CANCELED",
    "REFUND_PENDING",
    "REFUNDED",
  ),
  PaymentState: en("CREATED", "PENDING", "SUCCEEDED", "FAILED", "CANCELED"),
  RefundState: en("REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED"),
  ArtifactState: en("PENDING", "READY", "FAILED"),
  Reservation: obj({
    id: uuid,
    state: ref("BookingState"),
    quantity: { type: "integer", minimum: 1, maximum: 6 },
    unit_price_minor: int,
    total_minor: int,
    currency: str,
    expires_at: date,
    server_time: date,
    event: obj({ id: uuid, title: str }),
    category: obj({ id: uuid, name: str }),
  }),
  Checkout: obj({
    attempt_id: uuid,
    status: en("ready", "pending"),
    checkout_url: nullable({ type: "string", format: "uri" }),
    mode: en("simulator", "stripe_test"),
  }),
  Refund: obj({
    id: uuid,
    state: ref("RefundState"),
    reason: en("customer", "event_canceled", "late_payment", "extra_payment"),
  }),
  Demo: obj({
    id: uuid,
    booking_id: uuid,
    amount_minor: int,
    currency: str,
    status: en("open", "completed"),
    allowed_outcomes: arr(en("success", "decline")),
  }),
  DemoCompleted: obj({
    id: uuid,
    status: { type: "string", const: "completed" },
    outcome: en("success", "decline"),
  }),
  Ticket: obj({
    id: uuid,
    booking_id: uuid,
    state: en("VALID", "CHECKED_IN", "SUSPENDED", "VOID"),
    artifact_status: ref("ArtifactState"),
    qr_svg: nullable(str),
    check_in_token: {
      type: "string",
      description:
        "Opaque bearer check-in credential; owner only. Render qr_svg as an image, never insert untrusted markup.",
    },
  }),
  CheckIn: obj({
    status: en("admitted", "already_checked_in"),
    ticket_id: uuid,
  }),
  Accepted: obj({ accepted: bool }),
  Queued: obj({ id: uuid, status: { type: "string", const: "queued" } }),
  Deleted: obj({ deleted: bool }),
  Logout: obj({ logged_out: bool }),
  BookingCancel: obj({ id: uuid, state: en("CANCELED", "EXPIRED") }),
  RoleChange: obj({ user_id: uuid, organizer: bool }),
};
schemas.Venue = obj({
  ...schemas.VenueInput.properties,
  id: uuid,
  owner_id: uuid,
  archived_at: nullable(date),
});
schemas.Event = obj({
  ...schemas.EventInput.properties,
  id: uuid,
  owner_id: uuid,
  state: en("DRAFT", "PUBLISHED", "CANCELED", "COMPLETED"),
  version: int,
});
schemas.Category = obj({
  ...schemas.CategoryInput.properties,
  id: uuid,
  event_id: uuid,
  reserved_count: int,
  sold_count: int,
});
schemas.Booking = obj({
  ...schemas.Reservation.properties,
  payment: obj({
    state: nullable(ref("PaymentState")),
    reconciliation_required: bool,
  }),
  refund: nullable(
    obj({
      state: ref("RefundState"),
      reason: en("customer", "event_canceled", "late_payment", "extra_payment"),
    }),
  ),
  tickets: obj({ count: int, artifact_status: ref("ArtifactState") }),
  allowed_actions: obj({
    checkout: ref("Action"),
    cancel: ref("Action"),
    refund: ref("Action"),
  }),
});
schemas.PublicEvent = obj({
  id: uuid,
  title: str,
  description: str,
  category_label: str,
  starts_at: date,
  ends_at: date,
  sales_open_at: date,
  sales_close_at: date,
  timezone: str,
  currency: str,
  venue: obj({ id: uuid, name: str, address: str, city: str, country: str }),
  categories: arr(
    obj({
      id: uuid,
      name: str,
      price_minor: int,
      currency: str,
      indicative_available: int,
    }),
  ),
  availability_is_indicative: { type: "boolean", const: true },
});
schemas.SalesCategory = obj({
  confirmed_count: int,
  refunded_count: int,
  category_id: uuid,
  name: str,
  capacity: int,
  reserved_count: int,
  sold_count: int,
  captured_minor: int,
  refunded_minor: int,
  net_collected_minor: int,
  ticket_count: int,
  checked_in_count: int,
});
schemas.Sales = obj({
  confirmed_count: int,
  refunded_count: int,
  event_id: uuid,
  currency: str,
  captured_minor: int,
  refunded_minor: int,
  net_collected_minor: int,
  reserved_count: int,
  sold_count: int,
  ticket_count: int,
  checked_in_count: int,
  categories: arr(ref("SalesCategory")),
  daily_sales: arr(
    obj({ day: { type: "string", format: "date" }, captured_minor: int }),
  ),
});
const page = (n) => obj({ items: arr(ref(n)), pagination: ref("Pagination") });
const list = (n) => obj({ items: arr(ref(n)) });
const paths = {};
function endpoint(
  method,
  path,
  response,
  {
    body,
    auth = true,
    idempotent = false,
    status = 200,
    description = "",
    query = [],
    cookie = false,
  } = {},
) {
  const parameters = [
    ...Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: uuid,
    })),
    ...query,
  ];
  if (idempotent)
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      schema: { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,128}$" },
      description:
        "Actor and operation scoped; retain >=7 days; same key changed input is 409.",
    });
  if (cookie)
    parameters.push({
      name: "Origin",
      in: "header",
      required: true,
      schema: { type: "string", example: "http://localhost:8080" },
      description:
        "Must exactly equal FRONTEND_ORIGIN; null/missing/cross-site metadata rejected.",
    });
  const responses = {
    [status]: {
      description: "Success",
      headers: cookie
        ? {
            "Set-Cookie": {
              schema: str,
              description:
                "refresh_token; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Secure under HTTPS. Opaque value absent from JSON.",
            },
          }
        : {},
      content: { "application/json": { schema: response } },
    },
  };
  for (const code of [400, 401, 403, 404, 409, 413, 429, 503])
    responses[code] = {
      description: {
        400: "Validation failure",
        401: "Authentication failed",
        403: "Role/Origin denied",
        404: "Missing or inaccessible",
        409: "State, inventory, deadline or idempotency conflict",
        413: "Request exceeds 64kb",
        429: "Rate limited",
        503: "Required dependency unavailable",
      }[code],
      content: { "application/json": { schema: ref("Error") } },
    };
  (paths[path] ||= {})[method] = {
    operationId: method + "_" + path.replace(/[{}]/g, "").replace(/\//g, "_"),
    description,
    security: auth ? [{ bearer: [] }] : [],
    parameters,
    responses,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
  };
}
const empty = obj({});
const credentials = obj({
  email: { type: "string", format: "email", maxLength: 254 },
  password: { type: "string", minLength: 12, maxLength: 128 },
});
endpoint("post", "/auth/register", ref("User"), {
  auth: false,
  cookie: true,
  status: 201,
  body: obj({
    ...credentials.properties,
    display_name: { type: "string", minLength: 1, maxLength: 200 },
  }),
  description: "Creates customer only; roles input rejected.",
});
endpoint("post", "/auth/login", ref("Auth"), {
  auth: false,
  cookie: true,
  body: credentials,
});
endpoint("post", "/auth/refresh", ref("Auth"), {
  auth: false,
  cookie: true,
  body: empty,
  description:
    "Rotates cookie. Reuse revokes the whole family, including a concurrently issued replacement.",
});
endpoint("post", "/auth/logout", ref("Logout"), {
  auth: false,
  cookie: true,
  body: empty,
  description:
    "Clears cookie and revokes family. Access JWT remains valid for up to 15 minutes.",
});
endpoint("get", "/me", ref("User"));
endpoint("patch", "/me", ref("User"), {
  body: obj({ display_name: { type: "string", minLength: 1, maxLength: 200 } }),
});
for (const [plural, type] of [
  ["venues", "Venue"],
  ["events", "Event"],
]) {
  const root = `/organizer/${plural}`;
  endpoint("get", root, page(type));
  endpoint("post", root, ref(type), { body: ref(type + "Input"), status: 201 });
  endpoint("get", root + "/{id}", ref(type));
  endpoint("patch", root + "/{id}", ref(type), {
    body: { ...schemas[type + "Input"], required: [] },
  });
  endpoint(
    "delete",
    root + "/{id}",
    plural === "venues"
      ? obj({ deleted: bool, archived: bool })
      : ref("Deleted"),
  );
}
for (const action of ["publish", "cancel", "complete"])
  endpoint("post", `/organizer/events/{id}/${action}`, ref("Event"), {
    body: empty,
    description:
      "Organizer-owned state transition; cancellation fan-out is asynchronous.",
  });
endpoint("get", "/organizer/events/{id}/categories", page("Category"));
endpoint(
  "get",
  "/organizer/events/{id}/categories/{categoryId}",
  ref("Category"),
);
endpoint("post", "/organizer/events/{id}/categories", ref("Category"), {
  body: ref("CategoryInput"),
  status: 201,
});
endpoint(
  "patch",
  "/organizer/events/{id}/categories/{categoryId}",
  ref("Category"),
  { body: { ...schemas.CategoryInput, required: [] } },
);
endpoint(
  "delete",
  "/organizer/events/{id}/categories/{categoryId}",
  ref("Deleted"),
);
const pagination = [
  {
    name: "page",
    in: "query",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "page_size",
    in: "query",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
];
endpoint("get", "/events", page("PublicEvent"), {
  auth: false,
  query: [
    ...pagination,
    ...["city", "category", "q", "start_from", "start_to", "sort"].map(
      (name) => ({
        name,
        in: "query",
        schema:
          name === "sort"
            ? {
                ...en("starts_at", "starts_at_desc", "title"),
                default: "starts_at",
              }
            : name.startsWith("start_")
              ? date
              : { type: "string", maxLength: name === "q" ? 100 : 200 },
      }),
    ),
  ],
});
endpoint("get", "/events/{id}", ref("PublicEvent"), { auth: false });
endpoint("post", "/bookings", ref("Reservation"), {
  body: obj({
    category_id: uuid,
    quantity: { type: "integer", minimum: 1, maximum: 6 },
  }),
  idempotent: true,
  status: 201,
});
endpoint("get", "/bookings", page("Booking"), { query: pagination });
endpoint("get", "/bookings/{id}", ref("Booking"));
endpoint("post", "/bookings/{id}/cancel", ref("BookingCancel"), {
  body: empty,
  idempotent: true,
});
endpoint("post", "/bookings/{id}/checkout", ref("Checkout"), {
  body: empty,
  idempotent: true,
  description:
    "pending means safe recovery of the stored attempt; never initiate another provider call with a new identity.",
});
endpoint("post", "/bookings/{id}/refund", ref("Refund"), {
  body: empty,
  idempotent: true,
  status: 202,
});
endpoint("get", "/bookings/{id}/tickets", list("Ticket"));
endpoint("get", "/tickets/{id}", ref("Ticket"));
endpoint("post", "/organizer/events/{id}/check-ins", ref("CheckIn"), {
  body: obj({ token: { type: "string", minLength: 20, maxLength: 200 } }),
});
endpoint("get", "/organizer/events/{id}/reports/sales", ref("Sales"));
endpoint("get", "/demo/checkout/{sessionId}", ref("Demo"), {
  description: "Local/test simulator only; authenticated owner.",
});
endpoint("post", "/demo/checkout/{sessionId}/complete", ref("DemoCompleted"), {
  body: obj({ outcome: en("success", "decline") }),
  idempotent: true,
  description:
    "Local/test only. Atomically records outcome and signed verified evidence in durable inbox. Does not confirm directly.",
});
endpoint("post", "/webhooks/stripe", ref("Accepted"), {
  auth: false,
  body: { type: "object", additionalProperties: true },
  description:
    "Stripe test only. Requires Stripe-Signature over raw JSON; durable inbox before 2xx.",
});
paths["/webhooks/stripe"].post.parameters.push({
  name: "Stripe-Signature",
  in: "header",
  required: true,
  schema: str,
});
endpoint("post", "/admin/users/{id}/organizer", ref("RoleChange"), {
  body: obj({ enabled: bool }),
});
endpoint("post", "/admin/events/{id}/cancel", ref("Event"), { body: empty });
const operationsSchemas = {
  payments: obj({
    id: uuid,
    booking_id: uuid,
    state: ref("PaymentState"),
    reconciliation_required: bool,
    manual_resolution: bool,
    created_at: date,
  }),
  refunds: obj({
    id: uuid,
    payment_id: uuid,
    booking_id: nullable(uuid),
    state: ref("RefundState"),
    reason: en("customer", "event_canceled", "late_payment", "extra_payment"),
    attempts: int,
    manual_resolution: bool,
  }),
  outbox: obj({
    id: uuid,
    event_type: str,
    created_at: date,
    attempts: int,
    dead: bool,
  }),
  webhooks: obj({
    id: uuid,
    event_id: str,
    state: en("PENDING", "PROCESSING", "DONE", "DEAD"),
    attempts: int,
    error_code: nullable(str),
  }),
  notifications: obj({
    id: uuid,
    booking_id: uuid,
    kind: en("confirmation", "refund"),
    state: en("PENDING", "PROCESSING", "DONE", "DEAD"),
    attempts: int,
    error_code: nullable(str),
  }),
  "dead-letters": obj({
    id: uuid,
    event_id: uuid,
    error_code: str,
    replayed_at: nullable(date),
    created_at: date,
  }),
  audit: obj({
    id: uuid,
    actor_id: nullable(uuid),
    action: str,
    resource_id: uuid,
    correlation_id: str,
    metadata: { type: "object", additionalProperties: true },
    created_at: date,
  }),
  drift: obj({
    id: uuid,
    reserved_count: int,
    sold_count: int,
    expected_reserved: int,
    expected_sold: int,
  }),
};
for (const kind of [
  "payments",
  "refunds",
  "outbox",
  "webhooks",
  "notifications",
  "dead-letters",
  "audit",
  "drift",
])
  endpoint(
    "get",
    `/admin/operations/${kind}`,
    {
      type: "object",
      properties: { items: { type: "array", items: operationsSchemas[kind] } },
      required: ["items"],
    },
    {
      description:
        "Administrator-only bounded operations records; no credentials.",
    },
  );
for (const kind of [
  "payments",
  "refunds",
  "outbox",
  "webhooks",
  "notifications",
  "dead-letters",
])
  endpoint("post", `/admin/operations/${kind}/{id}/retry`, ref("Queued"), {
    body: empty,
    description:
      "Administrator-only audited retry preserving business identity. Old unknown financial operations require manual reconciliation.",
  });
schemas.Reservation.example = {
  id: "00000000-0000-4000-8000-000000000001",
  state: "RESERVED",
  quantity: 1,
  unit_price_minor: 2500,
  total_minor: 2500,
  currency: "USD",
  expires_at: "2026-10-13T20:10:00Z",
  server_time: "2026-10-13T20:00:00Z",
  event: { id: "00000000-0000-4000-8000-000000000002", title: "Refund Demo" },
  category: { id: "00000000-0000-4000-8000-000000000003", name: "General" },
};
const contract = {
  openapi: "3.1.0",
  info: {
    title: "TicketFlow",
    version: "ticketflow-api-v1",
    description:
      "Backend-owned contract. UUIDs, UTC instants, snake_case, integer minor-unit money. Business time is PostgreSQL time. Local/test-only demo routes disabled in production.",
  },
  servers: [{ url: "/api/v1" }],
  paths,
  components: {
    securitySchemes: {
      bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas,
  },
};
writeFileSync("docs/openapi.json", JSON.stringify(contract, null, 2) + "\n");
