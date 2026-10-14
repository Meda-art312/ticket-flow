import { randomUUID } from "node:crypto";
import { fixtureIds } from "./seed";
const base = (process.env.API_URL || "http://api:3000") + "/api/v1";
let access = "";
async function call(path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: process.env.FRONTEND_ORIGIN || "http://localhost:8080",
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as any;
  if (!response.ok) throw new Error(`${response.status} ${result.code}`);
  return result;
}
async function main() {
  access = (
    await call("/auth/login", {
      email: "customer@ticketflow.local",
      password: process.env.SEED_PASSWORD,
    })
  ).access_token;
  const b = await call("/bookings", {
    category_id: fixtureIds.refund_category,
    quantity: 2,
  });
  const checkout = await call(`/bookings/${b.id}/checkout`, {});
  if (checkout.status !== "ready")
    throw new Error("Checkout requires reconciliation");
  await call(`/demo/checkout/${checkout.attempt_id}`);
  await call(`/demo/checkout/${checkout.attempt_id}/complete`, {
    outcome: "success",
  });
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    const detail = await call(`/bookings/${b.id}`);
    if (detail.state === "CONFIRMED") {
      const tickets = await call(`/bookings/${b.id}/tickets`);
      console.log(
        JSON.stringify({
          booking_id: b.id,
          state: detail.state,
          ticket_count: tickets.items.length,
          checkout_url: checkout.checkout_url,
        }),
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Confirmation timed out");
}
void main().catch((e) => {
  console.error(String(e));
  process.exitCode = 1;
});
