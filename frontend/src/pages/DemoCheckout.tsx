import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowUpRight, CreditCard, ShieldCheck } from "lucide-react";
import { api } from "../api/client";
import { useCommand } from "../api/commands";
import { money } from "../api/format";
import { queryClient, useSession } from "../api/session";
import { ErrorNotice, Loading } from "../components/ui";
export function DemoCheckout() {
  const { sessionId = "" } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const session = useQuery({
    queryKey: ["demo", user?.id, sessionId],
    queryFn: ({ signal }) =>
      api("/demo/checkout/{sessionId}", "get", {
        params: { sessionId },
        signal,
      }),
  });
  const complete = useCommand(`demo:${user?.id}:${sessionId}`);
  const [outcome, setOutcome] = useState<"success" | "decline" | null>(null);
  async function submit(value: "success" | "decline") {
    setOutcome(value);
    const body = { outcome: value };
    const result = await complete.execute(body, (key) =>
      api("/demo/checkout/{sessionId}/complete", "post", {
        params: { sessionId },
        body,
        key,
      }),
    );
    if (result && session.data) {
      await queryClient.invalidateQueries({ queryKey: ["booking"] });
      navigate(`/checkout/return?booking_id=${session.data.booking_id}`);
    }
  }
  if (session.isPending) return <Loading>Opening your demo checkout…</Loading>;
  if (!session.data)
    return (
      <ErrorNotice error={session.error} retry={() => void session.refetch()} />
    );
  const data = session.data;
  return (
    <div className="checkout-page">
      <section className="checkout-card">
        <div className="demo-label">
          <CreditCard size={20} /> Local payment simulation
        </div>
        <h1>
          Let’s make
          <br />
          it happen.
        </h1>
        <p>
          This is a demo checkout. No card details, real payment, or real money.
        </p>
        <div className="checkout-total">
          <span>Total from your booking</span>
          <strong>{money(data.amount_minor, data.currency)}</strong>
        </div>
        <ErrorNotice error={complete.error} />
        {data.status === "open" ? (
          <div className="actions vertical">
            <button
              className="button full"
              disabled={
                complete.running ||
                !data.allowed_outcomes.includes("success") ||
                (complete.uncertain && outcome !== "success")
              }
              onClick={() => void submit("success")}
            >
              {complete.running && outcome === "success"
                ? "Sending demo result…"
                : complete.uncertain
                  ? "Retry same success"
                  : "Simulate successful payment"}
              <ArrowUpRight size={18} />
            </button>
            <button
              className="button secondary full"
              disabled={
                complete.running ||
                !data.allowed_outcomes.includes("decline") ||
                (complete.uncertain && outcome !== "decline")
              }
              onClick={() => void submit("decline")}
            >
              Simulate declined payment
            </button>
          </div>
        ) : (
          <div className="notice">
            This demo session is complete.{" "}
            <Link to={`/checkout/return?booking_id=${data.booking_id}`}>
              Check your booking
            </Link>
            .
          </div>
        )}
        <p className="checkout-note">
          <ShieldCheck size={17} /> The backend verifies the result before
          issuing tickets.
        </p>
        <Link className="back-link" to={`/bookings/${data.booking_id}`}>
          <ArrowLeft size={16} aria-hidden="true" /> Back to booking
        </Link>
      </section>
    </div>
  );
}
