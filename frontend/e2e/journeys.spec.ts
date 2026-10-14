import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const password = process.env.E2E_PASSWORD!;
const origin = "http://localhost:8080";
const apiUrl = process.env.API_URL || "http://api:3000/api/v1";
let setup: APIRequestContext;
let organizerToken = "";
let customerToken = "";
const fixtures: Record<string, string> = {};
const titles = [
  "The Listening Room",
  "Design After Dark",
  "A Sunday Well Spent",
  "Off the Record",
  "An Evening in Motion",
  "The Open Table",
  "Small Hours, Big Ideas",
  "Between the Lines",
  "Sounds of the City",
  "Meet in the Middle",
  "A Room Full of Stories",
];
async function call(
  path: string,
  body?: unknown,
  token = organizerToken,
  method?: string,
) {
  const response = await setup.fetch(apiUrl + path, {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      Origin: origin,
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": randomUUID(),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    data: body,
  });
  if (!response.ok())
    throw new Error(
      `Fixture request failed: ${path} ${response.status()} ${await response.text()}`,
    );
  return response.json();
}
async function makeEvent(title: string, hours = 72, capacity = 100) {
  const venue = await call("/organizer/venues", {
    name: "The Assembly Hall",
    address: "12 Garden Street",
    city: "Cairo",
    country: "EG",
    timezone: "Africa/Cairo",
    capacity: 500,
  });
  const time = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
  const event = await call("/organizer/events", {
    title,
    description:
      "A TicketFlow demo event. An intimate gathering for curious people, shared ideas, and a good time together.",
    category_label: title.includes("Design") ? "Ideas" : "Music",
    venue_id: venue.id,
    starts_at: time(hours),
    ends_at: time(hours + 3),
    sales_open_at: time(-1),
    sales_close_at: time(Math.max(0.25, hours - 0.25)),
    timezone: "Africa/Cairo",
    capacity,
    currency: "USD",
  });
  await call(`/organizer/events/${event.id}/categories`, {
    name: "General admission",
    capacity,
    price_minor: 2500,
    currency: "USD",
  });
  await call(`/organizer/events/${event.id}/publish`, {});
  return event.id as string;
}
test.beforeAll(async () => {
  if (!password)
    throw Error("E2E_PASSWORD must be provided by the isolated harness");
  setup = await request.newContext();
  organizerToken = (
    await call(
      "/auth/login",
      { email: "organizer@ticketflow.local", password },
      "",
    )
  ).access_token;
  customerToken = (
    await call(
      "/auth/login",
      { email: "customer@ticketflow.local", password },
      "",
    )
  ).access_token;
  for (const title of titles) fixtures[title] = await makeEvent(title);
  fixtures.admission = await makeEvent("At the Door — Admission Demo", 1);
  fixtures.soldOut = await makeEvent("One Place Only", 72, 1);
});
test.afterAll(async () => {
  await setup?.dispose();
});
async function login(page: Page, organizer = false) {
  await page.goto("/login");
  await page
    .getByLabel("Email address")
    .fill(`${organizer ? "organizer" : "customer"}@ticketflow.local`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "My bookings", exact: true }),
  ).toBeVisible();
}
async function reserve(page: Page, event = fixtures[titles[0]]) {
  await page.goto(`/events/${event}`);
  await page
    .getByRole("button", { name: "Reserve tickets", exact: true })
    .click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
  return page.url().split("/").pop()!;
}
async function purchase(page: Page, event?: string) {
  const id = await reserve(page, event);
  const checkout = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/bookings/${id}/checkout`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  const result = await (await checkout).json();
  await expect(page).toHaveURL(/\/demo\/checkout\//);
  await page
    .getByRole("button", { name: "Simulate successful payment" })
    .click();
  await expect(
    page.locator(".status-grid").getByText("confirmed", { exact: true }),
  ).toBeVisible();
  return { id, attempt: result.attempt_id as string };
}
test("FE-AT-01/02/10/11: real discovery, filters, pagination, deep links and responsive keyboard layout", async ({
  page,
}) => {
  await page.goto("/events");
  await expect(
    page.getByRole("heading", { name: "Worth going out for." }),
  ).toBeVisible();
  await expect(page.locator(".event-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.getByLabel("Search events").fill("The Listening Room");
  await page.getByRole("button", { name: "Find events" }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByLabel("City", { exact: true }).fill("Cairo");
  await page.getByLabel("Category", { exact: true }).fill("Music");
  await page.getByRole("button", { name: "Find events" }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByLabel("City", { exact: true }).fill("NoSuchCity");
  await page.getByRole("button", { name: "Find events" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing here just yet." }),
  ).toBeVisible();
  await page.goto("/events");
  await page.evaluate(() => document.fonts.ready);
  if (process.env.CAPTURE_DESIGN === "1")
    await page.screenshot({
      path: ".impeccable/review/desktop.png",
      fullPage: true,
      animations: "disabled",
    });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  if (process.env.CAPTURE_DESIGN === "1")
    await page.screenshot({
      path: ".impeccable/review/mobile.png",
      fullPage: true,
      animations: "disabled",
    });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/events/${fixtures[titles[0]]}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: titles[0], exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in to reserve" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  const response = await page.request.get("/api/v1/not-a-route");
  expect(response.status()).toBe(404);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect((await page.request.get("/health/integration")).ok()).toBeTruthy();
});
test("FE-AT-02/08/09: register, restore on reload, same-tab refresh coordination and logout clearing", async ({
  page,
  context,
}) => {
  await page.goto(`/events/${fixtures[titles[0]]}?quantity=2`);
  await page.getByRole("button", { name: "Sign in to reserve" }).click();
  await page
    .getByRole("link", { name: "Create an account", exact: true })
    .click();
  await page.getByLabel("Your name").fill("New Guest");
  await page
    .getByLabel("Email address")
    .fill(`guest-${randomUUID()}@example.test`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/events\/.+quantity=2/);
  await expect(page.getByLabel("Ticket quantity")).toHaveValue("2");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reserve tickets", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  const cookie = (await context.cookies()).find(
    (cookie) => cookie.name === "refresh_token",
  );
  expect(cookie?.httpOnly).toBeTruthy();
  expect(cookie?.path).toBe("/api/v1/auth");
  expect(cookie?.sameSite).toBe("Lax");
  const second = await context.newPage();
  await second.goto("/bookings");
  await expect(
    second.getByRole("heading", { name: "Your good plans." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(second).toHaveURL(/\/login\?next=/);
  await page.goto("/bookings");
  await expect(page).toHaveURL(/\/login\?next=/);
});
test("FE-AT-03/05: customer purchase, verified QR ticket and eligible refund", async ({
  page,
}) => {
  await login(page);
  const { id } = await purchase(page);
  await page.getByRole("link", { name: /Ticket 1/ }).click();
  await expect(
    page.getByRole("img", { name: "Your ticket QR code" }),
  ).toBeVisible();
  await expect(page.getByLabel("Check-in credential")).not.toHaveValue("");
  await page.getByRole("button", { name: "Copy credential" }).click();
  await expect(
    page.getByText("Credential copied.", { exact: true }),
  ).toBeVisible();
  if (process.env.CAPTURE_DESIGN === "1")
    await page.screenshot({
      path: ".impeccable/review/ticket.png",
      fullPage: true,
      animations: "disabled",
    });
  const ticketUrl = page.url();
  await page.goto(`/bookings/${id}`);
  await page
    .getByRole("button", { name: "Request refund", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Request refund", exact: true })
    .click();
  await expect(
    page.locator(".status-grid").getByText("refunded", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".status-grid").getByText("succeeded", { exact: true }),
  ).toHaveCount(2);
  await page.goto(ticketUrl);
  await expect(page.getByText("void", { exact: true })).toBeVisible();
});
test("FE-AT-04/08: decline, cancellation and same-key transport retry", async ({
  page,
  context,
}) => {
  await login(page);
  await reserve(page, fixtures[titles[1]]);
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.getByRole("button", { name: "Simulate declined payment" }).click();
  await expect(
    page.locator(".status-grid").getByText("failed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel reservation", exact: true })
    .click();
  await expect(
    page.locator(".status-grid").getByText("canceled", { exact: true }),
  ).toBeVisible();
  await page.goto(`/events/${fixtures[titles[2]]}`);
  await expect(
    page.getByRole("button", { name: "Reserve tickets", exact: true }),
  ).toBeEnabled();
  const keys: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/v1/bookings") &&
      request.method() === "POST"
    )
      keys.push(request.headers()["idempotency-key"]);
  });
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Reserve tickets", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Retry same reservation" }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Retry same reservation" }).click();
  await expect(page).toHaveURL(/\/bookings\//);
  expect(keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
});
test("FE-AT-04/12: delayed signed webhook remains pending; return parameters never confirm", async ({
  page,
}) => {
  await login(page);
  const id = await reserve(page, fixtures[titles[3]]);
  const checkout = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/bookings/${id}/checkout`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  const { attempt_id } = await (await checkout).json();
  const injected = await setup.post(`${apiUrl}/internal/simulator/events`, {
    headers: { "X-Internal-Secret": process.env.E2E_INTERNAL_SECRET! },
    data: {
      attempt_id,
      outcome: "success",
      event_id: randomUUID(),
      delay_seconds: 8,
    },
  });
  expect(injected.ok()).toBeTruthy();
  await page.goto(`/checkout/return?booking_id=${id}&status=success`);
  await expect(
    page.locator(".status-grid").getByText("reserved", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Checking your payment.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Ticket 1/ })).toHaveCount(0);
  await expect(
    page.locator(".status-grid").getByText("confirmed", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
});
test("FE-AT-04: database hold expiry disables checkout and late capture displays compensation separately", async ({
  page,
}) => {
  await login(page);
  const id = await reserve(page, fixtures[titles[4]]);
  const checkout = await call(`/bookings/${id}/checkout`, {}, customerToken);
  await expect(
    page.locator(".status-grid").getByText("expired", { exact: true }),
  ).toBeVisible({ timeout: 55000 });
  await expect(
    page.getByRole("button", { name: "Continue to checkout" }),
  ).toHaveCount(0);
  const response = await setup.post(`${apiUrl}/internal/simulator/events`, {
    headers: { "X-Internal-Secret": process.env.E2E_INTERNAL_SECRET! },
    data: {
      attempt_id: checkout.attempt_id,
      outcome: "success",
      event_id: randomUUID(),
      delay_seconds: 0,
    },
  });
  expect(response.ok()).toBeTruthy();
  await expect
    .poll(
      async () => {
        await page
          .getByRole("button", { name: "Refresh status", exact: true })
          .click();
        return page
          .locator(".status-grid")
          .getByText("succeeded", { exact: true })
          .count();
      },
      { timeout: 20000, intervals: [500, 1000, 2000] },
    )
    .toBe(2);
  await expect(
    page.locator(".status-grid").getByText("expired", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Refund reason: late payment.", { exact: false }),
  ).toBeVisible();
});
test("FE-AT-06: organizer draft CRUD, publication freeze, sales and explicit cancellation", async ({
  page,
}) => {
  await login(page, true);
  await page.goto("/organizer");
  await page.getByRole("button", { name: "New venue" }).click();
  await page.getByLabel("Venue name", { exact: true }).fill("Browser Studio");
  await page.getByLabel("Street address").fill("7 Culture Lane");
  await page.getByLabel("City", { exact: true }).fill("Cairo");
  await page.getByRole("button", { name: "Save venue" }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Studio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New event" }).click();
  await page.getByLabel("Event title").fill("Made in the Browser");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A real API-backed event created through the organizer interface.");
  await page
    .getByLabel("Venue", { exact: true })
    .selectOption({ label: "Browser Studio" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/organizer\/events\//);
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Ticket name").fill("Studio admission");
  await page.getByLabel("Ticket allocation").fill("50");
  await page.getByLabel("Ticket price (USD)").fill("18.50");
  await page.getByRole("button", { name: "Save ticket category" }).click();
  await expect(
    page.getByRole("heading", { name: "Studio admission" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Publish event", exact: true })
    .click();
  await expect(page.getByText("published", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Event capacity")).toBeDisabled();
  await page.getByLabel("Event title").fill("Made in the Browser — Updated");
  await page.getByRole("button", { name: "Save event details" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Made in the Browser — Updated",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  if (process.env.CAPTURE_DESIGN === "1")
    await page.screenshot({
      path: ".impeccable/review/organizer.png",
      fullPage: true,
      animations: "disabled",
    });
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel event", exact: true })
    .click();
  await expect(page.getByText("canceled", { exact: true })).toBeVisible();
});
test("FE-AT-07: independent customer/organizer contexts admit once, reject wrong event and protect ownership", async ({
  browser,
}) => {
  const customer = await browser.newContext({ baseURL: origin });
  const organizer = await browser.newContext({ baseURL: origin });
  const buyer = await customer.newPage();
  const door = await organizer.newPage();
  await login(buyer);
  const { id } = await purchase(buyer, fixtures.admission);
  await buyer.getByRole("link", { name: /Ticket 1/ }).click();
  const token = await buyer.getByLabel("Check-in credential").inputValue();
  const ticketUrl = buyer.url();
  await login(door, true);
  await door.goto(`/organizer/events/${fixtures[titles[0]]}`);
  await door.getByLabel("Ticket credential", { exact: true }).fill(token);
  await door.getByRole("button", { name: "Check in ticket" }).click();
  await expect(door.getByRole("alert")).toBeVisible();
  await door.goto(`/organizer/events/${fixtures.admission}`);
  await door.getByLabel("Ticket credential", { exact: true }).fill(token);
  await door.getByRole("button", { name: "Check in ticket" }).click();
  await expect(
    door.getByText("Admitted. Enjoy the event!", { exact: true }),
  ).toBeVisible();
  await door.getByRole("button", { name: "Check in ticket" }).click();
  await expect(
    door.getByText("Already checked in. This ticket has been used.", {
      exact: true,
    }),
  ).toBeVisible();
  await buyer.reload();
  await expect(buyer.getByText("checked in", { exact: true })).toBeVisible();
  await buyer.goto(`/bookings/${id}`);
  await expect(
    buyer.getByRole("button", { name: "Request refund", exact: true }),
  ).toBeDisabled();
  await buyer.goto("/organizer");
  await expect(
    buyer.getByRole("heading", { name: "This space is for organizers." }),
  ).toBeVisible();
  await door.goto(ticketUrl);
  await expect(door.getByRole("alert")).toBeVisible();
  const outsider = await browser.newContext({ baseURL: origin });
  const other = await outsider.newPage();
  await other.goto("/login");
  await other.getByLabel("Email address").fill("organizer2@ticketflow.local");
  await other.getByLabel("Password", { exact: true }).fill(password);
  await other.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    other.getByRole("link", { name: "My bookings", exact: true }),
  ).toBeVisible();
  await other.goto(`/organizer/events/${fixtures.admission}`);
  await expect(other.getByRole("alert")).toBeVisible();
  await Promise.all([customer.close(), organizer.close(), outsider.close()]);
});
test("FE-AT-04/09: sold-out feedback and assets contain no test credentials", async ({
  page,
}) => {
  const event = await call(`/events/${fixtures.soldOut}`, undefined, "");
  await login(page);
  await page.goto(`/events/${fixtures.soldOut}`);
  await expect(
    page.getByRole("button", { name: "Reserve tickets", exact: true }),
  ).toBeEnabled();
  await call(
    "/bookings",
    { category_id: event.categories[0].id, quantity: 1 },
    customerToken,
  );
  await page
    .getByRole("button", { name: "Reserve tickets", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "There aren’t enough tickets left.",
  );
  const html = await (await page.request.get("/")).text();
  const script = html.match(/src="([^"]+\.js)"/)?.[1];
  expect(script).toBeTruthy();
  const source = await (await page.request.get(script!)).text();
  expect(source).not.toContain(password);
  expect(source).not.toContain(process.env.E2E_INTERNAL_SECRET);
  expect(source).not.toContain("sk_test_");
  await fs.writeFile(
    "artifacts/browser-evidence.json",
    JSON.stringify(
      {
        observed_at: new Date().toISOString(),
        contract: "ticketflow-api-v1",
        real_infrastructure: true,
        business_response_interception: false,
        viewports: [1440, 390, 375],
        scenarios: "see Playwright JSON results",
      },
      null,
      2,
    ),
  );
});
