import { StripeTest } from "../src/payments/provider";
import { config } from "../src/infra/config";
import { assert } from "../src/infra/common";
async function main() {
  assert(
    config.PAYMENT_PROVIDER === "stripe_test" &&
      config.STRIPE_SECRET_KEY?.startsWith("sk_test_"),
    400,
    "EXPLICIT_STRIPE_TEST_CONFIGURATION_REQUIRED",
  );
  const adapter = new StripeTest();
  await adapter.verifyAccount();
  const sessions = await adapter.stripe.checkout.sessions.list({ limit: 1 });
  assert(!sessions.data.some((s) => s.livemode), 400, "LIVE_CONTEXT_REJECTED");
  console.log(
    JSON.stringify({
      stripe_test_account_verified: true,
      reachable: true,
      remote_purchase_exercised: false,
    }),
  );
}
void main().catch(() => {
  console.error(
    "Stripe test smoke failed; check explicit test credentials/account/network",
  );
  process.exitCode = 1;
});
