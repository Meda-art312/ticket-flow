import {
  Counter,
  Histogram,
  Gauge,
  Registry,
  collectDefaultMetrics,
} from "prom-client";
export const registry = new Registry();
collectDefaultMetrics({ register: registry });
export const requests = new Histogram({
  name: "ticketflow_http_seconds",
  help: "HTTP duration",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 5],
  registers: [registry],
});
export const cache = new Counter({
  name: "ticketflow_cache_total",
  help: "Public cache operations",
  labelNames: ["result"],
  registers: [registry],
});
export const failures = new Counter({
  name: "ticketflow_work_failures_total",
  help: "Work retry and dead letters",
  labelNames: ["kind"],
  registers: [registry],
});
export const backlog = new Gauge({
  name: "ticketflow_backlog",
  help: "Durable backlog count",
  labelNames: ["kind"],
  registers: [registry],
});
export const age = new Gauge({
  name: "ticketflow_oldest_seconds",
  help: "Oldest unfinished work age",
  labelNames: ["kind"],
  registers: [registry],
});
export const conflicts = new Counter({
  name: "ticketflow_reservation_conflicts_total",
  help: "Reservation inventory conflicts",
  registers: [registry],
});
export function log(event: string, data: Record<string, unknown> = {}) {
  if (process.env.APP_MODE === "test" && process.env.QUIET_TEST_LOGS === "true")
    return;
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...data }),
  );
}
