import assert from "node:assert/strict";
import * as validators from "../src/api/validators.js";
import { allowedCheckoutDestination } from "../src/api/checkout.ts";
import { money } from "../src/api/format.ts";
const id = "00000000-0000-4000-8000-000000000001";
const checkout = {
  attempt_id: id,
  status: "ready",
  checkout_url: `http://localhost:8080/demo/checkout/${id}`,
  mode: "simulator",
};
assert.equal(
  allowedCheckoutDestination(checkout, "http://localhost:8080"),
  `/demo/checkout/${id}`,
);
for (const url of [
  "javascript:alert(1)",
  "https://attacker.test/demo/checkout/" + id,
  "http://user@localhost:8080/demo/checkout/" + id,
  checkout.checkout_url + "?redirect=https://attacker.test",
])
  assert.equal(
    allowedCheckoutDestination(
      { ...checkout, checkout_url: url },
      "http://localhost:8080",
    ),
    null,
  );
assert.equal(
  allowedCheckoutDestination(
    {
      ...checkout,
      mode: "stripe_test",
      checkout_url: "https://checkout.stripe.com/c/pay/test_123",
    },
    "http://localhost:8080",
  ),
  "https://checkout.stripe.com/c/pay/test_123",
);
assert.equal(
  allowedCheckoutDestination(
    {
      ...checkout,
      mode: "stripe_test",
      checkout_url: "https://checkout.stripe.com.attacker.test/x",
    },
    "http://localhost:8080",
  ),
  null,
);
assert.equal(money(1250, "USD"), "$12.50");
assert.equal(money(100, "JPY"), "¥100");
assert.ok(money(1250, "KWD").includes("1.250"));
assert.equal(
  validators.v33({
    id,
    booking_id: id,
    state: "VALID",
    artifact_status: "PENDING",
    qr_svg: null,
    check_in_token: "opaque-credential",
  }),
  true,
);
assert.equal(
  validators.v33({
    id,
    booking_id: id,
    state: "MAGICALLY_PAID",
    artifact_status: "READY",
    qr_svg: null,
    check_in_token: "opaque-credential",
  }),
  false,
);
assert.equal(validators.v13({ title: "Untrusted extra object" }), false);
console.log(
  "Client boundary checks passed: redirect allowlist, currency exponents and unknown contract states.",
);
