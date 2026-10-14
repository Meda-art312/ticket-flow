import type { components } from "./schema";
export function allowedCheckoutDestination(
  checkout: components["schemas"]["Checkout"],
  origin: string,
): string | null {
  if (checkout.status !== "ready" || !checkout.checkout_url) return null;
  let url: URL;
  try {
    url = new URL(checkout.checkout_url);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (
    checkout.mode === "simulator" &&
    url.origin === origin &&
    /^\/demo\/checkout\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      url.pathname,
    ) &&
    !url.search &&
    !url.hash
  )
    return url.pathname;
  if (
    checkout.mode === "stripe_test" &&
    url.protocol === "https:" &&
    url.hostname === "checkout.stripe.com" &&
    !url.port
  )
    return url.href;
  return null;
}
