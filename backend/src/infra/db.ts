import { Pool, PoolClient, QueryResultRow } from "pg";
import { config } from "./config";
export type Tx = PoolClient;
export class Db {
  readonly pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 30,
    connectionTimeoutMillis: 3000,
    statement_timeout: 15000,
    application_name: process.env.ENTRYPOINT || "ticketflow-api",
  });
  constructor() {
    this.pool.on("error", () => {
      console.log(JSON.stringify({ event: "database_connection_lost" }));
    });
  }
  async rows<T extends QueryResultRow = any>(
    sql: string,
    values: unknown[] = [],
    tx?: Tx,
  ): Promise<T[]> {
    return (await (tx || this.pool).query<T>(sql, values)).rows;
  }
  async one(sql: string, values: unknown[] = [], tx?: Tx): Promise<any> {
    return (await this.rows(sql, values, tx))[0];
  }
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    for (let n = 0; ; n++) {
      const tx = await this.pool.connect();
      try {
        await tx.query("BEGIN");
        await tx.query("SET LOCAL lock_timeout='5s'");
        const result = await fn(tx);
        await tx.query("COMMIT");
        return result;
      } catch (error: any) {
        await tx.query("ROLLBACK");
        if (n < 2 && ["40001", "40P01"].includes(error.code)) continue;
        throw error;
      } finally {
        tx.release();
      }
    }
  }
  async close() {
    await this.pool.end();
  }
}
