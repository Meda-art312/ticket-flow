import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
export const requestContext = new AsyncLocalStorage<{ request_id: string }>();
export function correlationId() {
  return requestContext.getStore()?.request_id || randomUUID();
}
