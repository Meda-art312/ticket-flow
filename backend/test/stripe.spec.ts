import { randomUUID } from "node:crypto";
import { StripeTest } from "../src/payments/provider";
import { config } from "../src/infra/config";
describe("Stripe SDK raw-body contract without remote credentials", () => {
  it("verifies exact bytes, test context, amount and association fields", () => {
    config.STRIPE_SECRET_KEY = "sk_test_non_remote_signature_fixture";
    config.STRIPE_WEBHOOK_SECRET = randomUUID() + randomUUID();
    config.STRIPE_ACCOUNT_ID = "acct_signature_fixture";
    const adapter = new StripeTest(),
      attempt = randomUUID();
    const event = {
      id: "evt_signature_fixture",
      object: "event",
      type: "checkout.session.completed",
      livemode: false,
      account: config.STRIPE_ACCOUNT_ID,
      data: {
        object: {
          id: "cs_signature_fixture",
          payment_status: "paid",
          client_reference_id: attempt,
          metadata: { attempt_id: attempt },
          payment_intent: "pi_signature_fixture",
          amount_total: 1500,
          currency: "usd",
        },
      },
    };
    const raw = JSON.stringify(event),
      signature = adapter.stripe.webhooks.generateTestHeaderString({
        payload: raw,
        secret: config.STRIPE_WEBHOOK_SECRET,
      });
    expect(adapter.verify(Buffer.from(raw), signature)).toEqual({
      session_id: "cs_signature_fixture",
      association_id: attempt,
      event_id: event.id,
      attempt_id: attempt,
      kind: "success",
      payment_id: "pi_signature_fixture",
      amount_minor: 1500,
      currency: "USD",
    });
    expect(() => adapter.verify(Buffer.from(raw + " "), signature)).toThrow(
      "INVALID_SIGNATURE",
    );
    const live = JSON.stringify({ ...event, livemode: true });
    expect(() =>
      adapter.verify(
        Buffer.from(live),
        adapter.stripe.webhooks.generateTestHeaderString({
          payload: live,
          secret: config.STRIPE_WEBHOOK_SECRET!,
        }),
      ),
    ).toThrow("PROVIDER_CONTEXT_MISMATCH");
  });
});
