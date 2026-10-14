import Stripe from "stripe";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { Db } from "../infra/db";
import { assert } from "../infra/common";
import { config } from "../infra/config";
export type Evidence = {
  terminal?: boolean;
  correlation_id?: string;
  session_id?: string;
  association_id?: string;
  event_id: string;
  attempt_id: string;
  kind: "success" | "failure" | "refund_success" | "refund_failure";
  payment_id: string;
  amount_minor: number;
  currency: string;
  refund_id?: string;
  operation_id?: string;
};
export interface PaymentProvider {
  checkout(attempt: any): Promise<{ session_id: string; url: string }>;
  retrieve(attempt: any): Promise<Evidence | null>;
  refund(
    refund: any,
    payment: any,
  ): Promise<{ id: string; status: "succeeded" | "pending" | "failed" }>;
  retrieveRefund(
    refund: any,
  ): Promise<{ id: string; status: "succeeded" | "pending" | "failed" } | null>;
  close(attempt: any): Promise<void>;
  verify(raw: Buffer, signature: string): Evidence | null;
}
export class Simulator implements PaymentProvider {
  constructor(private db: Db) {}
  async fault(operation: string) {
    return (
      await this.db.one(
        "DELETE FROM simulator_operations WHERE operation_key=$1 AND kind='fault' RETURNING result",
        ["fault:" + operation],
      )
    )?.result?.fault;
  }
  sign(raw: Buffer) {
    return createHmac("sha256", config.SIMULATOR_SECRET!)
      .update(raw)
      .digest("hex");
  }
  verify(raw: Buffer, sig: string) {
    const expected = Buffer.from(this.sign(raw));
    const actual = Buffer.from(sig);
    assert(
      expected.length === actual.length && timingSafeEqual(expected, actual),
      400,
      "INVALID_SIGNATURE",
    );
    return JSON.parse(raw.toString()) as Evidence;
  }
  async checkout(a: any) {
    const result = {
      session_id: a.id,
      url: `${config.FRONTEND_ORIGIN}/demo/checkout/${a.id}`,
    };
    await this.db.rows(
      "INSERT INTO simulator_operations(operation_key,kind,result) VALUES($1,'checkout',$2) ON CONFLICT DO NOTHING",
      [a.operation_key, JSON.stringify(result)],
    );
    await this.db.rows(
      "INSERT INTO demo_sessions(id,attempt_id) VALUES($1,$1) ON CONFLICT DO NOTHING",
      [a.id],
    );
    if ((await this.fault(a.operation_key)) === "timeout_after_success")
      throw new Error("Ambiguous simulator timeout");
    return (
      await this.db.one(
        "SELECT result FROM simulator_operations WHERE operation_key=$1",
        [a.operation_key],
      )
    ).result;
  }
  async retrieve(a: any) {
    const s = await this.db.one(
      "SELECT outcome FROM demo_sessions WHERE attempt_id=$1",
      [a.id],
    );
    return s?.outcome ? this.evidence(a, s.outcome) : null;
  }
  evidence(a: any, outcome: string, event_id = `demo:${a.id}`): Evidence {
    return {
      event_id,
      attempt_id: a.id,
      kind: outcome === "success" ? "success" : "failure",
      payment_id: `sim_pay_${a.id}`,
      amount_minor: a.amount_minor,
      currency: a.currency,
    };
  }
  async refund(r: any, _p: any) {
    const fault = await this.fault(r.operation_key);
    const result = {
      id: `sim_ref_${r.id}`,
      status:
        fault === "refund_failure"
          ? ("failed" as const)
          : ("succeeded" as const),
    };
    await this.db.rows(
      "INSERT INTO simulator_operations(operation_key,kind,result) VALUES($1,'refund',$2) ON CONFLICT DO NOTHING",
      [r.operation_key, JSON.stringify(result)],
    );
    if (fault === "timeout_after_success")
      throw new Error("Ambiguous simulator timeout");
    return (
      await this.db.one(
        "SELECT result FROM simulator_operations WHERE operation_key=$1",
        [r.operation_key],
      )
    ).result;
  }
  async retrieveRefund(r: any) {
    return (
      (
        await this.db.one(
          "SELECT result FROM simulator_operations WHERE operation_key=$1",
          [r.operation_key],
        )
      )?.result || null
    );
  }
  async close(_a: any) {}
}
export class StripeTest implements PaymentProvider {
  readonly stripe: Stripe;
  constructor() {
    this.stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
      maxNetworkRetries: 1,
      timeout: 10000,
    });
  }
  async checkout(a: any) {
    const s = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: a.id,
        metadata: { attempt_id: a.id },
        payment_intent_data: { metadata: { attempt_id: a.id } },
        line_items: [
          {
            price_data: {
              currency: a.currency.toLowerCase(),
              unit_amount: a.amount_minor,
              product_data: { name: "TicketFlow booking" },
            },
            quantity: 1,
          },
        ],
        success_url: `${config.FRONTEND_ORIGIN}/checkout/return?booking_id=${a.booking_id}`,
        cancel_url: `${config.FRONTEND_ORIGIN}/checkout/return?booking_id=${a.booking_id}`,
      },
      { idempotencyKey: a.operation_key },
    );
    return { session_id: s.id, url: s.url! };
  }
  async retrieve(a: any): Promise<Evidence | null> {
    if (!a.provider_session_id) return null;
    const s = await this.stripe.checkout.sessions.retrieve(
      a.provider_session_id,
      { expand: ["payment_intent"] },
    );
    const paid = ["paid", "no_payment_required"].includes(s.payment_status);
    const intent =
      typeof s.payment_intent === "object" ? s.payment_intent : null;
    const terminal =
      s.status === "expired" ||
      (s.status === "complete" &&
        intent &&
        ["canceled", "requires_payment_method"].includes(intent.status) &&
        !!intent.last_payment_error);
    if (!paid && !terminal) return null;
    assert(
      s.client_reference_id === a.id && s.metadata?.attempt_id === a.id,
      409,
      "PAYMENT_ASSOCIATION_MISMATCH",
    );
    return {
      event_id: `reconcile:${s.id}:${paid ? "paid" : "failed"}`,
      session_id: s.id,
      association_id: s.client_reference_id || "",
      attempt_id: a.id,
      kind: paid ? "success" : "failure",
      ...(!paid ? { terminal: true } : {}),
      payment_id:
        typeof s.payment_intent === "string"
          ? s.payment_intent
          : s.payment_intent?.id || `${paid ? "zero" : "unpaid"}:${s.id}`,
      amount_minor: s.amount_total!,
      currency: s.currency!.toUpperCase(),
    };
  }
  async refund(r: any, p: any) {
    if (r.amount_minor === 0)
      return { id: `zero_ref_${r.id}`, status: "succeeded" as const };
    const result = await this.stripe.refunds.create(
      {
        payment_intent: p.provider_payment_id,
        amount: r.amount_minor,
        metadata: { refund_id: r.id, attempt_id: p.id },
      },
      { idempotencyKey: r.operation_key },
    );
    assert(
      result.amount === r.amount_minor &&
        result.currency.toUpperCase() === p.currency &&
        result.payment_intent === p.provider_payment_id,
      409,
      "REFUND_ASSOCIATION_MISMATCH",
    );
    return {
      id: result.id,
      status:
        result.status === "succeeded"
          ? ("succeeded" as const)
          : result.status === "failed" || result.status === "canceled"
            ? ("failed" as const)
            : ("pending" as const),
    };
  }
  async retrieveRefund(r: any) {
    if (r.amount_minor === 0 && r.provider_refund_id)
      return { id: r.provider_refund_id, status: "succeeded" as const };
    if (!r.provider_refund_id) return null;
    const result = await this.stripe.refunds.retrieve(r.provider_refund_id);
    assert(
      result.amount === r.amount_minor &&
        (!r.currency || result.currency.toUpperCase() === r.currency) &&
        (!r.provider_payment_id ||
          result.payment_intent === r.provider_payment_id),
      409,
      "REFUND_ASSOCIATION_MISMATCH",
    );
    return {
      id: result.id,
      status:
        result.status === "succeeded"
          ? ("succeeded" as const)
          : result.status === "failed" || result.status === "canceled"
            ? ("failed" as const)
            : ("pending" as const),
    };
  }
  async close(a: any) {
    if (a.provider_session_id)
      await this.stripe.checkout.sessions.expire(a.provider_session_id);
  }
  verify(raw: Buffer, signature: string): Evidence | null {
    let e: Stripe.Event;
    try {
      e = this.stripe.webhooks.constructEvent(
        raw,
        signature,
        config.STRIPE_WEBHOOK_SECRET!,
      );
    } catch {
      assert(false, 400, "INVALID_SIGNATURE");
    }
    assert(
      !e.livemode && (!e.account || e.account === config.STRIPE_ACCOUNT_ID),
      400,
      "PROVIDER_CONTEXT_MISMATCH",
    );
    if (
      e.type === "checkout.session.expired" ||
      e.type === "checkout.session.async_payment_failed"
    ) {
      const s = e.data.object as Stripe.Checkout.Session;
      return {
        event_id: e.id,
        attempt_id: s.metadata?.attempt_id || "",
        session_id: s.id,
        association_id: s.client_reference_id || "",
        kind: "failure",
        terminal: true,
        payment_id:
          typeof s.payment_intent === "string"
            ? s.payment_intent
            : s.payment_intent?.id || `unpaid:${s.id}`,
        amount_minor: s.amount_total!,
        currency: s.currency!.toUpperCase(),
      };
    }
    if (
      e.type === "checkout.session.completed" ||
      e.type === "checkout.session.async_payment_succeeded"
    ) {
      const s = e.data.object as Stripe.Checkout.Session;
      if (!["paid", "no_payment_required"].includes(s.payment_status))
        return null;
      return {
        event_id: e.id,
        session_id: s.id,
        association_id: s.client_reference_id || "",
        attempt_id: s.metadata?.attempt_id || "",
        kind: "success",
        payment_id:
          typeof s.payment_intent === "string"
            ? s.payment_intent
            : s.payment_intent?.id || `zero:${s.id}`,
        amount_minor: s.amount_total!,
        currency: s.currency!.toUpperCase(),
      };
    }
    if (e.type === "payment_intent.payment_failed") {
      const p = e.data.object as Stripe.PaymentIntent;
      return {
        event_id: e.id,
        attempt_id: p.metadata.attempt_id || "",
        kind: "failure",
        terminal: false,
        payment_id: p.id,
        amount_minor: p.amount,
        currency: p.currency.toUpperCase(),
      };
    }
    if (e.type === "refund.updated" || e.type === "refund.created") {
      const r = e.data.object as Stripe.Refund;
      if (!["succeeded", "failed", "canceled"].includes(r.status || ""))
        return null;
      return {
        event_id: e.id,
        attempt_id: r.metadata?.attempt_id || "",
        operation_id: r.metadata?.refund_id,
        kind: r.status === "succeeded" ? "refund_success" : "refund_failure",
        payment_id: String(r.payment_intent),
        refund_id: r.id,
        amount_minor: r.amount,
        currency: r.currency.toUpperCase(),
      };
    }
    return null;
  }
  async verifyAccount() {
    const account = await this.stripe.accounts.retrieve();
    assert(
      account.id === config.STRIPE_ACCOUNT_ID,
      503,
      "PROVIDER_CONTEXT_MISMATCH",
    );
  }
}
export function provider(db: Db): PaymentProvider {
  return config.PAYMENT_PROVIDER === "simulator"
    ? new Simulator(db)
    : new StripeTest();
}
export const evidenceId = () => randomUUID();
