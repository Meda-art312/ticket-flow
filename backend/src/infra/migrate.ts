import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Db } from "./db";
async function main() {
  const db = new Db();
  try {
    await migrate(drizzle(db.pool), { migrationsFolder: "drizzle" });
  } finally {
    await db.close();
  }
}
void main().catch(() => {
  console.error("Migration failed");
  process.exitCode = 1;
});
