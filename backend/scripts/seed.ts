import { Db } from "../src/infra/db";
import { Identity } from "../src/identity/service";
import { config } from "../src/infra/config";
import { assert } from "../src/infra/common";
export const fixtureIds = {
  venue: "10000000-0000-4000-8000-000000000001",
  refund: "20000000-0000-4000-8000-000000000001",
  checkin: "20000000-0000-4000-8000-000000000002",
  contention: "20000000-0000-4000-8000-000000000003",
  refund_category: "30000000-0000-4000-8000-000000000001",
  checkin_category: "30000000-0000-4000-8000-000000000002",
  contention_category: "30000000-0000-4000-8000-000000000003",
};
export async function seed(db: Db) {
  assert(config.APP_MODE !== "production", 403, "SEED_DISABLED");
  const password = process.env.SEED_PASSWORD;
  assert(password && password.length >= 12, 400, "SEED_PASSWORD_REQUIRED");
  const identity = new Identity(db);
  const users: Record<string, any> = {};
  for (const [name, role] of [
    ["customer", "customer"],
    ["organizer", "organizer"],
    ["organizer2", "organizer"],
    ["admin", "admin"],
  ]) {
    let u = await db.one("SELECT id FROM users WHERE email=$1", [
      `${name}@ticketflow.local`,
    ]);
    if (!u)
      u = await identity.register({
        email: `${name}@ticketflow.local`,
        password,
        display_name: name,
      });
    if (role !== "customer")
      await db.rows(
        "INSERT INTO user_roles VALUES($1,$2) ON CONFLICT DO NOTHING",
        [u.id, role],
      );
    users[name] = u;
  }
  await db.transaction(async (tx) => {
    await tx.query(
      "INSERT INTO venues(id,owner_id,name,address,city,country,capacity,timezone) VALUES($1,$2,'Demo Hall','1 Demo Street','Cairo','EG',100000,'Africa/Cairo') ON CONFLICT DO NOTHING",
      [fixtureIds.venue, users.organizer.id],
    );
    for (const [name, id, cid, hours, capacity] of [
      ["Refund Demo", fixtureIds.refund, fixtureIds.refund_category, 72, 10000],
      [
        "Check-in Demo",
        fixtureIds.checkin,
        fixtureIds.checkin_category,
        1,
        10000,
      ],
      [
        "Contention Demo",
        fixtureIds.contention,
        fixtureIds.contention_category,
        72,
        10,
      ],
    ] as const) {
      await tx.query(
        "INSERT INTO events(id,owner_id,venue_id,title,description,category_label,starts_at,ends_at,sales_open_at,sales_close_at,timezone,capacity,currency,state) VALUES($1,$2,$3,$4,'Independent backend fixture','music',clock_timestamp()+$5*interval '1 hour',clock_timestamp()+($5+4)*interval '1 hour',clock_timestamp()-interval '1 day',clock_timestamp()+($5-0.1)*interval '1 hour','Africa/Cairo',$6,'USD','PUBLISHED') ON CONFLICT DO NOTHING",
        [id, users.organizer.id, fixtureIds.venue, name, hours, capacity],
      );
      await tx.query(
        "INSERT INTO ticket_categories(id,event_id,name,capacity,price_minor,currency) VALUES($1,$2,'General',$3,2500,'USD') ON CONFLICT DO NOTHING",
        [cid, id, capacity],
      );
    }
    await tx.query(
      "UPDATE catalog_generation SET generation=generation+1 WHERE id=1",
    );
  });
  return {
    users: Object.fromEntries(Object.entries(users).map(([k, v]) => [k, v.id])),
    fixtures: fixtureIds,
  };
}
async function main() {
  const db = new Db();
  try {
    console.log(JSON.stringify(await seed(db)));
  } finally {
    await db.close();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error("Seed failed");
    process.exitCode = 1;
  });
