import { Db, Tx } from "../infra/db";
import { assert, command, outbox, failpoint } from "../infra/common";
import { config } from "../infra/config";
import { holdEligible } from "./policy";
export class Reservations {
  constructor(readonly db: Db) {}
  async locked(tx: Tx, id: string, owner?: string) {
    const ref = await this.db.one(
      "SELECT event_id FROM bookings WHERE id=$1",
      [id],
      tx,
    );
    assert(ref, 404, "BOOKING_NOT_FOUND");
    const event = await this.db.one(
      "SELECT * FROM events WHERE id=$1 FOR UPDATE",
      [ref.event_id],
      tx,
    );
    const booking = await this.db.one(
      "SELECT * FROM bookings WHERE id=$1 FOR UPDATE",
      [id],
      tx,
    );
    assert(
      booking && (!owner || booking.customer_id === owner),
      404,
      "BOOKING_NOT_FOUND",
    );
    const category = await this.db.one(
      "SELECT * FROM ticket_categories WHERE id=$1 FOR UPDATE",
      [booking.category_id],
      tx,
    );
    const { now } = await this.db.one(
      "SELECT clock_timestamp() AS now",
      [],
      tx,
    );
    return { booking, event, category, now: now as Date };
  }
  async reserve(
    actor: string,
    key: string,
    input: { category_id: string; quantity: number },
  ) {
    return command(this.db, actor, "reserve", key, input, async (tx) => {
      const ref = await this.db.one(
        "SELECT event_id FROM ticket_categories WHERE id=$1",
        [input.category_id],
        tx,
      );
      assert(ref, 404, "CATEGORY_NOT_FOUND");
      const event = await this.db.one(
        "SELECT *,clock_timestamp() AS now FROM events WHERE id=$1 FOR UPDATE",
        [ref.event_id],
        tx,
      );
      const { eligible } = await this.db.one(
        "SELECT state='PUBLISHED' AND sales_open_at<=clock_timestamp() AND clock_timestamp()<sales_close_at AS eligible FROM events WHERE id=$1",
        [event.id],
        tx,
      );
      assert(eligible, 409, "EVENT_NOT_ON_SALE");
      const category = await this.db.one(
        "UPDATE ticket_categories SET reserved_count=reserved_count+$2 WHERE id=$1 AND reserved_count+sold_count+$2<=capacity RETURNING *",
        [input.category_id, input.quantity],
        tx,
      );
      assert(category, 409, "INVENTORY_UNAVAILABLE");
      const booking = await this.db.one(
        "INSERT INTO bookings(customer_id,event_id,category_id,quantity,unit_price_minor,total_minor,currency,category_name,event_title,state,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'RESERVED',clock_timestamp()+$10*interval '1 second') RETURNING *,clock_timestamp() AS server_time",
        [
          actor,
          event.id,
          category.id,
          input.quantity,
          category.price_minor,
          input.quantity * category.price_minor,
          category.currency,
          category.name,
          event.title,
          config.RESERVATION_SECONDS,
        ],
        tx,
      );
      await outbox(this.db, tx, "ReservationCreated", booking.id);
      failpoint("reserve");
      return this.safe(booking);
    });
  }
  safe(b: any) {
    return {
      id: b.id,
      state: b.state,
      quantity: b.quantity,
      unit_price_minor: b.unit_price_minor,
      total_minor: b.total_minor,
      currency: b.currency,
      expires_at: b.expires_at,
      server_time: b.server_time || new Date(),
      event: { id: b.event_id, title: b.event_title },
      category: { id: b.category_id, name: b.category_name },
    };
  }
  async release(tx: Tx, b: any, state: "EXPIRED" | "CANCELED") {
    if (b.state !== "RESERVED") return;
    await tx.query(
      "UPDATE ticket_categories SET reserved_count=reserved_count-$2 WHERE id=$1",
      [b.category_id, b.quantity],
    );
    await tx.query("UPDATE bookings SET state=$2 WHERE id=$1", [b.id, state]);
    await outbox(
      this.db,
      tx,
      state === "EXPIRED" ? "ReservationExpired" : "ReservationCanceled",
      b.id,
    );
  }
  async cancel(actor: string, id: string, key: string) {
    return command(this.db, actor, "cancel", key, { id }, async (tx) => {
      const { booking: b } = await this.locked(tx, id, actor);
      assert(
        ["RESERVED", "CANCELED", "EXPIRED"].includes(b.state),
        409,
        "BOOKING_NOT_CANCELABLE",
      );
      await this.release(tx, b, "CANCELED");
      return { id, state: b.state === "RESERVED" ? "CANCELED" : b.state };
    });
  }
  async expire(id: string) {
    await this.db.transaction(async (tx) => {
      const { booking: b, event, now } = await this.locked(tx, id);
      if (
        b.state === "RESERVED" &&
        (now >= b.expires_at || event.state === "CANCELED")
      )
        await this.release(
          tx,
          b,
          event.state === "CANCELED" ? "CANCELED" : "EXPIRED",
        );
    });
  }
  async detail(actor: string, id: string) {
    const b = await this.db.one(
      "SELECT b.*,clock_timestamp() server_time,e.state event_state,e.starts_at FROM bookings b JOIN events e ON e.id=b.event_id WHERE b.id=$1 AND b.customer_id=$2",
      [id, actor],
    );
    assert(b, 404, "BOOKING_NOT_FOUND");
    const payment = await this.db.one(
      "SELECT state,reconciliation_required FROM payment_attempts WHERE booking_id=$1 ORDER BY confirms_booking DESC,created_at DESC LIMIT 1",
      [id],
    );
    const refund = await this.db.one(
      "SELECT r.state,r.reason FROM refunds r JOIN payment_attempts p ON p.id=r.payment_id WHERE p.booking_id=$1 ORDER BY r.created_at DESC LIMIT 1",
      [id],
    );
    const artifacts = await this.db.one(
      "SELECT count(*)::int total,count(*) FILTER(WHERE artifact_status='READY')::int ready,count(*) FILTER(WHERE artifact_status='FAILED')::int failed,count(*) FILTER(WHERE state='CHECKED_IN')::int checked_in FROM tickets WHERE booking_id=$1",
      [id],
    );
    const hold = holdEligible(b.state, b.event_state, b.expires_at, {
      now: () => b.server_time,
    });
    const refundNeedsReview =
      refund?.state === "FAILED" &&
      ["customer", "event_canceled"].includes(refund.reason);
    const canRefund =
      !refundNeedsReview &&
      b.state === "CONFIRMED" &&
      artifacts.checked_in === 0 &&
      b.starts_at.getTime() - b.server_time.getTime() > 86400000 &&
      b.event_state === "PUBLISHED";
    const action = (allowed: boolean, reason: string) => ({
      allowed,
      reason: allowed ? null : reason,
    });
    return {
      ...this.safe(b),
      payment: payment || { state: null, reconciliation_required: false },
      refund: refund || null,
      tickets: {
        count: artifacts.total,
        artifact_status: artifacts.failed
          ? "FAILED"
          : artifacts.total > 0 && artifacts.ready === artifacts.total
            ? "READY"
            : "PENDING",
      },
      allowed_actions: {
        checkout: action(hold, "HOLD_INELIGIBLE"),
        cancel: action(b.state === "RESERVED", "NOT_RESERVED"),
        refund: action(
          canRefund,
          refundNeedsReview ? "REFUND_REQUIRES_REVIEW" : "REFUND_INELIGIBLE",
        ),
      },
    };
  }
}
