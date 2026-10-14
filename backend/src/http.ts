import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { timingSafeEqual, randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { Services } from "./infra/services";
import { config } from "./infra/config";
import { assert, ApiError, pagination } from "./infra/common";
import { requests, conflicts, log } from "./infra/metrics";
import { Simulator } from "./payments/provider";
import contract from "../docs/openapi.json";
import { schemaReady } from "./infra/readiness";
import { requestContext } from "./infra/context";
const uuid = z.uuid(),
  text = z.string().min(1).max(200),
  instant = z.iso.datetime({ offset: true }),
  currency = z.string().regex(/^[A-Z]{3}$/);
const timezone = text.refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "IANA timezone required");
const venue = z
  .object({
    name: text,
    address: z.string().min(1).max(500),
    city: text,
    country: z.string().length(2),
    capacity: z.number().int().positive().max(1000000),
    timezone,
  })
  .strict();
const event = z
  .object({
    title: text,
    description: z.string().max(10000),
    category_label: text,
    venue_id: uuid,
    starts_at: instant,
    ends_at: instant,
    sales_open_at: instant,
    sales_close_at: instant,
    timezone,
    capacity: z.number().int().positive().max(1000000),
    currency,
  })
  .strict();
const category = z
  .object({
    name: text,
    capacity: z.number().int().min(0).max(1000000),
    price_minor: z.number().int().min(0).max(100000000),
    currency,
  })
  .strict();
const credentials = z
  .object({ email: z.email().max(254), password: z.string().min(12).max(128) })
  .strict();
const cookieOptions = {
  httpOnly: true,
  secure: config.COOKIE_SECURE === "true",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  maxAge: 7 * 86400000,
};
type Context = { req: Request; res: Response; user: any; body: any };
export function apiRouter(s: Services) {
  const router = Router();
  router.use(helmet());
  router.use(cookieParser());
  router.use((req: any, res, next) => {
    req.request_id = randomUUID();
    res.setHeader("X-Request-ID", req.request_id);
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin === config.FRONTEND_ORIGIN) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type,Idempotency-Key",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PATCH,DELETE,OPTIONS",
      );
    }
    if (req.method === "OPTIONS") {
      res.status(origin === config.FRONTEND_ORIGIN ? 204 : 403).end();
      return;
    }
    const end = requests.startTimer();
    res.on("finish", () => {
      end({
        method: req.method,
        route: req.route?.path || "unmatched",
        status: String(res.statusCode),
      });
      log("http", {
        request_id: req.request_id,
        method: req.method,
        route: req.route?.path || "unmatched",
        status: res.statusCode,
      });
    });
    requestContext.run({ request_id: req.request_id }, () => next());
  });
  const route = (
    method: "get" | "post" | "patch" | "delete",
    path: string,
    role: "public" | "auth" | "organizer" | "admin",
    schema: z.ZodType | undefined,
    handler: (c: Context) => Promise<unknown> | unknown,
    status = 200,
  ) =>
    router[method](
      path,
      async (req: Request, res: Response, next: NextFunction) => {
        try {
          for (const value of Object.values(req.params)) uuid.parse(value);
          const user =
            role === "public"
              ? null
              : await s.identity.authenticate(req.headers.authorization);
          if (role === "organizer" || role === "admin")
            assert(user.roles.includes(role), 403, "FORBIDDEN");
          const body = schema ? schema.parse(req.body) : {};
          const result = await handler({ req, res, user, body });
          if (!res.headersSent) res.status(status).json(result);
        } catch (e) {
          next(e);
        }
      },
    );
  const id = (req: Request, name = "id") => String(req.params[name]);
  const key = (req: Request) => req.header("Idempotency-Key") || "";
  router.use(
    "/auth",
    rateLimit({
      windowMs: 60000,
      limit: config.APP_MODE === "test" ? 1000 : 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (req: any, res) =>
        res.status(429).json({
          code: "RATE_LIMITED",
          message: "Too many authentication requests",
          request_id: req.request_id,
        }),
    }),
  );
  router.use("/auth", (req, res, next) => {
    try {
      if (req.method === "POST")
        assert(
          req.headers.origin === config.FRONTEND_ORIGIN &&
            req.headers["sec-fetch-site"] !== "cross-site",
          403,
          "UNTRUSTED_ORIGIN",
        );
      next();
    } catch (e) {
      next(e);
    }
  });
  const issue = (res: Response, r: any) => {
    res.cookie("refresh_token", r.refresh, cookieOptions);
    return { access_token: r.access_token, expires_in: r.expires_in };
  };
  route(
    "post",
    "/auth/register",
    "public",
    credentials.extend({ display_name: text }),
    ({ body }) => s.identity.register(body),
    201,
  );
  route("post", "/auth/login", "public", credentials, async ({ body, res }) =>
    issue(res, await s.identity.login(body.email, body.password)),
  );
  route(
    "post",
    "/auth/refresh",
    "public",
    z.object({}).strict(),
    async ({ req, res }) =>
      issue(res, await s.identity.refresh(req.cookies.refresh_token)),
  );
  route(
    "post",
    "/auth/logout",
    "public",
    z.object({}).strict(),
    async ({ req, res }) => {
      const result = await s.identity.logout(req.cookies.refresh_token);
      res.clearCookie("refresh_token", {
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        sameSite: cookieOptions.sameSite,
        path: cookieOptions.path,
      });
      return result;
    },
  );
  route("get", "/me", "auth", undefined, ({ user }) => user);
  route(
    "patch",
    "/me",
    "auth",
    z.object({ display_name: text }).strict(),
    ({ user, body }) => s.identity.patch(user.id, body.display_name),
  );
  route("get", "/organizer/venues", "organizer", undefined, ({ user, req }) =>
    s.catalog.venues(user.id, req.query),
  );
  route(
    "post",
    "/organizer/venues",
    "organizer",
    venue,
    ({ user, body }) => s.catalog.saveVenue(user.id, body),
    201,
  );
  route(
    "get",
    "/organizer/venues/:id",
    "organizer",
    undefined,
    async ({ user, req }) => {
      const v = await s.db.one(
        "SELECT * FROM venues WHERE id=$1 AND owner_id=$2",
        [id(req), user.id],
      );
      assert(v, 404, "VENUE_NOT_FOUND");
      return v;
    },
  );
  route(
    "patch",
    "/organizer/venues/:id",
    "organizer",
    venue.partial(),
    ({ user, body, req }) => s.catalog.saveVenue(user.id, body, id(req)),
  );
  route(
    "delete",
    "/organizer/venues/:id",
    "organizer",
    undefined,
    ({ user, req }) => s.catalog.deleteVenue(user.id, id(req)),
  );
  route("get", "/organizer/events", "organizer", undefined, ({ user, req }) =>
    s.catalog.ownedEvents(user.id, req.query),
  );
  route(
    "post",
    "/organizer/events",
    "organizer",
    event,
    ({ user, body }) => s.catalog.saveEvent(user.id, body),
    201,
  );
  route(
    "get",
    "/organizer/events/:id",
    "organizer",
    undefined,
    ({ user, req }) =>
      s.db.transaction((tx) => s.catalog.event(tx, id(req), user.id)),
  );
  route(
    "patch",
    "/organizer/events/:id",
    "organizer",
    event.partial(),
    ({ user, body, req }) => s.catalog.saveEvent(user.id, body, id(req)),
  );
  route(
    "delete",
    "/organizer/events/:id",
    "organizer",
    undefined,
    ({ user, req }) => s.catalog.deleteEvent(user.id, id(req)),
  );
  for (const [action, state] of [
    ["publish", "PUBLISHED"],
    ["cancel", "CANCELED"],
    ["complete", "COMPLETED"],
  ] as const)
    route(
      "post",
      `/organizer/events/:id/${action}`,
      "organizer",
      z.object({}).strict(),
      ({ user, req }) => s.catalog.transition(user.id, id(req), state),
    );
  route(
    "get",
    "/organizer/events/:id/categories",
    "organizer",
    undefined,
    ({ user, req }) => s.catalog.categories(user.id, id(req), req.query),
  );
  route(
    "post",
    "/organizer/events/:id/categories",
    "organizer",
    category,
    ({ user, body, req }) => s.catalog.saveCategory(user.id, id(req), body),
    201,
  );
  route(
    "get",
    "/organizer/events/:id/categories/:categoryId",
    "organizer",
    undefined,
    ({ user, req }) =>
      s.db.transaction(async (tx) => {
        await s.catalog.event(tx, id(req), user.id);
        const c = await s.db.one(
          "SELECT * FROM ticket_categories WHERE id=$1 AND event_id=$2",
          [id(req, "categoryId"), id(req)],
          tx,
        );
        assert(c, 404, "CATEGORY_NOT_FOUND");
        return c;
      }),
  );
  route(
    "patch",
    "/organizer/events/:id/categories/:categoryId",
    "organizer",
    category.partial(),
    ({ user, body, req }) =>
      s.catalog.saveCategory(user.id, id(req), body, id(req, "categoryId")),
  );
  route(
    "delete",
    "/organizer/events/:id/categories/:categoryId",
    "organizer",
    undefined,
    ({ user, req }) =>
      s.catalog.deleteCategory(user.id, id(req), id(req, "categoryId")),
  );
  route("get", "/events", "public", undefined, ({ req }) => {
    const q = z
      .object({
        page: z.string().optional(),
        page_size: z.string().optional(),
        sort: z.enum(["starts_at", "starts_at_desc", "title"]).optional(),
        city: text.optional(),
        category: text.optional(),
        q: z.string().max(100).optional(),
        start_from: instant.optional(),
        start_to: instant.optional(),
      })
      .strict()
      .parse(req.query);
    const p = pagination(q);
    const normalized = {
      ...q,
      page: p.page,
      page_size: p.page_size,
      sort: q.sort || "starts_at",
    };
    return s.cache.read(normalized, () => s.catalog.publicList(normalized));
  });
  route("get", "/events/:id", "public", undefined, ({ req }) =>
    s.cache.read({ id: id(req) }, () => s.catalog.publicDetail(id(req))),
  );
  route(
    "post",
    "/bookings",
    "auth",
    z
      .object({ category_id: uuid, quantity: z.number().int().min(1).max(6) })
      .strict(),
    ({ user, body, req }) => s.reservations.reserve(user.id, key(req), body),
    201,
  );
  route("get", "/bookings", "auth", undefined, async ({ user, req }) => {
    const p = pagination(req.query);
    const total = await s.db.one(
      "SELECT count(*)::int n FROM bookings WHERE customer_id=$1",
      [user.id],
    );
    const ids = await s.db.rows(
      "SELECT id FROM bookings WHERE customer_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3",
      [user.id, p.page_size, p.offset],
    );
    return {
      items: await Promise.all(
        ids.map((b) => s.reservations.detail(user.id, b.id)),
      ),
      pagination: { page: p.page, page_size: p.page_size, total: total.n },
    };
  });
  route("get", "/bookings/:id", "auth", undefined, ({ user, req }) =>
    s.reservations.detail(user.id, id(req)),
  );
  route(
    "post",
    "/bookings/:id/cancel",
    "auth",
    z.object({}).strict(),
    ({ user, req }) => s.reservations.cancel(user.id, id(req), key(req)),
  );
  route(
    "post",
    "/bookings/:id/checkout",
    "auth",
    z.object({}).strict(),
    ({ user, req }) => s.payments.checkout(user.id, id(req), key(req)),
  );
  route(
    "post",
    "/bookings/:id/refund",
    "auth",
    z.object({}).strict(),
    ({ user, req }) => s.payments.customerRefund(user.id, id(req), key(req)),
    202,
  );
  route("get", "/bookings/:id/tickets", "auth", undefined, ({ user, req }) =>
    s.ticketing.list(user.id, id(req)),
  );
  route("get", "/tickets/:id", "auth", undefined, ({ user, req }) =>
    s.ticketing.detail(user.id, id(req)),
  );
  route(
    "post",
    "/organizer/events/:id/check-ins",
    "organizer",
    z.object({ token: z.string().min(20).max(200) }).strict(),
    ({ user, req, body }) => s.ticketing.checkin(user.id, id(req), body.token),
  );
  route(
    "get",
    "/organizer/events/:id/reports/sales",
    "organizer",
    undefined,
    ({ user, req }) => s.reporting.sales(user.id, id(req)),
  );
  if (config.PAYMENT_PROVIDER === "stripe_test")
    route("post", "/webhooks/stripe", "public", undefined, ({ req }) =>
      s.payments.accept(
        (req as any).rawBody,
        req.header("stripe-signature") || "",
      ),
    );
  if (config.APP_MODE !== "production") {
    router.post("/internal/simulator/control", async (req, res, next) => {
      try {
        const expected = Buffer.from(config.INTERNAL_SECRET || ""),
          actual = Buffer.from(req.header("X-Internal-Secret") || "");
        assert(
          expected.length >= 32 &&
            expected.length === actual.length &&
            timingSafeEqual(expected, actual) &&
            s.payments.adapter instanceof Simulator,
          403,
          "FORBIDDEN",
        );
        const body = z
          .object({
            operation_key: z.string().min(1).max(200),
            fault: z.enum(["timeout_after_success", "refund_failure"]),
          })
          .strict()
          .parse(req.body);
        await s.db.rows(
          "INSERT INTO simulator_operations(operation_key,kind,result) VALUES($1,'fault',$2) ON CONFLICT(operation_key) DO UPDATE SET result=EXCLUDED.result",
          [
            "fault:" + body.operation_key,
            JSON.stringify({ fault: body.fault }),
          ],
        );
        res.json({ configured: true });
      } catch (e) {
        next(e);
      }
    });
    route(
      "get",
      "/demo/checkout/:sessionId",
      "auth",
      undefined,
      ({ user, req }) => s.payments.demo(user.id, id(req, "sessionId")),
    );
    route(
      "post",
      "/demo/checkout/:sessionId/complete",
      "auth",
      z.object({ outcome: z.enum(["success", "decline"]) }).strict(),
      ({ user, req, body }) =>
        s.payments.completeDemo(
          user.id,
          id(req, "sessionId"),
          key(req),
          body.outcome,
        ),
    );
    router.post("/internal/simulator/events", async (req, res, next) => {
      try {
        const expected = Buffer.from(config.INTERNAL_SECRET || ""),
          actual = Buffer.from(req.header("X-Internal-Secret") || "");
        assert(
          expected.length >= 32 &&
            expected.length === actual.length &&
            timingSafeEqual(expected, actual) &&
            s.payments.adapter instanceof Simulator,
          403,
          "FORBIDDEN",
        );
        const input = z
          .object({
            attempt_id: uuid,
            outcome: z.enum(["success", "decline"]),
            event_id: z.string().min(1).max(200),
            delay_seconds: z.number().int().min(0).max(3600).default(0),
          })
          .strict()
          .parse(req.body);
        const a = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
          input.attempt_id,
        ]);
        assert(a, 404, "NOT_FOUND");
        const raw = Buffer.from(
          JSON.stringify(
            s.payments.adapter.evidence(a, input.outcome, input.event_id),
          ),
        );
        const result = await s.payments.accept(
          raw,
          s.payments.adapter.sign(raw),
          s.payments.adapter,
          input.delay_seconds,
        );
        res.json(result);
      } catch (e) {
        next(e);
      }
    });
    route("get", "/openapi.json", "public", undefined, () => contract);
    route("get", "/docs", "public", undefined, ({ res }) => {
      res
        .type("html")
        .send(
          '<!doctype html><title>TicketFlow API</title><h1>TicketFlow API v1</h1><p><a href="/api/v1/openapi.json">Download OpenAPI JSON</a>. Import into Swagger Editor or your API client.</p>',
        );
    });
  }
  // Operational kind is an allowlisted literal, not a UUID path parameter.
  router.get("/admin/operations/:kind", async (req, res, next) => {
    try {
      const user = await s.identity.authenticate(req.headers.authorization);
      assert(user.roles.includes("admin"), 403, "FORBIDDEN");
      res.json({ items: await s.operations.inspect(String(req.params.kind)) });
    } catch (e) {
      next(e);
    }
  });
  router.post("/admin/operations/:kind/:id/retry", async (req, res, next) => {
    try {
      uuid.parse(req.params.id);
      const user = await s.identity.authenticate(req.headers.authorization);
      assert(user.roles.includes("admin"), 403, "FORBIDDEN");
      res.json(
        await s.operations.retry(
          user.id,
          String(req.params.kind),
          String(req.params.id),
        ),
      );
    } catch (e) {
      next(e);
    }
  });
  route(
    "post",
    "/admin/users/:id/organizer",
    "admin",
    z.object({ enabled: z.boolean() }).strict(),
    ({ user, req, body }) =>
      s.identity.organizerRole(user.id, id(req), body.enabled),
  );
  route(
    "post",
    "/admin/events/:id/cancel",
    "admin",
    z.object({}).strict(),
    ({ user, req }) => s.catalog.transition(user.id, id(req), "CANCELED", true),
  );
  router.use((_req, _res, next) => next(new ApiError(404, "NOT_FOUND")));
  router.use((error: any, req: any, res: Response, _next: NextFunction) => {
    log("request_failed", {
      request_id: req.request_id,
      error_code: error.code || error.name || "UNKNOWN",
    });
    let status = error.status || 500,
      code = error.code || "INTERNAL_ERROR",
      fields = error.field_errors;
    if (error instanceof z.ZodError) {
      status = 400;
      code = "VALIDATION_ERROR";
      fields = error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      }));
    } else if (error.code === "23505") {
      status = 409;
      code = "RESOURCE_CONFLICT";
    } else if (
      ["23514", "23503", "22P02", "22007", "22008"].includes(error.code)
    ) {
      status = 400;
      code = "INVALID_INPUT";
    } else if (
      ["ECONNREFUSED", "57P01", "53300", "08006"].includes(error.code)
    ) {
      status = 503;
      code = "DATABASE_UNAVAILABLE";
    }
    if (code === "INVENTORY_UNAVAILABLE") conflicts.inc();
    res.status(status).json({
      code: status === 500 ? "INTERNAL_ERROR" : code,
      message:
        status === 500
          ? "Internal server error"
          : error instanceof ApiError
            ? error.message
            : code,
      request_id: req.request_id || randomUUID(),
      ...(fields ? { field_errors: fields } : {}),
    });
  });
  return router;
}
export async function health(s: Services) {
  try {
    assert(await schemaReady(s.db), 503, "SCHEMA_UNAVAILABLE");
    return {
      status: "ready",
      database: "up",
      cache: s.cache.redis.status === "ready" ? "up" : "degraded",
    };
  } catch {
    throw new ApiError(503, "NOT_READY");
  }
}
export { registry } from "./infra/metrics";
