import Redis from "ioredis";
import { Db } from "./db";
import { config } from "./config";
import { hash } from "./common";
import { cache } from "./metrics";
export class PublicCache {
  readonly redis = new Redis(config.REDIS_URL, {
    connectTimeout: 300,
    commandTimeout: 300,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (n) => Math.min(n * 500, 5000),
  });
  constructor(private db: Db) {
    this.redis.on("error", () => {});
    void this.redis.connect().catch(() => {});
  }
  async read<T>(query: unknown, load: () => Promise<T>): Promise<T> {
    const generation = await this.db.one(
      "SELECT generation FROM catalog_generation WHERE id=1",
    );
    const key = `ticketflow-api-v1:catalog:${generation.generation}:${hash(JSON.stringify(query))}`;
    try {
      const value = await this.redis.get(key);
      if (value) {
        cache.inc({ result: "hit" });
        return JSON.parse(value) as T;
      }
      cache.inc({ result: "miss" });
    } catch {
      cache.inc({ result: "failure" });
    }
    const value = await load();
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        "EX",
        60 + Math.floor(Math.random() * 6),
      );
    } catch {
      cache.inc({ result: "failure" });
    }
    return value;
  }
  async close() {
    this.redis.disconnect();
  }
}
