import { chromium, expect, request } from "@playwright/test";
import fs from 'node:fs/promises';
const measurements = {};
function contrast(a,b){const luminance=value=>value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (l[0]+.05)/(l[1]+.05);}
const baseURL = process.env.BASE_URL || "http://localhost:8080";
const apiURL = process.env.API_URL || "http://api:3000/api/v1";
const setup = await request.newContext({
  extraHTTPHeaders: { Origin: baseURL },
});
const auth = await (
  await setup.post(apiURL + "/auth/login", {
    data: {
      email: "organizer@ticketflow.local",
      password: process.env.E2E_PASSWORD,
    },
  })
).json();
const events = await (
  await setup.get(apiURL + "/organizer/events?page_size=100", {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  })
).json();
const event = events.items.find(
  (item) => item.title === "The Listening Room" && item.state === "PUBLISHED",
);
if (!event)
  throw Error(
    "Run the isolated browser journeys first to create the review fixture",
  );
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL,
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
async function login(email) {
  await page.goto("/login");
  const fieldColors = await page.getByLabel('Email address').evaluate(input=>({border:getComputedStyle(input).borderColor,background:getComputedStyle(input).backgroundColor}));
  measurements.field_boundary_contrast = contrast(fieldColors.border,fieldColors.background);
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "My bookings", exact: true }),
  ).toBeVisible();
}
async function capture(name) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  await page.screenshot({
    path: ".impeccable/review/" + name + ".png",
    fullPage: true,
    animations: "disabled",
  });
}
if (process.env.CAPTURE_ALL === "true") {
  await page.goto("/events");
  await expect(page.locator(".event-card").first()).toBeVisible();
  await capture("desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await capture("mobile");
  for(const width of [390,375]){
    await page.setViewportSize({width,height:844});
    const result = await page.evaluate(()=>{
      const input=document.querySelector('.search-field input');
      const colors={placeholder:getComputedStyle(input,'::placeholder').color,background:getComputedStyle(document.querySelector('.search-bar')).backgroundColor};
      const targets=[...document.querySelectorAll('a.brand,.main-nav a')].map(el=>({label:el.textContent.trim(),height:el.getBoundingClientRect().height}));
      const posters=[...document.querySelectorAll('.poster')].map(el=>{const rect=el.getBoundingClientRect();const card=el.closest('.event-card').getBoundingClientRect();return {width:rect.width,column_width:card.width,children_contained:[...el.children].every(child=>{const box=child.getBoundingClientRect();return box.left>=rect.left-1 && box.right<=rect.right+1 && box.bottom<=rect.bottom+1;})};});
      return {colors,targets,posters};
    });
    measurements['mobile_'+width]={...result,placeholder_contrast:contrast(result.colors.placeholder,result.colors.background)};
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
await login("customer@ticketflow.local");
await page.goto("/events/" + event.id);
await page
  .getByRole("button", { name: "Reserve tickets", exact: true })
  .click();
await expect(page).toHaveURL(/\/bookings\//);
await page.getByRole("button", { name: "Continue to checkout" }).click();
await page.getByRole("button", { name: "Simulate successful payment" }).click();
await expect(
  page.locator(".status-grid").getByText("confirmed", { exact: true }),
).toBeVisible();
await page.getByRole("link", { name: /Ticket 1/ }).click();
await expect(
  page.getByRole("img", { name: "Your ticket QR code" }),
).toBeVisible();
await capture("ticket");
await page.getByRole("button", { name: "Log out" }).click();
await expect(
  page.getByRole("link", { name: "Sign in", exact: true }),
).toBeVisible();
await login("organizer@ticketflow.local");
await page.goto("/organizer/events/" + event.id);
await expect(page.getByRole("table")).toBeVisible();
await capture("organizer");
await context.close();
await browser.close();
await setup.dispose();
await fs.writeFile('artifacts/review-measurements.json',JSON.stringify(measurements,null,2));
console.log("Review screenshots captured from document top.");
