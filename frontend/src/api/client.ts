import { allowedCheckoutDestination } from "./checkout";
import validatorIndex from "./validator-index.json";

import type { components, paths } from "./schema";

export type Model<K extends keyof components["schemas"]> =
  components["schemas"][K];
type Method = "get" | "post" | "patch" | "delete";
type Operation<P extends keyof paths, M extends Method> = NonNullable<
  paths[P][M]
>;
type Success<T> = T extends { responses: infer R }
  ? {
      [K in keyof R]: K extends 200 | 201 | 202
        ? R[K] extends { content: { "application/json": infer D } }
          ? D
          : never
        : never;
    }[keyof R]
  : never;
type Body<T> = T extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;
type Params<T> = T extends { parameters: { path?: infer P } }
  ? NonNullable<P>
  : never;
type Query<T> = T extends { parameters: { query?: infer Q } }
  ? NonNullable<Q>
  : never;
type Options<T> = {
  params?: Params<T>;
  query?: Query<T>;
  body?: Body<T>;
  key?: string;
  signal?: AbortSignal;
  anonymous?: boolean;
};
// Existing backend pagination is omitted from these two v1 parameter lists.
// Keep the compatibility extension isolated; see docs/backend-integration.md.
type RequestOptions<P extends keyof paths, M extends Method> = Omit<
  Options<Operation<P, M>>,
  "query"
> & {
  query?: P extends "/organizer/venues" | "/organizer/events"
    ? { page?: number; page_size?: number }
    : Query<Operation<P, M>>;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public fields?: Model<"Error">["field_errors"],
  ) {
    super(message);
  }
  get ambiguous() {
    return (
      this.status === 0 ||
      this.status >= 500 ||
      this.code === "CONTRACT_MISMATCH"
    );
  }
}
let token: string | null = null;
let epoch = 0;
let refreshPromise: Promise<boolean> | null = null;
let expired = () => {};
const requests = new Set<AbortController>();
export function onSessionExpired(fn: () => void) {
  expired = fn;
}
export function resetTransport() {
  token = null;
  epoch++;
  for (const controller of requests) controller.abort();
  requests.clear();
}
export function setAccessToken(value: string) {
  token = value;
}

let validatorModule: Promise<typeof import("./validators.js")> | null = null;
async function validate(
  path: string,
  method: Method,
  status: number,
  data: unknown,
) {
  const validators = await (validatorModule ||= import("./validators.js"));
  const key = `${method}:${path}:${status}`;
  const name = (validatorIndex as Record<string, string>)[key];
  const validator = (validators as Record<string, (value: unknown) => boolean>)[
    name
  ];
  if (!validator || !validator(data))
    throw new ApiError(
      status,
      "CONTRACT_MISMATCH",
      "The server response does not match ticketflow-api-v1. Refresh or contact support.",
    );
}
export async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const started = epoch;
  const perform = async () => {
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: unknown = await response.json();
      if (!response.ok) return false;
      await validate("/auth/refresh", "post", response.status, data);
      if (started !== epoch) return false;
      token = (data as Model<"Auth">).access_token;
      return true;
    } catch {
      return false;
    }
  };
  const operation = navigator.locks
    ? navigator.locks
        .request("ticketflow-refresh", perform)
        .then(async (result) => await result)
    : perform();
  refreshPromise = operation.finally(() => {
    refreshPromise = null;
  });
  return operation;
}
export async function api<P extends keyof paths, M extends Method>(
  path: P,
  method: M,
  options: RequestOptions<P, M> = {},
): Promise<Success<Operation<P, M>>> {
  let url = String(path);
  for (const [key, value] of Object.entries(options.params || {}))
    url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
  if (url.includes("{")) throw new Error("Missing API path parameter");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query || {}))
    if (value !== undefined && value !== "") query.set(key, String(value));
  const started = epoch;
  const controller = new AbortController();
  requests.add(controller);
  const signal = options.signal
    ? AbortSignal.any([
        options.signal,
        controller.signal,
        AbortSignal.timeout(15000),
      ])
    : AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
  const send = () =>
    fetch(`/api/v1${url}${query.size ? `?${query}` : ""}`, {
      method: method.toUpperCase(),
      credentials: "include",
      signal,
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...(!options.anonymous && token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(options.key ? { "Idempotency-Key": options.key } : {}),
      },
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  try {
    let response = await send();
    if (
      response.status === 401 &&
      !options.anonymous &&
      path !== "/auth/refresh"
    ) {
      if (await refreshSession()) response = await send();
      else {
        resetTransport();
        expired();
        throw new ApiError(
          401,
          "SESSION_EXPIRED",
          "Your session ended. Sign in again to continue.",
        );
      }
    }
    if (started !== epoch)
      throw new DOMException("Account changed", "AbortError");
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        response.status || 503,
        "UPSTREAM_UNAVAILABLE",
        "TicketFlow could not reach the service. Try again shortly.",
      );
    }
    if (!response.ok) {
      const error = data as Partial<Model<"Error">>;
      throw new ApiError(
        response.status,
        error.code || "REQUEST_FAILED",
        error.message || "The request could not be completed.",
        error.request_id,
        error.field_errors,
      );
    }
    await validate(String(path), method, response.status, data);
    return data as Success<Operation<P, M>>;
  } catch (error) {
    if (
      error instanceof ApiError ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      throw error;
    throw new ApiError(
      0,
      "NETWORK_UNCERTAIN",
      "The connection was interrupted. Check the current state before retrying.",
    );
  } finally {
    requests.delete(controller);
  }
}

export function checkoutDestination(checkout: Model<"Checkout">): string {
  if (checkout.status !== "ready" || !checkout.checkout_url)
    throw new ApiError(
      409,
      "CHECKOUT_PENDING",
      "Checkout is still processing. Refresh this booking shortly.",
    );
  const destination = allowedCheckoutDestination(checkout, location.origin);
  if (destination) return destination;
  throw new ApiError(
    400,
    "UNSAFE_CHECKOUT_URL",
    "The checkout address is not allowed. Contact the event organizer.",
  );
}
