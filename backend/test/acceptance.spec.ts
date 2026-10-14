import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/main";
import { services } from "../src/infra/services";
import { Worker } from "../src/worker";
import { Simulator } from "../src/payments/provider";
import { fixtureIds, seed } from "../scripts/seed";
import { config } from "../src/infra/config";
import contract from "../docs/openapi.json";
import { cache } from "../src/infra/metrics";
import { matches } from "./contract";
import { Messaging } from "../src/infra/messaging";
import { Notifications } from "../src/notifications/service";
import { execFileSync } from "node:child_process";
import { hash } from "../src/infra/common";
const origin = "http://localhost:8080";
describe("backend acceptance on real isolated infrastructure", () => {
  const s = services();
  let app: any, http: any, worker: Worker;
  let customer: any, organizer: any, other: any, admin: any;
  let customerToken: string,
    organizerToken: string,
    otherToken: string,
    adminToken: string;
  const agent = () => request(http);
  const auth = (r: any, t = customerToken) =>
    r.set("Authorization", `Bearer ${t}`);
  const command = (path: string, body: any = {}, key = randomUUID()) =>
    auth(agent().post("/api/v1" + path))
      .set("Idempotency-Key", key)
      .send(body);
  async function fixture(capacity = 20, hours = 72) {
    const e = await s.catalog.saveEvent(organizer.id, {
      title: "Acceptance " + randomUUID(),
      description: "Real SQL fixture",
      category_label: "test",
      venue_id: fixtureIds.venue,
      starts_at: new Date(Date.now() + hours * 3600000).toISOString(),
      ends_at: new Date(Date.now() + (hours + 4) * 3600000).toISOString(),
      sales_open_at: new Date(Date.now() - 3600000).toISOString(),
      sales_close_at: new Date(
        Date.now() + (hours - 0.1) * 3600000,
      ).toISOString(),
      timezone: "UTC",
      capacity,
      currency: "USD",
    });
    const c = await s.catalog.saveCategory(organizer.id, e.id, {
      name: "General",
      capacity,
      price_minor: 1500,
      currency: "USD",
    });
    await s.catalog.transition(organizer.id, e.id, "PUBLISHED");
    return { e, c };
  }
  async function reserve(c: any, quantity = 1) {
    return s.reservations.reserve(customer.id, randomUUID(), {
      category_id: c.id,
      quantity,
    });
  }
  async function capture(b: any, eventId = randomUUID()) {
    const result = await s.payments.checkout(customer.id, b.id, randomUUID());
    const a = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      result.attempt_id,
    ]);
    const sim = s.payments.adapter as Simulator;
    const raw = Buffer.from(
      JSON.stringify(sim.evidence(a, "success", eventId)),
    );
    await s.payments.accept(raw, sim.sign(raw));
    await worker.inbox();
    return a;
  }
  async function counts(c: any) {
    return s.db.one(
      "SELECT reserved_count,sold_count FROM ticket_categories WHERE id=$1",
      [c.id],
    );
  }
  beforeAll(async () => {
    if (
      config.APP_MODE !== "test" ||
      !config.DATABASE_URL.includes("ticketflow_test")
    )
      throw new Error("Tests require isolated APP_MODE=test database");
    await seed(s.db);
    ({ app } = await createApp(s));
    await app.listen(0, "127.0.0.1");
    http = app.getHttpServer();
    worker = new Worker();
    customer = await s.db.one(
      "SELECT id FROM users WHERE email='customer@ticketflow.local'",
    );
    organizer = await s.db.one(
      "SELECT id FROM users WHERE email='organizer@ticketflow.local'",
    );
    other = await s.db.one(
      "SELECT id FROM users WHERE email='organizer2@ticketflow.local'",
    );
    admin = await s.db.one(
      "SELECT id FROM users WHERE email='admin@ticketflow.local'",
    );
    const login = async (name: string) =>
      (
        await agent()
          .post("/api/v1/auth/login")
          .set("Origin", origin)
          .send({
            email: name + "@ticketflow.local",
            password: process.env.SEED_PASSWORD,
          })
      ).body.access_token;
    customerToken = await login("customer");
    organizerToken = await login("organizer");
    otherToken = await login("organizer2");
    adminToken = await login("admin");
  });
  afterAll(async () => {
    await worker?.close();
    await app?.close();
    await s.cache.close();
    await s.db.close();
  });
  it("BE-AT-01/22: migrated API health and independently served contract", async () => {
    expect((await agent().get("/health/ready")).status).toBe(200);
    const response = await agent().get("/api/v1/openapi.json");
    expect(response.body).toEqual(contract);
    const events = (await agent().get("/api/v1/events")).body;
    expect(events.pagination.page_size).toBe(20);
    for (const e of events.items) matches("PublicEvent", e);
    matches("User", (await auth(agent().get("/api/v1/me"))).body);
  });
  it("BE-AT-02: rejects privileged registration and hides resources from other owners", async () => {
    const r = await agent()
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        email: randomUUID() + "@test.local",
        password: "Long-acceptance-password!",
        display_name: "test",
        roles: ["admin"],
      });
    expect(r.status).toBe(400);
    const { e, c } = await fixture();
    const b = await reserve(c);
    expect(
      (await auth(agent().get("/api/v1/bookings/" + b.id), otherToken)).status,
    ).toBe(404);
    expect(
      (
        await auth(
          agent().patch("/api/v1/organizer/events/" + e.id),
          otherToken,
        ).send({ title: "stolen" })
      ).status,
    ).toBe(404);
  });
  it("BE-AT-03: draft CRUD, referenced venue archive, frozen publication, public filters", async () => {
    const e = await s.catalog.saveEvent(organizer.id, {
      title: "Draft",
      description: "",
      category_label: "test",
      venue_id: fixtureIds.venue,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 90000000).toISOString(),
      sales_open_at: new Date(Date.now() - 1000).toISOString(),
      sales_close_at: new Date(Date.now() + 80000000).toISOString(),
      timezone: "UTC",
      capacity: 3,
      currency: "USD",
    });
    await expect(
      s.catalog.transition(organizer.id, e.id, "PUBLISHED"),
    ).rejects.toThrow("PUBLICATION_CATEGORIES");
    const c = await s.catalog.saveCategory(organizer.id, e.id, {
      name: "Draft",
      capacity: 3,
      price_minor: 0,
      currency: "USD",
    });
    await s.catalog.deleteCategory(organizer.id, e.id, c.id);
    await s.catalog.deleteEvent(organizer.id, e.id);
    const v = await s.catalog.saveVenue(organizer.id, {
      name: "Referenced venue",
      address: "Test address",
      city: "Cairo",
      country: "EG",
      capacity: 5,
      timezone: "UTC",
    });
    expect(
      (await s.catalog.saveVenue(organizer.id, { name: "Updated venue" }, v.id))
        .name,
    ).toBe("Updated venue");
    const referenced = await s.catalog.saveEvent(organizer.id, {
      ...e,
      title: "Referenced draft",
      venue_id: v.id,
    });
    expect(await s.catalog.deleteVenue(organizer.id, v.id)).toEqual({
      archived: true,
      deleted: false,
    });
    await expect(
      s.catalog.saveVenue(other.id, { name: "Stolen" }, v.id),
    ).rejects.toThrow("VENUE_NOT_FOUND");
    await s.catalog.deleteEvent(organizer.id, referenced.id);
    expect(await s.catalog.deleteVenue(organizer.id, v.id)).toEqual({
      archived: false,
      deleted: true,
    });
    await expect(
      s.catalog.saveEvent(organizer.id, {
        ...e,
        sales_open_at: e.sales_close_at,
      }),
    ).rejects.toMatchObject({ code: "23514" });
    const f = await fixture();
    await expect(
      s.catalog.saveEvent(organizer.id, { capacity: 99 }, f.e.id),
    ).rejects.toThrow("COMMERCIAL_TERMS_FROZEN");
    expect(
      (await agent().get("/api/v1/events?city=Cairo&category=test&page_size=1"))
        .body.items,
    ).toHaveLength(1);
    expect((await agent().get("/api/v1/events?sort=DROP")).status).toBe(400);
  });
  it("BE-AT-04: 100 distinct-key competing HTTP requests through TWO API instances sell exactly ten holds", async () => {
    const { c } = await fixture(10);
    const bases = [process.env.API_URL!, process.env.API2_URL!];
    expect(bases.every(Boolean)).toBe(true);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        request(bases[i % 2])
          .post("/api/v1/bookings")
          .set("Authorization", `Bearer ${customerToken}`)
          .set("Idempotency-Key", randomUUID())
          .send({ category_id: c.id, quantity: 1 })
          .timeout(20000),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(
      results.filter(
        (r) => r.status === 409 && r.body.code === "INVENTORY_UNAVAILABLE",
      ),
    ).toHaveLength(90);
    expect(await counts(c)).toEqual({ reserved_count: 10, sold_count: 0 });
    await expect(
      s.db.rows(
        "UPDATE ticket_categories SET reserved_count=capacity+1 WHERE id=$1",
        [c.id],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("BE-AT-05: concurrent same-key requests commit one booking and reject changed payload", async () => {
    const { c } = await fixture(10),
      key = randomUUID();
    const rows = await Promise.all(
      Array.from({ length: 20 }, () =>
        s.reservations.reserve(customer.id, key, {
          category_id: c.id,
          quantity: 1,
        }),
      ),
    );
    expect(new Set(rows.map((b) => b.id)).size).toBe(1);
    expect(await counts(c)).toEqual({ reserved_count: 1, sold_count: 0 });
    await expect(
      s.reservations.reserve(customer.id, key, {
        category_id: c.id,
        quantity: 2,
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });
  it("BE-AT-06: reservation and confirmation failures roll back all local effects", async () => {
    const { c } = await fixture(),
      key = randomUUID();
    const beforeOutbox = (
      await s.db.one("SELECT count(*)::int n FROM outbox_events")
    ).n;
    process.env.TEST_FAILPOINT = "reserve";
    try {
      await expect(
        s.reservations.reserve(customer.id, key, {
          category_id: c.id,
          quantity: 2,
        }),
      ).rejects.toThrow("Injected");
    } finally {
      delete process.env.TEST_FAILPOINT;
    }
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM bookings WHERE category_id=$1",
          [c.id],
        )
      ).n,
    ).toBe(0);
    expect(
      (await s.db.one("SELECT count(*)::int n FROM outbox_events")).n,
    ).toBe(beforeOutbox);
    expect(
      await s.db.one("SELECT * FROM idempotency_requests WHERE key=$1", [key]),
    ).toBeUndefined();
    const b = await reserve(c, 2);
    const checkout = await s.payments.checkout(customer.id, b.id, randomUUID());
    const a = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      checkout.attempt_id,
    ]);
    process.env.TEST_FAILPOINT = "confirm";
    try {
      await expect(
        s.payments.process(
          (s.payments.adapter as Simulator).evidence(a, "success"),
        ),
      ).rejects.toThrow("Injected");
    } finally {
      delete process.env.TEST_FAILPOINT;
    }
    expect(await counts(c)).toEqual({ reserved_count: 2, sold_count: 0 });
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM tickets WHERE booking_id=$1",
          [b.id],
        )
      ).n,
    ).toBe(0);
    expect(
      (await s.db.one("SELECT state FROM payment_attempts WHERE id=$1", [a.id]))
        .state,
    ).toBe("PENDING");
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='BookingConfirmed'",
          [b.id],
        )
      ).n,
    ).toBe(0);
  });
  it("BE-AT-07: lock waiting cannot extend deadline; competing expiry and cancellation release once", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c);
    const result = await s.payments.checkout(customer.id, b.id, randomUUID()),
      a = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
        result.attempt_id,
      ]);
    const lock = await s.db.pool.connect();
    await lock.query("BEGIN");
    await lock.query("SELECT id FROM events WHERE id=$1 FOR UPDATE", [e.id]);
    const confirmation = s.payments.process(
      (s.payments.adapter as Simulator).evidence(a, "success"),
    );
    await lock.query(
      "UPDATE bookings SET expires_at=clock_timestamp() WHERE id=$1",
      [b.id],
    );
    await lock.query("COMMIT");
    lock.release();
    await Promise.all([
      confirmation,
      s.reservations.expire(b.id),
      s.reservations.cancel(customer.id, b.id, randomUUID()),
    ]);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    expect(
      (await s.db.one("SELECT state FROM bookings WHERE id=$1", [b.id])).state,
    ).toMatch(/EXPIRED|CANCELED/);
  });
  it("BE-AT-08/09: signed capture issues quantity once; redirects and invalid/mismatched/out-of-order evidence cannot repeat it", async () => {
    const { c } = await fixture(),
      b = await reserve(c, 3);
    const a = await capture(b);
    const sim = s.payments.adapter as Simulator;
    await s.payments.process(sim.evidence(a, "success", randomUUID()));
    await s.payments.process(sim.evidence(a, "decline", randomUUID()));
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM tickets WHERE booking_id=$1",
          [b.id],
        )
      ).n,
    ).toBe(3);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 3 });
    await expect(s.payments.accept(Buffer.from("{}"), "bad")).rejects.toThrow(
      "INVALID_SIGNATURE",
    );
    const b2 = await reserve(c),
      co = await s.payments.checkout(customer.id, b2.id, randomUUID());
    const a2 = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      co.attempt_id,
    ]);
    const evidence = { ...sim.evidence(a2, "success"), amount_minor: 1 };
    expect(await s.payments.process(evidence)).toEqual({ mismatch: true });
    expect((await s.reservations.detail(customer.id, b2.id)).state).toBe(
      "RESERVED",
    );
  });
  it("BE-AT-10: late capture creates one compensation and no second release", async () => {
    const { c } = await fixture(),
      b = await reserve(c, 2);
    await s.db.rows(
      "UPDATE bookings SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [b.id],
    );
    const a = await s.db.one(
      "INSERT INTO payment_attempts(booking_id,provider,operation_key,amount_minor,currency,state) VALUES($1,'simulator',$2,$3,'USD','PENDING') RETURNING *",
      [b.id, randomUUID(), b.total_minor],
    );
    const sim = s.payments.adapter as Simulator;
    await Promise.all([
      s.reservations.expire(b.id),
      s.payments.process(sim.evidence(a, "success")),
      s.payments.process(sim.evidence(a, "success", randomUUID())),
    ]);
    const refunds = await s.db.rows(
      "SELECT * FROM refunds WHERE payment_id=$1",
      [a.id],
    );
    expect(refunds).toHaveLength(1);
    await s.payments.executeRefund(refunds[0].id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    expect((await s.ticketing.list(customer.id, b.id)).items).toHaveLength(0);
    expect(
      (await s.db.one("SELECT state FROM bookings WHERE id=$1", [b.id])).state,
    ).toBe("EXPIRED");
  });
  it("BE-AT-11: ambiguous remote checkout/refund persists identity and recovers without duplicate operation", async () => {
    const { c } = await fixture(),
      b = await reserve(c);
    process.env.TEST_FAILPOINT = "checkout_remote";
    let co: any;
    try {
      co = await s.payments.checkout(customer.id, b.id, randomUUID());
    } finally {
      delete process.env.TEST_FAILPOINT;
    }
    expect(co.status).toBe("pending");
    await s.db.rows(
      "UPDATE payment_attempts SET lease_until=NULL WHERE id=$1",
      [co.attempt_id],
    );
    await s.payments.ensureCheckout(co.attempt_id);
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM simulator_operations WHERE operation_key=$1",
          ["checkout:" + co.attempt_id],
        )
      ).n,
    ).toBe(1);
    await capture(b);
    const r = await s.payments.customerRefund(customer.id, b.id, randomUUID());
    process.env.TEST_FAILPOINT = "refund_remote";
    try {
      await s.payments.executeRefund(r.id);
    } finally {
      delete process.env.TEST_FAILPOINT;
    }
    await s.db.rows(
      "UPDATE refunds SET lease_until=NULL,next_at=clock_timestamp() WHERE id=$1",
      [r.id],
    );
    await s.payments.executeRefund(r.id);
    expect(
      (await s.db.one("SELECT state FROM refunds WHERE id=$1", [r.id])).state,
    ).toBe("SUCCEEDED");
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM simulator_operations WHERE operation_key=$1",
          ["refund:" + r.id],
        )
      ).n,
    ).toBe(1);
  });
  it("BE-AT-12: refund suspension precedes remote processing and success alone releases sold stock", async () => {
    const { c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    const r = await s.payments.customerRefund(customer.id, b.id, randomUUID());
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 1 });
    expect((await s.ticketing.list(customer.id, b.id)).items[0].state).toBe(
      "SUSPENDED",
    );
    await s.payments.executeRefund(r.id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "REFUNDED",
    );
  });
  it("BE-AT-13: concurrent scans admit once, ownership and refund/entry windows prevent conflicting actions", async () => {
    const { e, c } = await fixture(20, 1),
      b = await reserve(c);
    await capture(b);
    const t = (await s.ticketing.list(customer.id, b.id)).items[0];
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        s.ticketing.checkin(organizer.id, e.id, t.check_in_token),
      ),
    );
    expect(results.filter((r) => r.status === "admitted")).toHaveLength(1);
    expect(
      results.filter((r) => r.status === "already_checked_in"),
    ).toHaveLength(11);
    await expect(
      s.payments.customerRefund(customer.id, b.id, randomUUID()),
    ).rejects.toThrow("TICKET_ALREADY_USED");
    await expect(
      s.ticketing.checkin(other.id, e.id, t.check_in_token),
    ).rejects.toThrow("INVALID_TICKET");
    await expect(
      s.ticketing.checkin(organizer.id, e.id, "fake"),
    ).rejects.toThrow("INVALID_TICKET");
  });
  it("BE-AT-14: real Redis cache hits and generation invalidation; outage falls back to SQL", async () => {
    await s.cache.redis.ping();
    await s.cache.read({ acceptance: randomUUID() }, () =>
      s.catalog.publicList({}),
    );
    const key = { acceptance: randomUUID() };
    let loads = 0;
    await s.cache.read(key, async () => {
      loads++;
      return { title: "old" };
    });
    await s.cache.read(key, async () => {
      loads++;
      return { title: "wrong" };
    });
    expect(loads).toBe(1);
    await s.db.rows("UPDATE catalog_generation SET generation=generation+1");
    expect(await s.cache.read(key, async () => ({ title: "new" }))).toEqual({
      title: "new",
    });
    const fillKey = { stale_fill: randomUUID() };
    let unblock!: () => void, entered!: () => void;
    const barrier = new Promise<void>((r) => {
        unblock = r;
      }),
      started = new Promise<void>((r) => {
        entered = r;
      });
    const oldFill = s.cache.read(fillKey, async () => {
      entered();
      await barrier;
      return { title: "stale" };
    });
    await started;
    await s.db.rows("UPDATE catalog_generation SET generation=generation+1");
    expect(
      await s.cache.read(fillKey, async () => ({ title: "current" })),
    ).toEqual({ title: "current" });
    unblock();
    await oldFill;
    expect(
      await s.cache.read(fillKey, async () => ({ title: "wrong" })),
    ).toEqual({ title: "current" });
    const generation = (
      await s.db.one("SELECT generation FROM catalog_generation")
    ).generation;
    const redisKey = `ticketflow-api-v1:catalog:${generation}:${hash(JSON.stringify(fillKey))}`;
    expect(await s.cache.redis.ttl(redisKey)).toBeGreaterThanOrEqual(59);
    expect(await s.cache.redis.ttl(redisKey)).toBeLessThanOrEqual(65);
    await s.cache.redis.pexpire(redisKey, 1);
    const end = Date.now() + 5000;
    while (await s.cache.redis.exists(redisKey)) {
      if (Date.now() > end) throw new Error("Redis TTL failed");
      await new Promise((r) => setTimeout(r, 10));
    }
    expect(
      await s.cache.read(fillKey, async () => ({ title: "expired-reloaded" })),
    ).toEqual({ title: "expired-reloaded" });
    s.cache.redis.disconnect();
    expect(
      (await s.cache.read({ offline: true }, () => s.catalog.publicList({})))
        .items.length,
    ).toBeGreaterThan(0);
    expect(
      (await cache.get()).values.find((v) => v.labels.result === "failure")
        ?.value,
    ).toBeGreaterThan(0);
  });
  it("BE-AT-15/16: real broker publisher confirms and consumer redelivery deduplicate durable business jobs", async () => {
    await worker.messaging.connect();
    expect(worker.messaging.ready).toBe(true);
    const { c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    const o = await s.db.one(
      "SELECT * FROM outbox_events WHERE aggregate_id=$1 AND event_type='BookingConfirmed'",
      [b.id],
    );
    const envelope = {
      event_id: o.id,
      event_type: o.event_type,
      schema_version: 1,
      aggregate_id: b.id,
      payload: {},
      correlation_id: o.correlation_id,
      occurred_at: o.created_at,
    };
    await worker.messaging.confirmed(
      "ticketflow.events",
      "BookingConfirmed",
      Buffer.from(JSON.stringify(envelope)),
    );
    await worker.messaging.confirmed(
      "ticketflow.events",
      "BookingConfirmed",
      Buffer.from(JSON.stringify(envelope)),
    );
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      if (
        (
          await s.db.one(
            "SELECT count(*)::int n FROM notification_jobs WHERE booking_id=$1",
            [b.id],
          )
        ).n === 1
      )
        break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM notification_jobs WHERE booking_id=$1",
          [b.id],
        )
      ).n,
    ).toBe(1);
    await worker.messaging.close();
    const b2 = await reserve(c);
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND published_at IS NULL",
          [b2.id],
        )
      ).n,
    ).toBe(1);
    await Promise.all([
      s.reservations.expire(b2.id),
      worker.s.reservations.expire(b2.id),
    ]);
  });
  it("BE-AT-17: durable cancellation blocks capture and releases/refunds affected bookings in sweep", async () => {
    const { e, c } = await fixture(),
      hold = await reserve(c),
      paid = await reserve(c);
    await capture(paid);
    await s.catalog.transition(organizer.id, e.id, "CANCELED");
    await s.payments.cancelSweep();
    await expect(reserve(c)).rejects.toThrow("EVENT_NOT_ON_SALE");
    expect((await s.reservations.detail(customer.id, hold.id)).state).toBe(
      "CANCELED",
    );
    const r = await s.db.one(
      "SELECT * FROM refunds WHERE booking_id=$1 AND reason='event_canceled'",
      [paid.id],
    );
    expect(r).toBeDefined();
    await s.payments.executeRefund(r.id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
  });
  it("BE-AT-18: reports aggregate financial facts without multiplying tickets; no counter drift", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c, 3);
    await capture(b);
    let report = await s.reporting.sales(organizer.id, e.id);
    expect(report.captured_minor).toBe(4500);
    expect(report.ticket_count).toBe(3);
    const r = await s.payments.customerRefund(customer.id, b.id, randomUUID());
    await s.payments.executeRefund(r.id);
    report = await s.reporting.sales(organizer.id, e.id);
    expect(report.refunded_minor).toBe(4500);
    expect(report.net_collected_minor).toBe(0);
    matches("Sales", report);
    expect(await s.reporting.drift()).toEqual([]);
    expect(
      (
        await auth(
          agent().get(`/api/v1/organizer/events/${e.id}/reports/sales`),
          organizerToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (await auth(agent().get("/api/v1/admin/operations/drift"), adminToken))
        .body.items,
    ).toEqual([]);
  });
  it("BE-AT-19: exact Origin, HttpOnly cookie, concurrent rotation reuse revokes family; current roles", async () => {
    expect(
      (
        await agent()
          .post("/api/v1/auth/refresh")
          .set("Origin", "null")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await agent()
          .post("/api/v1/auth/refresh")
          .set("Origin", origin)
          .set("Sec-Fetch-Site", "cross-site")
          .send({})
      ).status,
    ).toBe(403);
    expect(
      (
        await agent().post("/api/v1/auth/login").send({
          email: "customer@ticketflow.local",
          password: process.env.SEED_PASSWORD,
        })
      ).status,
    ).toBe(403);
    const login = await agent()
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        email: "customer@ticketflow.local",
        password: process.env.SEED_PASSWORD,
      });
    const cookie = login.headers["set-cookie"][0];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(cookie).toContain("SameSite=Lax");
    expect(login.body.refresh).toBeUndefined();
    const results = await Promise.all(
      [1, 2].map(() =>
        agent()
          .post("/api/v1/auth/refresh")
          .set("Origin", origin)
          .set("Cookie", cookie.split(";")[0])
          .send({}),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const fresh = results.find((r) => r.status === 200)!.headers[
      "set-cookie"
    ][0];
    expect(
      (
        await agent()
          .post("/api/v1/auth/refresh")
          .set("Origin", origin)
          .set("Cookie", fresh.split(";")[0])
          .send({})
      ).status,
    ).toBe(401);
    const logoutLogin = await agent()
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({
        email: "customer@ticketflow.local",
        password: process.env.SEED_PASSWORD,
      });
    const logoutCookie = logoutLogin.headers["set-cookie"][0].split(";")[0];
    const loggedOut = await agent()
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .set("Cookie", logoutCookie)
      .send({});
    expect(loggedOut.status).toBe(200);
    expect(loggedOut.headers["set-cookie"][0]).toContain("Path=/api/v1/auth");
    expect(
      (
        await agent()
          .post("/api/v1/auth/refresh")
          .set("Origin", origin)
          .set("Cookie", logoutCookie)
          .send({})
      ).status,
    ).toBe(401);
    expect(
      (await auth(agent().get("/api/v1/me"), logoutLogin.body.access_token))
        .status,
    ).toBe(200);
    await s.identity.organizerRole(admin.id, other.id, false);
    expect(
      (await auth(agent().get("/api/v1/organizer/events"), otherToken)).status,
    ).toBe(403);
    await s.identity.organizerRole(admin.id, other.id, true);
  });
  it("BE-AT-20/21: durable tickets survive new DB pools and QR/mail jobs do not gate purchase retrieval", async () => {
    const { c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    expect(
      (await worker.s.ticketing.list(customer.id, b.id)).items,
    ).toHaveLength(1);
    await s.db.rows(
      "INSERT INTO notification_jobs(business_key,booking_id,kind) VALUES($1,$2,'confirmation') ON CONFLICT DO NOTHING",
      ["test:" + b.id, b.id],
    );
    const job = await s.db.one(
      "SELECT id FROM notification_jobs WHERE business_key=$1",
      ["test:" + b.id],
    );
    await worker.notifications.process(job.id);
    const t = (await s.ticketing.list(customer.id, b.id)).items[0];
    expect(t.artifact_status).toBe("READY");
    expect(t.qr_svg).toContain("<svg");
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "CONFIRMED",
    );
  });
  it("BE-AT-22: API-only owned simulator flow is atomic, idempotent, private and asynchronous", async () => {
    const { c } = await fixture();
    const booked = await command("/bookings", {
      category_id: c.id,
      quantity: 2,
    });
    expect(booked.status).toBe(201);
    const b = booked.body;
    expect(
      (
        await s.db.one(
          "SELECT correlation_id FROM outbox_events WHERE aggregate_id=$1 AND event_type='ReservationCreated'",
          [b.id],
        )
      ).correlation_id,
    ).toBe(booked.headers["x-request-id"]);
    const checkout = await command(`/bookings/${b.id}/checkout`);
    expect(checkout.body.status).toBe("ready");
    expect(checkout.body.checkout_url).toBe(
      origin + "/demo/checkout/" + checkout.body.attempt_id,
    );
    const path = "/api/v1/demo/checkout/" + checkout.body.attempt_id;
    expect((await auth(agent().get(path), otherToken)).status).toBe(404);
    const k = randomUUID();
    const done = await auth(agent().post(path + "/complete"))
      .set("Idempotency-Key", k)
      .send({ outcome: "success" });
    expect(done.status).toBe(200);
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "RESERVED",
    );
    expect(
      (
        await auth(agent().post(path + "/complete"))
          .set("Idempotency-Key", k)
          .send({ outcome: "success" })
      ).body,
    ).toEqual(done.body);
    expect(
      (
        await auth(agent().post(path + "/complete"))
          .set("Idempotency-Key", randomUUID())
          .send({ outcome: "decline" })
      ).status,
    ).toBe(409);
    await worker.inbox();
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "CONFIRMED",
    );
    expect(JSON.stringify((await auth(agent().get(path))).body)).not.toContain(
      config.SIMULATOR_SECRET,
    );
    matches("Reservation", b);
    matches("Checkout", checkout.body);
    matches(
      "Booking",
      (await auth(agent().get("/api/v1/bookings/" + b.id))).body,
    );
    for (const t of (
      await auth(agent().get("/api/v1/bookings/" + b.id + "/tickets"))
    ).body.items)
      matches("Ticket", t);
  });
  it("BE-AT-12/17: verified terminal refund failure retains sold stock and canceled tickets stay blocked", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    await s.catalog.transition(organizer.id, e.id, "CANCELED");
    await s.payments.cancelSweep();
    const r = await s.db.one("SELECT * FROM refunds WHERE booking_id=$1", [
      b.id,
    ]);
    await s.db.rows(
      "INSERT INTO simulator_operations(operation_key,kind,result) VALUES($1,'fault',$2)",
      ["fault:" + r.operation_key, JSON.stringify({ fault: "refund_failure" })],
    );
    await s.payments.executeRefund(r.id);
    expect(
      (await s.db.one("SELECT state FROM refunds WHERE id=$1", [r.id])).state,
    ).toBe("FAILED");
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 1 });
    const t = (await s.ticketing.list(customer.id, b.id)).items[0];
    expect(t.state).toBe("SUSPENDED");
    await expect(
      s.ticketing.checkin(organizer.id, e.id, t.check_in_token),
    ).rejects.toThrow("TICKET_UNUSABLE");
  });
  it("BE-AT-06/16/21: two workers release an expired hold once; rendering and SMTP failures preserve tickets and retry", async () => {
    const { c } = await fixture(),
      expired = await reserve(c, 2);
    await s.db.rows(
      "UPDATE bookings SET expires_at=clock_timestamp() WHERE id=$1",
      [expired.id],
    );
    await Promise.all([
      s.reservations.expire(expired.id),
      worker.s.reservations.expire(expired.id),
    ]);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    const b = await reserve(c);
    await capture(b);
    await s.db.rows(
      "INSERT INTO notification_jobs(business_key,booking_id,kind) VALUES($1,$2,'confirmation')",
      ["failure:" + b.id, b.id],
    );
    const j = await s.db.one(
      "SELECT * FROM notification_jobs WHERE business_key=$1",
      ["failure:" + b.id],
    );
    const ticket = await s.db.one("SELECT * FROM tickets WHERE booking_id=$1", [
      b.id,
    ]);
    await s.db.rows("UPDATE tickets SET token_encrypted='broken' WHERE id=$1", [
      ticket.id,
    ]);
    await worker.notifications.process(j.id);
    expect(
      (
        await s.db.one("SELECT artifact_status FROM tickets WHERE id=$1", [
          ticket.id,
        ])
      ).artifact_status,
    ).toBe("FAILED");
    await s.db.rows("UPDATE tickets SET token_encrypted=$2 WHERE id=$1", [
      ticket.id,
      ticket.token_encrypted,
    ]);
    await s.db.rows(
      "UPDATE notification_jobs SET next_at=clock_timestamp() WHERE id=$1",
      [j.id],
    );
    const port = config.SMTP_PORT;
    config.SMTP_PORT = 1;
    const failing = new Notifications(s.db);
    config.SMTP_PORT = port;
    try {
      await failing.process(j.id);
    } finally {
      failing.close();
    }
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "CONFIRMED",
    );
    expect((await s.ticketing.list(customer.id, b.id)).items).toHaveLength(1);
    await s.db.rows(
      "UPDATE notification_jobs SET next_at=clock_timestamp() WHERE id=$1",
      [j.id],
    );
    await worker.notifications.process(j.id);
    expect(
      (
        await s.db.one("SELECT state FROM notification_jobs WHERE id=$1", [
          j.id,
        ])
      ).state,
    ).toBe("DONE");
  });
  it("BE-AT-13/17: customer refund and scan serialize; cancellation racing capture refunds every winner", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    const t = (await s.ticketing.list(customer.id, b.id)).items[0];
    const race = await Promise.allSettled([
      s.payments.customerRefund(customer.id, b.id, randomUUID()),
      s.ticketing.checkin(organizer.id, e.id, t.check_in_token),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const r = await s.db.one("SELECT id FROM refunds WHERE booking_id=$1", [
      b.id,
    ]);
    await s.payments.executeRefund(r.id);
    const f = await fixture(),
      b2 = await reserve(f.c);
    const co = await s.payments.checkout(customer.id, b2.id, randomUUID());
    const a = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      co.attempt_id,
    ]);
    await Promise.all([
      s.catalog.transition(organizer.id, f.e.id, "CANCELED"),
      s.payments.process(
        (s.payments.adapter as Simulator).evidence(a, "success"),
      ),
    ]);
    await s.payments.cancelSweep();
    for (const refund of await s.db.rows(
      "SELECT r.id FROM refunds r JOIN payment_attempts p ON p.id=r.payment_id WHERE p.booking_id=$1",
      [b2.id],
    ))
      await s.payments.executeRefund(refund.id);
    expect(await counts(f.c)).toEqual({ reserved_count: 0, sold_count: 0 });
  });
  it("BE-AT-15/16: crash after consumer commit redelivers once; exhausted job enters real DLQ and audited replay", async () => {
    const messaging = new Messaging(s.db),
      replacement = new Messaging(s.db);
    const until = async (predicate: () => Promise<boolean>) => {
      const end = Date.now() + 10000;
      while (Date.now() < end) {
        if (await predicate()) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error("Recovery condition timed out");
    };
    const { c } = await fixture(),
      b = await reserve(c),
      event_id = randomUUID();
    const envelope = {
      event_id,
      event_type: "BookingConfirmed",
      schema_version: 1,
      aggregate_id: b.id,
      correlation_id: randomUUID(),
      occurred_at: new Date().toISOString(),
      payload: {},
    };
    try {
      await messaging.connect();
      expect(messaging.ready).toBe(true);
      process.env.TEST_FAILPOINT = "consumer_after_commit";
      process.env.TEST_FAILPOINT_EVENT_ID = event_id;
      await messaging.confirmed(
        "ticketflow.events",
        "BookingConfirmed",
        Buffer.from(JSON.stringify(envelope)),
      );
      await until(async () => !messaging.ready);
      delete process.env.TEST_FAILPOINT;
      await replacement.connect();
      await until(
        async () =>
          (
            await s.db.one(
              "SELECT count(*)::int n FROM processed_messages WHERE event_id=$1",
              [event_id],
            )
          ).n === 1,
      );
      expect(
        (
          await s.db.one(
            "SELECT count(*)::int n FROM notification_jobs WHERE booking_id=$1",
            [b.id],
          )
        ).n,
      ).toBe(1);
      const failed = { ...envelope, event_id: randomUUID() };
      process.env.TEST_FAILPOINT = "consumer_transaction";
      process.env.TEST_FAILPOINT_EVENT_ID = failed.event_id;
      await replacement.confirmed(
        "ticketflow.events",
        "BookingConfirmed",
        Buffer.from(JSON.stringify(failed)),
        { headers: { "x-attempt": 5 } },
      );
      await until(
        async () =>
          (
            await s.db.one(
              "SELECT count(*)::int n FROM dead_letters WHERE event_id=$1",
              [failed.event_id],
            )
          ).n === 1,
      );
      delete process.env.TEST_FAILPOINT;
      const dead = await s.db.one(
        "SELECT id FROM dead_letters WHERE event_id=$1",
        [failed.event_id],
      );
      expect(
        (
          await auth(
            agent().post(
              "/api/v1/admin/operations/dead-letters/" + dead.id + "/retry",
            ),
          ).send({})
        ).status,
      ).toBe(403);
      expect(
        (
          await auth(
            agent().post(
              "/api/v1/admin/operations/dead-letters/" + dead.id + "/retry",
            ),
            adminToken,
          ).send({})
        ).status,
      ).toBe(200);
      await until(async () => {
        await replacement.publish();
        return (
          (
            await s.db.one(
              "SELECT count(*)::int n FROM processed_messages WHERE event_id=$1",
              [failed.event_id],
            )
          ).n === 1
        );
      });
      expect(
        (
          await s.db.one(
            "SELECT count(*)::int n FROM audit_logs WHERE resource_id=$1 AND action='Replay:dead-letters'",
            [dead.id],
          )
        ).n,
      ).toBe(1);
      expect(
        (await replacement.channel!.checkQueue("ticketflow.dead")).messageCount,
      ).toBeGreaterThan(0);
    } finally {
      delete process.env.TEST_FAILPOINT;
      delete process.env.TEST_FAILPOINT_EVENT_ID;
      await messaging.close();
      await replacement.close();
    }
  });
  it("BE-AT-15: concurrent confirms distinguish an unroutable message from a routable publication", async () => {
    const messaging = new Messaging(s.db);
    try {
      await messaging.connect();
      await messaging.channel!.assertExchange("ticketflow.unrouted", "direct", {
        durable: true,
      });
      const envelope = {
        event_id: randomUUID(),
        event_type: "CatalogChanged",
        schema_version: 1,
        occurred_at: new Date().toISOString(),
        aggregate_id: randomUUID(),
        correlation_id: randomUUID(),
        payload: {},
      };
      const results = await Promise.allSettled([
        messaging.confirmed(
          "ticketflow.unrouted",
          "missing",
          Buffer.from(JSON.stringify(envelope)),
        ),
        messaging.confirmed(
          "ticketflow.events",
          "CatalogChanged",
          Buffer.from(JSON.stringify({ ...envelope, event_id: randomUUID() })),
        ),
      ]);
      expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled"]);
    } finally {
      await messaging.close();
    }
  });
  it("BE-AT-09/10/18: compensating an older extra capture never becomes the target of the purchase refund", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c);
    const first = await s.payments.checkout(customer.id, b.id, randomUUID());
    const old = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      first.attempt_id,
    ]);
    const sim = s.payments.adapter as Simulator;
    await s.payments.process(sim.evidence(old, "decline"));
    const second = await s.payments.checkout(customer.id, b.id, randomUUID());
    const winner = await s.db.one(
      "SELECT * FROM payment_attempts WHERE id=$1",
      [second.attempt_id],
    );
    await s.payments.process(sim.evidence(winner, "success"));
    await s.payments.process(sim.evidence(old, "success", randomUUID()));
    const compensation = await s.db.one(
      "SELECT * FROM refunds WHERE payment_id=$1 AND reason='extra_payment'",
      [old.id],
    );
    expect(compensation.booking_id).toBeNull();
    await s.payments.executeRefund(compensation.id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 1 });
    const normal = await s.payments.customerRefund(
      customer.id,
      b.id,
      randomUUID(),
    );
    expect(
      (
        await s.db.one("SELECT payment_id FROM refunds WHERE id=$1", [
          normal.id,
        ])
      ).payment_id,
    ).toBe(winner.id);
    await s.payments.executeRefund(normal.id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    expect(
      (await s.reporting.sales(organizer.id, e.id)).net_collected_minor,
    ).toBe(0);
  });
  it("BE-AT-05: a committed business rejection remains the same logical result after inventory changes", async () => {
    const { c } = await fixture(1),
      b = await reserve(c),
      key = randomUUID();
    await expect(
      s.reservations.reserve(customer.id, key, {
        category_id: c.id,
        quantity: 1,
      }),
    ).rejects.toThrow("INVENTORY_UNAVAILABLE");
    await s.db.rows(
      "UPDATE bookings SET expires_at=clock_timestamp() WHERE id=$1",
      [b.id],
    );
    await s.reservations.expire(b.id);
    await expect(
      s.reservations.reserve(customer.id, key, {
        category_id: c.id,
        quantity: 1,
      }),
    ).rejects.toThrow("INVENTORY_UNAVAILABLE");
    expect((await reserve(c)).state).toBe("RESERVED");
  });
  it("BE-AT-11/12/17: old uncertain operations are not retried; repeated failed refund evidence cannot revert cancellation recovery", async () => {
    const { e, c } = await fixture(),
      b = await reserve(c);
    await capture(b);
    const r = await s.payments.customerRefund(customer.id, b.id, randomUUID());
    const original = await s.db.one("SELECT * FROM refunds WHERE id=$1", [
      r.id,
    ]);
    await s.db.rows(
      "INSERT INTO simulator_operations(operation_key,kind,result) VALUES($1,'fault',$2)",
      [
        "fault:" + original.operation_key,
        JSON.stringify({ fault: "refund_failure" }),
      ],
    );
    await s.payments.executeRefund(r.id);
    await s.catalog.transition(organizer.id, e.id, "CANCELED");
    await s.payments.cancelSweep();
    const newer = await s.db.one(
      "SELECT * FROM refunds WHERE booking_id=$1 AND reason='event_canceled'",
      [b.id],
    );
    const p = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      original.payment_id,
    ]);
    const oldFailed = await s.db.one("SELECT * FROM refunds WHERE id=$1", [
      r.id,
    ]);
    await s.payments.process({
      event_id: randomUUID(),
      attempt_id: p.id,
      kind: "refund_failure",
      payment_id: p.provider_payment_id,
      amount_minor: p.amount_minor,
      currency: p.currency,
      refund_id: oldFailed.provider_refund_id,
      operation_id: r.id,
    });
    expect((await s.reservations.detail(customer.id, b.id)).state).toBe(
      "REFUND_PENDING",
    );
    await s.payments.executeRefund(newer.id);
    expect(await counts(c)).toEqual({ reserved_count: 0, sold_count: 0 });
    const f = await fixture(),
      hold = await reserve(f.c);
    const uncertain = await s.db.one(
      "INSERT INTO payment_attempts(booking_id,provider,operation_key,amount_minor,currency,created_at,reconciliation_required) VALUES($1,'simulator',$2,$3,'USD',clock_timestamp()-interval '24 hours',true) RETURNING *",
      [hold.id, randomUUID(), hold.total_minor],
    );
    await s.payments.ensureCheckout(uncertain.id);
    expect(
      (
        await s.db.one(
          "SELECT manual_resolution FROM payment_attempts WHERE id=$1",
          [uncertain.id],
        )
      ).manual_resolution,
    ).toBe(true);
    expect(
      await s.db.one(
        "SELECT * FROM simulator_operations WHERE operation_key=$1",
        [uncertain.operation_key],
      ),
    ).toBeUndefined();
  });
  it("BE-AT-09/11: nonterminal card failure keeps one unresolved attempt; older failure cannot reopen a closed attempt", async () => {
    const { c } = await fixture(),
      b = await reserve(c),
      co = await s.payments.checkout(customer.id, b.id, randomUUID()),
      p = await s.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
        co.attempt_id,
      ]);
    const sim = s.payments.adapter as Simulator;
    await s.payments.process({
      ...sim.evidence(p, "decline"),
      terminal: false,
    });
    const retry = await s.payments.checkout(customer.id, b.id, randomUUID());
    expect(retry.attempt_id).toBe(p.id);
    expect(
      (await s.db.one("SELECT state FROM payment_attempts WHERE id=$1", [p.id]))
        .state,
    ).toBe("PENDING");
    await s.payments.process({
      ...sim.evidence(p, "decline", randomUUID()),
      terminal: true,
    });
    await s.payments.process({
      ...sim.evidence(p, "decline", randomUUID()),
      terminal: false,
    });
    expect(
      (await s.db.one("SELECT state FROM payment_attempts WHERE id=$1", [p.id]))
        .state,
    ).toBe("FAILED");
  });
  it("BE-AT-19: logout racing refresh revokes every token in the family", async () => {
    const login = await s.identity.login(
      "customer@ticketflow.local",
      process.env.SEED_PASSWORD!,
    );
    const result = await Promise.allSettled([
      s.identity.refresh(login.refresh),
      s.identity.logout(login.refresh),
    ]);
    expect(result[1].status).toBe("fulfilled");
    if (result[0].status === "fulfilled")
      await expect(s.identity.refresh(result[0].value.refresh)).rejects.toThrow(
        "REFRESH_REUSE_OR_EXPIRED",
      );
    expect(
      (
        await s.db.one(
          "SELECT count(*)::int n FROM refresh_sessions WHERE family=(SELECT family FROM refresh_sessions WHERE token_hash=$1) AND revoked_at IS NULL",
          [hash(login.refresh)],
        )
      ).n,
    ).toBe(0);
  });
  it("BE-AT-19: process limiter remains active and production rejects simulator/live-key configuration", async () => {
    const malformed = await agent()
      .post("/api/v1/auth/login")
      .set("Content-Type", "application/json")
      .send("{");
    expect(malformed.status).toBe(400);
    matches("Error", malformed.body);
    const large = await agent()
      .post("/api/v1/auth/login")
      .send({ email: "x".repeat(70000) });
    expect(large.status).toBe(413);
    matches("Error", large.body);
    expect(() =>
      execFileSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "-e", 'import "./src/infra/config"'],
        { env: { ...process.env, APP_MODE: "production" }, stdio: "pipe" },
      ),
    ).toThrow();
    expect(() =>
      execFileSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "-e", 'import "./src/infra/config"'],
        {
          env: {
            ...process.env,
            STRIPE_SECRET_KEY: "sk_live_rejected_test_fixture",
          },
          stdio: "pipe",
        },
      ),
    ).toThrow();
    let blocked = 0;
    for (let batch = 0; batch < 51; batch++) {
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          agent()
            .post("/api/v1/auth/login")
            .set("Origin", origin)
            .send({ email: "invalid", password: "x" }),
        ),
      );
      blocked += results.filter((r) => r.status === 429).length;
    }
    expect(blocked).toBeGreaterThan(0);
  });
});
