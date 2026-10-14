import { mkdirSync, writeFileSync } from "node:fs";
import { Db } from "../src/infra/db";
import { salesSql } from "../src/reporting/service";
import { fixtureIds } from "./seed";
import { config } from "../src/infra/config";
import { assert } from "../src/infra/common";
async function main() {
  const db = new Db();
  try {
    assert(
      config.APP_MODE === "test" &&
        config.DATABASE_URL.includes("ticketflow_test"),
      400,
      "ISOLATED_ANALYSIS_REQUIRED",
    );
    const existing = await db.one(
      "SELECT count(*)::int n FROM events WHERE title LIKE 'SQL plan fixture %'",
    );
    if (existing.n === 0)
      await db.transaction(async (tx) => {
        await tx.query(
          "WITH inserted AS (INSERT INTO events(owner_id,venue_id,title,description,category_label,starts_at,ends_at,sales_open_at,sales_close_at,timezone,capacity,currency,state) SELECT v.owner_id,v.id,'SQL plan fixture '||g,'10k-row measured discovery fixture','benchmark',clock_timestamp()+interval '72 hours'+g*interval '1 minute',clock_timestamp()+interval '76 hours'+g*interval '1 minute',clock_timestamp()-interval '1 day',clock_timestamp()+interval '70 hours','UTC',1,'USD','PUBLISHED' FROM venues v CROSS JOIN generate_series(1,10000) g WHERE v.id=$1 RETURNING id) INSERT INTO ticket_categories(event_id,name,capacity,price_minor,currency) SELECT id,'General',1,100,'USD' FROM inserted",
          [fixtureIds.venue],
        );
        await tx.query(
          "UPDATE catalog_generation SET generation=generation+1 WHERE id=1",
        );
      });
    await db.rows("ANALYZE");
    const discoverySql =
      "SELECT id,title FROM events WHERE state='PUBLISHED' ORDER BY starts_at,id LIMIT 20";
    const connection = await db.pool.connect();
    let baseline: any;
    try {
      await connection.query("BEGIN");
      await connection.query("DROP INDEX event_discovery");
      baseline = await db.rows(
        "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + discoverySql,
        [],
        connection,
      );
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
    const reportEvent = await db.one(
      "SELECT b.event_id,sum(p.amount_minor)::text captured FROM payment_attempts p JOIN bookings b ON b.id=p.booking_id WHERE p.state='SUCCEEDED' GROUP BY b.event_id ORDER BY sum(p.amount_minor) DESC LIMIT 1",
    );
    const queries = {
      discovery_without_index: baseline,
      discovery: await db.rows(
        "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + discoverySql,
      ),
      report: await db.rows(
        "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) " + salesSql,
        [reportEvent?.event_id || fixtureIds.refund],
      ),
    };
    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/query-plans.json",
      JSON.stringify(
        {
          measured_at: new Date().toISOString(),
          fixture:
            "10,000 catalog events with categories plus real acceptance bookings/payment/refund/ticket facts; baseline drops only discovery index inside rolled-back isolated transaction",
          cardinalities: await db.one(
            "SELECT (SELECT count(*)::int FROM events) events,(SELECT count(*)::int FROM bookings) bookings,(SELECT count(*)::int FROM tickets) tickets",
          ),
          report_event_id: reportEvent?.event_id || fixtureIds.refund,
          queries,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.close();
  }
}
void main().catch(() => {
  console.error("Query analysis failed");
  process.exitCode = 1;
});
