import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { services } from "../src/infra/services";
import { seed, fixtureIds } from "./seed";
import { assert } from "../src/infra/common";
import { config } from "../src/infra/config";
const path = "artifacts/recovery-state.json",
  evidence = "artifacts/recovery-evidence.json";
async function main() {
  assert(
    config.APP_MODE === "test" &&
      config.DATABASE_URL.includes("ticketflow_test"),
    400,
    "ISOLATED_TEST_REQUIRED",
  );
  mkdirSync("artifacts", { recursive: true });
  const s = services();
  const phase = process.argv[2];
  let state: any =
    phase === "prepare" ? {} : JSON.parse(readFileSync(path, "utf8"));
  let access = "";
  const call = async (route: string, body?: unknown) => {
    const r = await fetch(
      (process.env.API_URL || "http://api:3000") + "/api/v1" + route,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Origin: config.FRONTEND_ORIGIN,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
          ...(access ? { Authorization: "Bearer " + access } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = (await r.json()) as any;
    assert(r.ok, 500, "API_FAILURE_" + r.status + "_" + data.code);
    return data;
  };
  const wait = async (fn: () => Promise<boolean>) => {
    const end = Date.now() + 60000;
    while (Date.now() < end) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("Recovery deadline exceeded");
  };
  try {
    if (phase === "prepare") {
      await seed(s.db);
      const owner = await s.db.one(
        "SELECT id FROM users WHERE email='organizer@ticketflow.local'",
      );
      const e = await s.catalog.saveEvent(owner.id, {
        title: "Recovery Fixture",
        description: "Broker/cache/container outage verification",
        category_label: "recovery",
        venue_id: fixtureIds.venue,
        starts_at: new Date(Date.now() + 72 * 3600000).toISOString(),
        ends_at: new Date(Date.now() + 76 * 3600000).toISOString(),
        sales_open_at: new Date(Date.now() - 3600000).toISOString(),
        sales_close_at: new Date(Date.now() + 71 * 3600000).toISOString(),
        timezone: "UTC",
        capacity: 100,
        currency: "USD",
      });
      const c = await s.catalog.saveCategory(owner.id, e.id, {
        name: "Recovery",
        capacity: 100,
        price_minor: 1700,
        currency: "USD",
      });
      await s.catalog.transition(owner.id, e.id, "PUBLISHED");
      state = { event_id: e.id, category_id: c.id };
    } else if (phase === "broker-down") {
      access = (
        await call("/auth/login", {
          email: "customer@ticketflow.local",
          password: process.env.SEED_PASSWORD,
        })
      ).access_token;
      const b = await call("/bookings", {
        category_id: state.category_id,
        quantity: 2,
      });
      state.booking_id = b.id;
      const c = await call("/bookings/" + b.id + "/checkout", {});
      state.attempt_id = c.attempt_id;
      await call("/demo/checkout/" + c.attempt_id + "/complete", {
        outcome: "success",
      });
      await wait(
        async () =>
          (await s.db.one("SELECT state FROM bookings WHERE id=$1", [b.id]))
            .state === "CONFIRMED",
      );
      assert(
        (
          await s.db.one(
            "SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND published_at IS NULL",
            [b.id],
          )
        ).n > 0,
        500,
        "OUTBOX_NOT_DURABLE",
      );
    } else if (phase === "broker-up") {
      await wait(
        async () =>
          (
            await s.db.one(
              "SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND published_at IS NULL",
              [state.booking_id],
            )
          ).n === 0,
      );
      await wait(
        async () =>
          (
            await s.db.one(
              "SELECT count(*)::int n FROM notification_jobs WHERE booking_id=$1 AND state='DONE'",
              [state.booking_id],
            )
          ).n === 1,
      );
    } else if (phase === "redis-down") {
      const events = await call("/events");
      assert(events.items.length > 0, 500, "CACHE_OUTAGE_NOT_TOLERATED");
      const b = await s.db.one("SELECT state FROM bookings WHERE id=$1", [
        state.booking_id,
      ]);
      assert(b.state === "CONFIRMED", 500, "BOOKING_CHANGED");
    } else if (phase === "before-restart") {
      state.before = await s.db.one(
        "SELECT b.id,b.state,p.operation_key,p.provider_payment_id,(SELECT count(*)::int FROM tickets WHERE booking_id=b.id) ticket_count FROM bookings b JOIN payment_attempts p ON p.booking_id=b.id WHERE b.id=$1",
        [state.booking_id],
      );
      await s.db.rows(
        "UPDATE notification_jobs SET state='PROCESSING',lease_until=clock_timestamp()-interval '1 second',next_at=clock_timestamp() WHERE booking_id=$1",
        [state.booking_id],
      );
    } else if (phase === "after-restart") {
      await wait(async () => {
        try {
          const r = await fetch(
            (process.env.API_URL || "http://api:3000") + "/health/ready",
            { signal: AbortSignal.timeout(3000) },
          );
          return r.ok;
        } catch {
          return false;
        }
      });
      const after = await s.db.one(
        "SELECT b.id,b.state,p.operation_key,p.provider_payment_id,(SELECT count(*)::int FROM tickets WHERE booking_id=b.id) ticket_count FROM bookings b JOIN payment_attempts p ON p.booking_id=b.id WHERE b.id=$1",
        [state.booking_id],
      );
      assert(
        JSON.stringify(after) === JSON.stringify(state.before),
        500,
        "PERSISTENCE_MISMATCH",
      );
      await wait(
        async () =>
          (
            await s.db.one(
              "SELECT count(*)::int n FROM notification_jobs WHERE booking_id=$1 AND state='DONE'",
              [state.booking_id],
            )
          ).n === 1,
      );
      assert((await s.reporting.drift()).length === 0, 500, "INVENTORY_DRIFT");
    } else throw new Error("Unknown recovery phase");
    writeFileSync(path, JSON.stringify(state, null, 2));
    const entries =
      phase === "prepare" ? [] : JSON.parse(readFileSync(evidence, "utf8"));
    entries.push({
      phase,
      observed_at: new Date().toISOString(),
      passed: true,
    });
    writeFileSync(evidence, JSON.stringify(entries, null, 2));
    console.log(JSON.stringify({ phase, passed: true }));
  } finally {
    await s.cache.close();
    await s.db.close();
  }
}
void main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
