import { Db } from "../infra/db";
import { assert } from "../infra/common";
export const salesSql = `
WITH captures AS (
  SELECT b.category_id,sum(p.amount_minor)::bigint amount FROM payment_attempts p
  JOIN bookings b ON b.id=p.booking_id WHERE b.event_id=$1 AND p.state='SUCCEEDED' GROUP BY b.category_id
), refunds_total AS (
  SELECT b.category_id,sum(r.amount_minor)::bigint amount FROM refunds r
  JOIN payment_attempts p ON p.id=r.payment_id JOIN bookings b ON b.id=p.booking_id
  WHERE b.event_id=$1 AND r.state='SUCCEEDED' GROUP BY b.category_id
), issued AS (
  SELECT b.category_id,count(*)::int ticket_count,
    count(*) FILTER(WHERE t.checked_in_at IS NOT NULL)::int checked_in_count
  FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE b.event_id=$1 GROUP BY b.category_id
), quantities AS (
  SELECT category_id,coalesce(sum(quantity) FILTER(WHERE state IN ('CONFIRMED','REFUND_PENDING')),0)::int confirmed_count,
    coalesce(sum(quantity) FILTER(WHERE state='REFUNDED'),0)::int refunded_count
  FROM bookings WHERE event_id=$1 GROUP BY category_id
)
SELECT c.id category_id,c.name,c.capacity,c.reserved_count,c.sold_count,
  coalesce(p.amount,0)::text captured_minor,coalesce(r.amount,0)::text refunded_minor,
  (coalesce(p.amount,0)-coalesce(r.amount,0))::text net_collected_minor,
  coalesce(t.ticket_count,0) ticket_count,coalesce(t.checked_in_count,0) checked_in_count,
  coalesce(q.confirmed_count,0) confirmed_count,coalesce(q.refunded_count,0) refunded_count
FROM ticket_categories c LEFT JOIN captures p ON p.category_id=c.id
LEFT JOIN refunds_total r ON r.category_id=c.id LEFT JOIN issued t ON t.category_id=c.id
LEFT JOIN quantities q ON q.category_id=c.id WHERE c.event_id=$1 ORDER BY c.id`;
export const dailySql = `SELECT date_trunc('day',p.captured_at AT TIME ZONE 'UTC')::date::text AS sale_day,sum(p.amount_minor)::text captured_minor FROM payment_attempts p JOIN bookings b ON b.id=p.booking_id WHERE b.event_id=$1 AND p.state='SUCCEEDED' GROUP BY 1 ORDER BY 1`;
export class Reporting {
  constructor(private db: Db) {}
  async sales(actor: string, id: string) {
    const e = await this.db.one(
      "SELECT currency FROM events WHERE id=$1 AND owner_id=$2",
      [id, actor],
    );
    assert(e, 404, "EVENT_NOT_FOUND");
    const rows = await this.db.rows(salesSql, [id]);
    const categories = rows.map((r) => ({
      ...r,
      captured_minor: Number(r.captured_minor),
      refunded_minor: Number(r.refunded_minor),
      net_collected_minor: Number(r.net_collected_minor),
    }));
    const sum = (key: string) =>
      categories.reduce((n, r) => n + Number(r[key]), 0);
    return {
      event_id: id,
      currency: e.currency,
      captured_minor: sum("captured_minor"),
      refunded_minor: sum("refunded_minor"),
      net_collected_minor: sum("net_collected_minor"),
      reserved_count: sum("reserved_count"),
      sold_count: sum("sold_count"),
      ticket_count: sum("ticket_count"),
      checked_in_count: sum("checked_in_count"),
      confirmed_count: sum("confirmed_count"),
      refunded_count: sum("refunded_count"),
      categories,
      daily_sales: (await this.db.rows(dailySql, [id])).map((r) => ({
        day: r.sale_day,
        captured_minor: Number(r.captured_minor),
      })),
    };
  }
  async drift() {
    return this.db.rows(
      "SELECT c.id,c.reserved_count,c.sold_count,coalesce(b.reserved,0)::int expected_reserved,coalesce(b.sold,0)::int expected_sold FROM ticket_categories c LEFT JOIN (SELECT category_id,sum(quantity) FILTER(WHERE state='RESERVED') reserved,sum(quantity) FILTER(WHERE state IN ('CONFIRMED','REFUND_PENDING')) sold FROM bookings GROUP BY category_id) b ON b.category_id=c.id WHERE c.reserved_count<>coalesce(b.reserved,0) OR c.sold_count<>coalesce(b.sold,0)",
    );
  }
}
