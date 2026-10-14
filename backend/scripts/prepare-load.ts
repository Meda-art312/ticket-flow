import { writeFileSync } from "node:fs";
import { services } from "../src/infra/services";
import { config } from "../src/infra/config";
import { assert } from "../src/infra/common";
import { fixtureIds } from "./seed";
async function main() {
  assert(config.APP_MODE !== "production", 403, "LOAD_FIXTURE_DISABLED");
  const s = services();
  try {
    const owner = await s.db.one(
      "SELECT id FROM users WHERE email='organizer@ticketflow.local'",
    );
    const e = await s.catalog.saveEvent(owner.id, {
      title: "Five minute load fixture",
      description: "Dedicated capacity 20000",
      category_label: "load",
      venue_id: fixtureIds.venue,
      starts_at: new Date(Date.now() + 72 * 3600000).toISOString(),
      ends_at: new Date(Date.now() + 76 * 3600000).toISOString(),
      sales_open_at: new Date(Date.now() - 3600000).toISOString(),
      sales_close_at: new Date(Date.now() + 71 * 3600000).toISOString(),
      timezone: "UTC",
      capacity: 20000,
      currency: "USD",
    });
    const c = await s.catalog.saveCategory(owner.id, e.id, {
      name: "Load",
      capacity: 20000,
      price_minor: 100,
      currency: "USD",
    });
    await s.catalog.transition(owner.id, e.id, "PUBLISHED");
    const auth = await s.identity.login(
      "customer@ticketflow.local",
      process.env.SEED_PASSWORD!,
    );
    writeFileSync(
      "artifacts/load.env",
      `LOAD_TOKEN=${auth.access_token}\nLOAD_CATEGORY_ID=${c.id}\n`,
    );
    writeFileSync(
      "artifacts/load-fixture.json",
      JSON.stringify(
        {
          event_id: e.id,
          category_id: c.id,
          capacity: 20000,
          duration_seconds: 300,
          read_rate: 50,
          reservation_rate: 50,
          created_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(
      "Dedicated load fixture and short-lived token written to ignored artifacts/load.env",
    );
  } finally {
    await s.cache.close();
    await s.db.close();
  }
}
void main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
