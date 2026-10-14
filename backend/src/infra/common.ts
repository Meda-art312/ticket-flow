import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { Db, Tx } from "./db";
import { config } from "./config";
import { correlationId } from "./context";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string = code,
    public field_errors?: unknown,
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  code: string,
): asserts condition {
  if (!condition) throw new ApiError(status, code);
}
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
function canonical(v: any): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
export async function command<T>(
  db: Db,
  actor: string,
  operation: string,
  key: string,
  payload: unknown,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assert(
    typeof key === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(key),
    400,
    "INVALID_IDEMPOTENCY_KEY",
  );
  const digest = hash(canonical(payload));
  const outcome = await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${actor}/${operation}/${key}`,
    ]);
    const old = await db.one(
      "SELECT * FROM idempotency_requests WHERE actor_id=$1 AND operation=$2 AND key=$3",
      [actor, operation, key],
      tx,
    );
    if (old) {
      assert(old.request_hash === digest, 409, "IDEMPOTENCY_CONFLICT");
      return old.result as T;
    }
    await tx.query("SAVEPOINT business_effects");
    let result: any;
    try {
      result = await fn(tx);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      await tx.query("ROLLBACK TO SAVEPOINT business_effects");
      result = {
        __command_error: {
          status: error.status,
          code: error.code,
          message: error.message,
          field_errors: error.field_errors,
        },
      };
    }
    await tx.query(
      "INSERT INTO idempotency_requests(actor_id,operation,key,request_hash,result) VALUES($1,$2,$3,$4,$5)",
      [actor, operation, key, digest, JSON.stringify(result)],
    );
    return result;
  });
  const error = (outcome as any).__command_error;
  if (error)
    throw new ApiError(
      error.status,
      error.code,
      error.message,
      error.field_errors,
    );
  return outcome as T;
}
export async function outbox(
  db: Db,
  tx: Tx,
  type: string,
  id: string,
  payload: unknown = {},
  correlation = correlationId(),
) {
  await db.rows(
    "INSERT INTO outbox_events(event_type,aggregate_id,correlation_id,payload) VALUES($1,$2,$3,$4)",
    [type, id, correlation, JSON.stringify(payload)],
    tx,
  );
}
export async function audit(
  db: Db,
  tx: Tx,
  actor: string | null,
  action: string,
  id: string,
  metadata: unknown = {},
) {
  await db.rows(
    "INSERT INTO audit_logs(actor_id,action,resource_id,correlation_id,metadata) VALUES($1,$2,$3,$4,$5)",
    [actor, action, id, correlationId(), JSON.stringify(metadata)],
    tx,
  );
}
const key = Buffer.from(hash(config.TOKEN_ENCRYPTION_KEY), "hex");
export function encrypt(value: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    cipher.update(value, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64");
}
export function decrypt(value: string) {
  const data = Buffer.from(value, "base64");
  assert(data.length >= 28, 409, "INVALID_ARTIFACT");
  const cipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12), {
    authTagLength: 16,
  });
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([
    cipher.update(data.subarray(12, -16)),
    cipher.final(),
  ]).toString("utf8");
}
export function pagination(q: any) {
  const page = Number(q.page || 1),
    page_size = Number(q.page_size || 20);
  assert(
    Number.isInteger(page) &&
      page >= 1 &&
      page <= 100000 &&
      Number.isInteger(page_size) &&
      page_size >= 1 &&
      page_size <= 100,
    400,
    "INVALID_PAGINATION",
  );
  return { page, page_size, offset: (page - 1) * page_size };
}
export function failpoint(name: string) {
  if (config.APP_MODE === "test" && process.env.TEST_FAILPOINT === name)
    throw new Error("Injected transaction rollback");
}
