import { createServer } from "node:http";
import { services } from "./infra/services";
import { Messaging } from "./infra/messaging";
import { Notifications } from "./notifications/service";
import { evidenceSchema } from "./payments/service";
import { backlog, age, failures, log, registry } from "./infra/metrics";
import { schemaReady } from "./infra/readiness";
import { assert } from "./infra/common";
import { requestContext } from "./infra/context";
import { StripeTest } from "./payments/provider";
export class Worker {
  readonly s = services();
  readonly messaging = new Messaging(this.s.db);
  readonly notifications = new Notifications(this.s.db);
  stopping = false;
  lastReconcile = 0;
  running = false;
  timer?: NodeJS.Timeout;
  async inbox() {
    const rows = await this.s.db.rows(
      "UPDATE webhook_events SET state='PROCESSING',attempts=attempts+1,lease_until=clock_timestamp()+interval '30 seconds' WHERE id IN (SELECT id FROM webhook_events WHERE state IN ('PENDING','PROCESSING') AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20) RETURNING *",
    );
    for (const row of rows) {
      try {
        const evidence = evidenceSchema.parse(row.payload);
        const result = await requestContext.run(
          { request_id: evidence.correlation_id || row.id },
          () => this.s.payments.process(evidence),
        );
        await this.s.db.rows(
          "UPDATE webhook_events SET state=$2,lease_until=NULL,error_code=$3 WHERE id=$1",
          [
            row.id,
            result.mismatch ? "DEAD" : "DONE",
            result.mismatch ? "EVIDENCE_MISMATCH" : null,
          ],
        );
      } catch {
        failures.inc({ kind: "webhook" });
        await this.s.db.rows(
          "UPDATE webhook_events SET state=CASE WHEN attempts>=5 THEN 'DEAD' ELSE 'PENDING' END,lease_until=NULL,next_at=clock_timestamp()+power(2,attempts)*interval '1 second',error_code='PROCESSING_FAILED' WHERE id=$1",
          [row.id],
        );
      }
    }
  }
  async tick() {
    if (this.running || this.stopping) return;
    this.running = true;
    try {
      const expired = await this.s.db.rows(
        "SELECT b.id FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.state='RESERVED' AND (b.expires_at<=clock_timestamp() OR e.state='CANCELED') ORDER BY b.expires_at LIMIT 100",
      );
      for (const b of expired) {
        if (this.stopping) break;
        await this.s.reservations.expire(b.id);
      }
      await this.inbox();
      await this.s.payments.cancelSweep();
      await this.s.payments.closeExpiredSessions(() => this.stopping);
      const refunds = await this.s.db.rows(
        "SELECT id FROM refunds WHERE state IN ('REQUESTED','PROCESSING') AND NOT manual_resolution AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) LIMIT 20",
      );
      for (const r of refunds) {
        if (this.stopping) break;
        await this.s.payments.executeRefund(r.id);
      }
      await this.messaging.connect();
      await this.messaging.publish();
      const jobs = await this.s.db.rows(
        "SELECT id FROM notification_jobs WHERE state IN ('PENDING','PROCESSING') AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) LIMIT 20",
      );
      for (const j of jobs) {
        if (this.stopping) break;
        await this.notifications.process(j.id);
      }
      if (Date.now() - this.lastReconcile > 300000) {
        await this.s.payments.reconcile(() => this.stopping);
        this.lastReconcile = Date.now();
      }
      const stats = await this.s.db.one(
        "SELECT count(*)::int n,coalesce(extract(epoch FROM clock_timestamp()-min(created_at)),0)::float age FROM outbox_events WHERE published_at IS NULL",
      );
      backlog.set({ kind: "outbox" }, stats.n);
      age.set({ kind: "outbox" }, stats.age);
      const lag = await this.s.db.one(
        "SELECT coalesce(extract(epoch FROM clock_timestamp()-min(expires_at)),0)::float age FROM bookings WHERE state='RESERVED' AND expires_at<clock_timestamp()",
      );
      age.set({ kind: "expiry" }, lag.age);
      for (const [kind, table, predicate] of [
        [
          "payments",
          "payment_attempts",
          "state IN ('CREATED','PENDING') OR reconciliation_required",
        ],
        ["refunds", "refunds", "state IN ('REQUESTED','PROCESSING')"],
        ["webhooks", "webhook_events", "state IN ('PENDING','PROCESSING')"],
      ]) {
        const stat = await this.s.db.one(
          `SELECT count(*)::int n,coalesce(extract(epoch FROM clock_timestamp()-min(created_at)),0)::float age FROM ${table} WHERE ${predicate}`,
        );
        backlog.set({ kind }, stat.n);
        age.set({ kind }, stat.age);
      }
    } catch {
      failures.inc({ kind: "worker_tick" });
      log("worker_tick_failed");
    } finally {
      this.running = false;
    }
  }
  start() {
    this.timer = setInterval(() => void this.tick(), 250);
    void this.tick();
  }
  async close() {
    this.stopping = true;
    await this.messaging.pause();
    if (this.timer) clearInterval(this.timer);
    const deadline = Date.now() + 30000;
    while (this.running && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    await this.messaging.close();
    this.notifications.close();
    await this.s.cache.close();
    await this.s.db.close();
  }
}
async function main() {
  const worker = new Worker();
  if (worker.s.payments.adapter instanceof StripeTest)
    await worker.s.payments.adapter.verifyAccount();
  worker.start();
  const server = createServer(async (req, res) => {
    if (req.url === "/metrics") {
      res.setHeader("Content-Type", registry.contentType);
      res.end(await registry.metrics());
      return;
    }
    if (req.url !== "/health/ready") {
      res.end("live");
      return;
    }
    try {
      assert(await schemaReady(worker.s.db), 503, "SCHEMA_UNAVAILABLE");
      const pending = await worker.s.db.one(
        "SELECT count(*)::int count,coalesce(extract(epoch FROM clock_timestamp()-min(created_at)),0)::float oldest_seconds FROM outbox_events WHERE published_at IS NULL",
      );
      res.writeHead(worker.messaging.ready ? 200 : 503, {
        "content-type": "application/json",
      });
      res.end(
        JSON.stringify({
          database: "up",
          broker: worker.messaging.ready ? "up" : "down",
          processing: !worker.stopping,
          outbox: pending,
        }),
      );
    } catch {
      res.writeHead(503);
      res.end("not ready");
    }
  }).listen(3001, "0.0.0.0");
  const close = async () => {
    server.close();
    await worker.close();
  };
  process.on("SIGTERM", () => void close());
  process.on("SIGINT", () => void close());
  log("worker_started");
}
if (require.main === module)
  void main().catch(() => {
    log("worker_start_failed");
    process.exitCode = 1;
  });
