import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
test("FE-AT-10/11: unavailable upstream is a visible JSON failure while static service stays live", async ({
  page,
}) => {
  const response = await page.request.get(
    "http://unavailable:8080/api/v1/events",
  );
  expect(response.status()).toBe(503);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect((await response.json()).code).toBe("UPSTREAM_UNAVAILABLE");
  expect(
    (await page.request.get("http://unavailable:8080/health/live")).status(),
  ).toBe(200);
  await page.goto("http://unavailable:8080/events");
  await expect(page.getByRole("alert")).toContainText(
    "TicketFlow cannot reach the backend.",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("FE-AT-04/12: return polling stops after sixty seconds without inventing confirmation or expiry", async ({
  page,
}) => {
  const apiURL = process.env.API_URL || "http://api:3000/api/v1";
  const events = await (
    await page.request.get(apiURL + "/events?q=The%20Listening%20Room")
  ).json();
  const id = events.items[0].id;
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@ticketflow.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "My bookings", exact: true }),
  ).toBeVisible();
  await page.goto("/events/" + id);
  await page
    .getByRole("button", { name: "Reserve tickets", exact: true })
    .click();
  await expect(page).toHaveURL(/\/bookings\//);
  const booking = page.url().split("/").pop();
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/bookings/${booking}/checkout`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  const { attempt_id } = await (await response).json();
  expect(
    (
      await page.request.post(apiURL + "/internal/simulator/events", {
        headers: { "X-Internal-Secret": process.env.E2E_INTERNAL_SECRET! },
        data: {
          attempt_id,
          outcome: "success",
          event_id: randomUUID(),
          delay_seconds: 120,
        },
      })
    ).ok(),
  ).toBeTruthy();
  await page.clock.install();
  await page.goto("/checkout/return?booking_id=" + booking + "&status=success");
  await expect(
    page
      .locator(".status-grid > div")
      .filter({ hasText: "Payment" })
      .getByText("pending", { exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(
    page.getByText("Automatic updates have stopped", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator(".status-grid").getByText("reserved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Ticket 1/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Refresh status", exact: true }),
  ).toBeVisible();
});
