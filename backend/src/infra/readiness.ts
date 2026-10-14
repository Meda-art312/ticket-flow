import { readFileSync } from "node:fs";
import { hash } from "./common";
import { Db } from "./db";
const schemaHash = hash(readFileSync("drizzle/0003_capture_time.sql", "utf8"));
export async function schemaReady(db: Db) {
  return !!(
    await db.one(
      "SELECT EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash=$1) AS compatible",
      [schemaHash],
    )
  )?.compatible;
}
