import http from "k6/http";
import { check } from "k6";
const runId = Date.now().toString(36);
export function setup() {
  if (!__ENV.TOKEN || !__ENV.CATEGORY_ID)
    throw new Error("LOAD_TOKEN and LOAD_CATEGORY_ID are required");
  const me = http.get(`${__ENV.BASE_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${__ENV.TOKEN}` },
  });
  if (me.status !== 200)
    throw new Error(`Authentication warmup failed: ${me.status}`);
  const catalog = http.get(`${__ENV.BASE_URL}/api/v1/events`);
  if (catalog.status !== 200)
    throw new Error(`Catalog warmup failed: ${catalog.status}`);
}
export const options = {
  scenarios: {
    catalog: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
    reservations: {
      executor: "constant-arrival-rate",
      exec: "reserve",
      rate: 50,
      timeUnit: "1s",
      duration: "5m",
      preAllocatedVUs: 30,
      maxVUs: 200,
    },
  },
  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
    "http_req_duration{scenario:catalog}": ["p(95)<200"],
    "http_req_duration{scenario:reservations}": ["p(95)<500"],
  },
};
export default function () {
  check(http.get(`${__ENV.BASE_URL}/api/v1/events`), {
    "catalog 200": (r) => r.status === 200,
  });
}
export function reserve() {
  if (!__ENV.TOKEN || !__ENV.CATEGORY_ID)
    throw new Error(
      "LOAD_TOKEN and LOAD_CATEGORY_ID required; use dedicated >=15000 ticket load fixture",
    );
  const r = http.post(
    `${__ENV.BASE_URL}/api/v1/bookings`,
    JSON.stringify({ category_id: __ENV.CATEGORY_ID, quantity: 1 }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${__ENV.TOKEN}`,
        "Idempotency-Key": `k6:${runId}:${__VU}:${__ITER}`,
      },
    },
  );
  check(r, { "reservation created": (res) => res.status === 201 });
}
