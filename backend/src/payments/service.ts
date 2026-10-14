import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Db, Tx } from "../infra/db";
import {
  assert,
  command,
  outbox,
  hash,
  failpoint,
  audit,
} from "../infra/common";
import { config } from "../infra/config";
import { Reservations } from "../reservations/service";
import { Ticketing } from "../ticketing/service";
import { correlationId } from "../infra/context";
import { PaymentProvider, Evidence, Simulator } from "./provider";
export const evidenceSchema = z
  .object({
    terminal: z.boolean().optional(),
    correlation_id: z.string().min(1).max(128).optional(),
    session_id: z.string().max(200).optional(),
    association_id: z.string().max(200).optional(),
    event_id: z.string().min(1).max(200),
    attempt_id: z.uuid(),
    kind: z.enum(["success", "failure", "refund_success", "refund_failure"]),
    payment_id: z.string().min(1).max(200),
    amount_minor: z.number().int().min(0).max(600000000),
    currency: z.string().regex(/^[A-Z]{3}$/),
    refund_id: z.string().max(200).optional(),
    operation_id: z.uuid().optional(),
  })
  .strict();
export class Payments {
  constructor(
    readonly db: Db,
    readonly reservations: Reservations,
    readonly adapter: PaymentProvider,
    readonly tickets: Ticketing,
  ) {}
  async checkout(actor: string, id: string, key: string) {
    const result = await command(
      this.db,
      actor,
      "checkout",
      key,
      { id },
      async (tx) => {
        const { booking: b, event } = await this.reservations.locked(
          tx,
          id,
          actor,
        );
        assert(
          b.state === "RESERVED" && event.state === "PUBLISHED",
          409,
          "HOLD_INELIGIBLE",
        );
        let a = await this.db.one(
          "SELECT * FROM payment_attempts WHERE booking_id=$1 AND state IN ('CREATED','PENDING') FOR UPDATE",
          [id],
          tx,
        );
        const { eligible } = await this.db.one(
          "SELECT clock_timestamp()<$1::timestamptz AS eligible",
          [b.expires_at],
          tx,
        );
        assert(eligible, 409, "HOLD_INELIGIBLE");
        if (!a) {
          const aid = randomUUID();
          a = await this.db.one(
            "INSERT INTO payment_attempts(id,booking_id,provider,operation_key,amount_minor,currency) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [
              aid,
              id,
              config.PAYMENT_PROVIDER,
              "checkout:" + aid,
              b.total_minor,
              b.currency,
            ],
            tx,
          );
        }
        return { attempt_id: a.id };
      },
    );
    await this.ensureCheckout(result.attempt_id);
    const a = await this.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      result.attempt_id,
    ]);
    return {
      attempt_id: a.id,
      status: a.checkout_url ? "ready" : "pending",
      checkout_url: a.checkout_url || null,
      mode: a.provider,
    };
  }
  async ensureCheckout(id: string) {
    const a = await this.db.one(
      "UPDATE payment_attempts SET lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND provider_session_id IS NULL AND state IN ('CREATED','PENDING') AND NOT manual_resolution AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING *",
      [id],
    );
    if (!a) return;
    if (Date.now() - a.created_at.getTime() > 23 * 3600000) {
      await this.db.rows(
        "UPDATE payment_attempts SET reconciliation_required=true,manual_resolution=true,lease_until=NULL WHERE id=$1",
        [id],
      );
      return;
    }
    try {
      const result = await this.adapter.checkout(a);
      failpoint("checkout_remote");
      await this.db.rows(
        "UPDATE payment_attempts SET provider_session_id=$2,checkout_url=$3,state=CASE WHEN state='CREATED' THEN 'PENDING' ELSE state END,reconciliation_required=false,lease_until=NULL,updated_at=clock_timestamp() WHERE id=$1",
        [id, result.session_id, result.url],
      );
    } catch {
      await this.db.rows(
        "UPDATE payment_attempts SET reconciliation_required=true,lease_until=clock_timestamp()+interval '5 seconds' WHERE id=$1",
        [id],
      );
    }
  }
  async accept(
    raw: Buffer,
    signature: string,
    adapter: PaymentProvider = this.adapter,
    delaySeconds = 0,
  ) {
    const evidence = adapter.verify(raw, signature);
    if (evidence) evidenceSchema.parse(evidence);
    const event_id = evidence?.event_id || `ignored:${hash(raw.toString())}`;
    await this.db.rows(
      "INSERT INTO webhook_events(provider,event_id,payload,state,next_at) VALUES($1,$2,$3,$4,clock_timestamp()+$5*interval '1 second') ON CONFLICT(provider,event_id) DO NOTHING",
      [
        config.PAYMENT_PROVIDER,
        event_id,
        JSON.stringify(
          evidence ? { ...evidence, correlation_id: correlationId() } : {},
        ),
        evidence ? "PENDING" : "DONE",
        delaySeconds,
      ],
    );
    return { accepted: true };
  }
  async demo(actor: string, id: string) {
    assert(
      config.APP_MODE !== "production" && this.adapter instanceof Simulator,
      404,
      "NOT_FOUND",
    );
    const row = await this.db.one(
      "SELECT s.id,s.outcome,a.booking_id,a.amount_minor,a.currency FROM demo_sessions s JOIN payment_attempts a ON a.id=s.attempt_id JOIN bookings b ON b.id=a.booking_id WHERE s.id=$1 AND b.customer_id=$2",
      [id, actor],
    );
    assert(row, 404, "CHECKOUT_SESSION_NOT_FOUND");
    return {
      id: row.id,
      booking_id: row.booking_id,
      amount_minor: row.amount_minor,
      currency: row.currency,
      status: row.outcome ? "completed" : "open",
      allowed_outcomes: row.outcome ? [] : ["success", "decline"],
    };
  }
  async completeDemo(
    actor: string,
    id: string,
    key: string,
    outcome: "success" | "decline",
  ) {
    assert(
      config.APP_MODE !== "production" && this.adapter instanceof Simulator,
      404,
      "NOT_FOUND",
    );
    const sim = this.adapter;
    return command(
      this.db,
      actor,
      "demo_complete",
      key,
      { id, outcome },
      async (tx) => {
        const row = await this.db.one(
          "SELECT s.*,a.amount_minor,a.currency,a.id attempt_id FROM demo_sessions s JOIN payment_attempts a ON a.id=s.attempt_id JOIN bookings b ON b.id=a.booking_id WHERE s.id=$1 AND b.customer_id=$2 FOR UPDATE OF s",
          [id, actor],
          tx,
        );
        assert(row, 404, "CHECKOUT_SESSION_NOT_FOUND");
        assert(
          !row.outcome || row.outcome === outcome,
          409,
          "CHECKOUT_OUTCOME_CONFLICT",
        );
        if (!row.outcome) {
          const evidence = sim.evidence(
            {
              id: row.attempt_id,
              amount_minor: row.amount_minor,
              currency: row.currency,
            },
            outcome,
          );
          const raw = Buffer.from(JSON.stringify(evidence));
          const verified = sim.verify(raw, sim.sign(raw));
          evidenceSchema.parse(verified);
          await tx.query(
            "INSERT INTO webhook_events(provider,event_id,payload) VALUES('simulator',$1,$2) ON CONFLICT DO NOTHING",
            [
              verified.event_id,
              JSON.stringify({ ...verified, correlation_id: correlationId() }),
            ],
          );
          await tx.query(
            "UPDATE demo_sessions SET outcome=$2,completion_key=$3,completed_at=clock_timestamp() WHERE id=$1",
            [id, outcome, key],
          );
        }
        return { id, status: "completed", outcome };
      },
    );
  }
  async requestRefund(
    tx: Tx,
    p: any,
    b: any,
    reason: string,
    confirmed: boolean,
  ) {
    const existing = await this.db.one(
      "SELECT * FROM refunds WHERE payment_id=$1 AND reason=$2",
      [p.id, reason],
      tx,
    );
    if (existing) {
      assert(
        !(reason === "customer" && existing.state === "FAILED"),
        409,
        "REFUND_REQUIRES_REVIEW",
      );
      return existing;
    }
    const id = randomUUID();
    const r = await this.db.one(
      "INSERT INTO refunds(id,payment_id,booking_id,operation_key,amount_minor,reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
      [
        id,
        p.id,
        confirmed ? b.id : null,
        "refund:" + id,
        p.amount_minor,
        reason,
      ],
      tx,
    );
    if (confirmed) {
      await tx.query("UPDATE bookings SET state='REFUND_PENDING' WHERE id=$1", [
        b.id,
      ]);
      await this.tickets.suspend(tx, b.id);
    }
    await outbox(this.db, tx, "RefundRequested", b.id, { refund_id: id });
    return r;
  }
  async customerRefund(actor: string, id: string, key: string) {
    return command(this.db, actor, "refund", key, { id }, async (tx) => {
      const { booking: b, event } = await this.reservations.locked(
        tx,
        id,
        actor,
      );
      assert(
        b.state === "CONFIRMED" && event.state === "PUBLISHED",
        409,
        "REFUND_INELIGIBLE",
      );
      assert(
        (await this.tickets.checkedIn(tx, id)) === 0,
        409,
        "TICKET_ALREADY_USED",
      );
      const p = await this.db.one(
        "SELECT * FROM payment_attempts WHERE booking_id=$1 AND state='SUCCEEDED' AND confirms_booking FOR UPDATE",
        [id],
        tx,
      );
      assert(p, 409, "PAYMENT_NOT_CAPTURED");
      const { eligible } = await this.db.one(
        "SELECT clock_timestamp()<$1::timestamptz-interval '24 hours' AS eligible",
        [event.starts_at],
        tx,
      );
      assert(eligible, 409, "REFUND_INELIGIBLE");
      const r = await this.requestRefund(tx, p, b, "customer", true);
      return { id: r.id, state: r.state, reason: r.reason };
    });
  }
  async process(e: Evidence) {
    return this.db.transaction(async (tx) => {
      const ref = await this.db.one(
        "SELECT booking_id FROM payment_attempts WHERE id=$1",
        [e.attempt_id],
        tx,
      );
      assert(ref, 409, "PAYMENT_ASSOCIATION_MISMATCH");
      const { booking: b, event } = await this.reservations.locked(
        tx,
        ref.booking_id,
      );
      const p = await this.db.one(
        "SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE",
        [e.attempt_id],
        tx,
      );
      if (
        (e.session_id &&
          p.provider_session_id &&
          e.session_id !== p.provider_session_id) ||
        (e.association_id !== undefined && e.association_id !== p.id) ||
        e.amount_minor !== p.amount_minor ||
        e.currency !== p.currency ||
        (p.provider_payment_id && p.provider_payment_id !== e.payment_id)
      ) {
        await tx.query(
          "UPDATE payment_attempts SET reconciliation_required=true,manual_resolution=true WHERE id=$1",
          [p.id],
        );
        await audit(this.db, tx, null, "PaymentEvidenceMismatch", p.id);
        return { mismatch: true };
      }
      if (e.kind.startsWith("refund_")) {
        const r = await this.db.one(
          "SELECT * FROM refunds WHERE payment_id=$1 AND (id=$2::uuid OR provider_refund_id=$3) FOR UPDATE",
          [p.id, e.operation_id || null, e.refund_id || null],
          tx,
        );
        assert(r && e.refund_id, 409, "REFUND_ASSOCIATION_MISMATCH");
        await this.finishRefund(
          tx,
          r,
          b,
          event,
          e.kind === "refund_success" ? "succeeded" : "failed",
          e.refund_id,
        );
        return {};
      }
      if (e.kind === "failure") {
        if (e.terminal === false) {
          if (["CREATED", "PENDING"].includes(p.state))
            await tx.query(
              "UPDATE payment_attempts SET state='PENDING' WHERE id=$1",
              [p.id],
            );
          return {};
        }
        if (p.state !== "SUCCEEDED")
          await tx.query(
            "UPDATE payment_attempts SET state='FAILED',reconciliation_required=false WHERE id=$1",
            [p.id],
          );
        return {};
      }
      if (p.state === "SUCCEEDED") return {};
      await tx.query(
        "UPDATE payment_attempts SET state='SUCCEEDED',provider_payment_id=$2,provider_session_id=coalesce(provider_session_id,$3),captured_at=clock_timestamp(),reconciliation_required=false,updated_at=clock_timestamp() WHERE id=$1",
        [p.id, e.payment_id, e.session_id || null],
      );
      const { eligible } = await this.db.one(
        "SELECT $1::text='RESERVED' AND $2::text='PUBLISHED' AND clock_timestamp()<$3::timestamptz AS eligible",
        [b.state, event.state, b.expires_at],
        tx,
      );
      if (eligible) {
        await tx.query(
          "UPDATE payment_attempts SET confirms_booking=true WHERE id=$1",
          [p.id],
        );
        await tx.query(
          "UPDATE ticket_categories SET reserved_count=reserved_count-$2,sold_count=sold_count+$2 WHERE id=$1",
          [b.category_id, b.quantity],
        );
        await tx.query("UPDATE bookings SET state='CONFIRMED' WHERE id=$1", [
          b.id,
        ]);
        await this.tickets.issue(tx, b);
        await outbox(this.db, tx, "BookingConfirmed", b.id);
        failpoint("confirm");
      } else {
        await this.reservations.release(
          tx,
          b,
          event.state === "CANCELED" ? "CANCELED" : "EXPIRED",
        );
        await this.requestRefund(
          tx,
          { ...p, provider_payment_id: e.payment_id },
          b,
          ["CONFIRMED", "REFUND_PENDING", "REFUNDED"].includes(b.state)
            ? "extra_payment"
            : "late_payment",
          false,
        );
      }
      return {};
    });
  }
  async finishRefund(
    tx: Tx,
    r: any,
    b: any,
    event: any,
    status: "succeeded" | "failed" | "pending",
    providerId: string,
  ) {
    if (r.state === "SUCCEEDED") return;
    if (r.state === "FAILED" && status === "failed") return;
    await tx.query("UPDATE refunds SET provider_refund_id=$2 WHERE id=$1", [
      r.id,
      providerId,
    ]);
    if (status === "pending") {
      await tx.query(
        "UPDATE refunds SET state='PROCESSING',lease_until=NULL,next_at=clock_timestamp()+interval '30 seconds' WHERE id=$1",
        [r.id],
      );
      return;
    }
    await tx.query("UPDATE refunds SET state=$2,lease_until=NULL WHERE id=$1", [
      r.id,
      status === "succeeded" ? "SUCCEEDED" : "FAILED",
    ]);
    if (r.booking_id && b.state === "REFUND_PENDING") {
      if (status === "succeeded") {
        await tx.query(
          "UPDATE ticket_categories SET sold_count=sold_count-$2 WHERE id=$1",
          [b.category_id, b.quantity],
        );
        await tx.query("UPDATE bookings SET state='REFUNDED' WHERE id=$1", [
          b.id,
        ]);
        await this.tickets.void(tx, b.id);
        await outbox(this.db, tx, "RefundSucceeded", b.id);
      } else {
        await tx.query("UPDATE bookings SET state='CONFIRMED' WHERE id=$1", [
          b.id,
        ]);
        if (event.state === "PUBLISHED") await this.tickets.restore(tx, b.id);
        await audit(this.db, tx, null, "RefundFailed", r.id);
      }
    }
  }
  async executeRefund(id: string) {
    const r = await this.db.one(
      "UPDATE refunds SET state='PROCESSING',lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1 WHERE id=$1 AND state IN ('REQUESTED','PROCESSING') AND NOT manual_resolution AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING *",
      [id],
    );
    if (!r) return;
    const p = await this.db.one("SELECT * FROM payment_attempts WHERE id=$1", [
      r.payment_id,
    ]);
    try {
      let result = await this.adapter.retrieveRefund({
        ...r,
        currency: p.currency,
        provider_payment_id: p.provider_payment_id,
      });
      if (!result) {
        if (Date.now() - r.created_at.getTime() > 23 * 3600000) {
          await this.db.rows(
            "UPDATE refunds SET manual_resolution=true,lease_until=NULL WHERE id=$1",
            [r.id],
          );
          return;
        }
        result = await this.adapter.refund(r, p);
      }
      failpoint("refund_remote");
      await this.db.transaction(async (tx) => {
        const { booking: b, event } = await this.reservations.locked(
          tx,
          p.booking_id,
        );
        await tx.query(
          "SELECT id FROM payment_attempts WHERE id=$1 FOR UPDATE",
          [p.id],
        );
        const locked = await this.db.one(
          "SELECT * FROM refunds WHERE id=$1 FOR UPDATE",
          [r.id],
          tx,
        );
        await this.finishRefund(tx, locked, b, event, result.status, result.id);
      });
    } catch {
      await this.db.rows(
        "UPDATE refunds SET lease_until=NULL,next_at=clock_timestamp()+least(300,power(2,attempts)) * interval '1 second',manual_resolution=attempts>=5 WHERE id=$1",
        [id],
      );
    }
  }
  async cancelSweep() {
    const ids = await this.db.rows(
      "SELECT b.id FROM bookings b JOIN events e ON e.id=b.event_id WHERE e.state='CANCELED' AND (b.state='RESERVED' OR (b.state='CONFIRMED' AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.booking_id=b.id AND r.reason='event_canceled'))) ORDER BY b.id LIMIT 50",
    );
    for (const { id } of ids)
      await this.db.transaction(async (tx) => {
        const { booking: b } = await this.reservations.locked(tx, id);
        if (b.state === "RESERVED")
          await this.reservations.release(tx, b, "CANCELED");
        else if (b.state === "CONFIRMED") {
          const p = await this.db.one(
            "SELECT * FROM payment_attempts WHERE booking_id=$1 AND state='SUCCEEDED' AND confirms_booking FOR UPDATE",
            [id],
            tx,
          );
          if (p) await this.requestRefund(tx, p, b, "event_canceled", true);
        }
      });
  }
  async reconcile(stopping: () => boolean = () => false) {
    const attempts = await this.db.rows(
      "SELECT * FROM payment_attempts WHERE (state IN ('CREATED','PENDING') OR reconciliation_required) AND NOT manual_resolution ORDER BY created_at LIMIT 50",
    );
    for (const a of attempts) {
      if (stopping()) break;
      if (!a.provider_session_id) await this.ensureCheckout(a.id);
      else {
        try {
          const e = await this.adapter.retrieve(a);
          if (e)
            await this.db.rows(
              "INSERT INTO webhook_events(provider,event_id,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
              [a.provider, e.event_id, JSON.stringify(e)],
            );
        } catch {
          await this.db.rows(
            "UPDATE payment_attempts SET reconciliation_required=true WHERE id=$1",
            [a.id],
          );
        }
      }
    }
  }
  async closeExpiredSessions(stopping: () => boolean = () => false) {
    const attempts = await this.db.rows(
      "SELECT p.* FROM payment_attempts p JOIN bookings b ON b.id=p.booking_id WHERE b.state IN ('EXPIRED','CANCELED') AND p.state IN ('CREATED','PENDING') AND p.provider_session_id IS NOT NULL AND p.updated_at<clock_timestamp()-interval '30 seconds' LIMIT 20",
    );
    for (const a of attempts) {
      if (stopping()) break;
      try {
        await this.adapter.close(a);
        await this.db.rows(
          "UPDATE payment_attempts SET state=CASE WHEN state IN ('CREATED','PENDING') THEN 'CANCELED' ELSE state END,updated_at=clock_timestamp() WHERE id=$1",
          [a.id],
        );
      } catch {
        await this.db.rows(
          "UPDATE payment_attempts SET updated_at=clock_timestamp(),reconciliation_required=true WHERE id=$1",
          [a.id],
        );
      }
    }
  }
}
