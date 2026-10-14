import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowUpRight, Clock3, RefreshCw, Ticket } from "lucide-react";
import { api, checkoutDestination, type Model } from "../api/client";
import { useCommand } from "../api/commands";
import { money, reasonText } from "../api/format";
import { queryClient, useSession } from "../api/session";
import {
  Badge,
  ConfirmDialog,
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
  Pagination,
} from "../components/ui";

export function Bookings() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const bookings = useQuery({
    queryKey: ["bookings", user?.id, page],
    queryFn: ({ signal }) =>
      api("/bookings", "get", { query: { page, page_size: 12 }, signal }),
  });
  return (
    <>
      <PageHeading
        title="Your good plans."
        description="Everything you’re looking forward to, in one place."
      >
        <Link className="button secondary" to="/events">
          Find another event <ArrowUpRight size={18} />
        </Link>
      </PageHeading>
      {bookings.isPending && <Loading>Finding your bookings…</Loading>}
      <ErrorNotice
        error={bookings.error}
        retry={() => void bookings.refetch()}
      />
      {bookings.data?.items.length === 0 && (
        <Empty title="Your calendar has room.">
          <p>Find something worth showing up for.</p>
          <Link className="button" to="/events">
            Discover events
          </Link>
        </Empty>
      )}
      <div className="booking-list">
        {bookings.data?.items.map((booking) => (
          <Link
            className="booking-row"
            to={`/bookings/${booking.id}`}
            key={booking.id}
          >
            <div className="booking-icon">
              <Ticket strokeWidth={1.5} />
            </div>
            <div className="booking-row-title">
              <h2>{booking.event.title}</h2>
              <p>
                {booking.quantity} × {booking.category.name}
              </p>
            </div>
            <Badge value={booking.state} />
            <span className="booking-price">
              {money(booking.total_minor, booking.currency)}
            </span>
            <ArrowUpRight className="booking-arrow" size={22} />
          </Link>
        ))}
      </div>
      {bookings.data && (
        <Pagination
          page={page}
          pageSize={12}
          total={bookings.data.pagination.total}
          change={(next) => setParams({ page: String(next) })}
        />
      )}
    </>
  );
}
function useCountdown(
  booking: Model<"Booking"> | undefined,
  refresh: () => void,
) {
  const [now, setNow] = useState(Date.now());
  const clock = useRef({ server: 0, received: 0, expiry: 0, notified: false });
  useEffect(() => {
    if (booking)
      clock.current = {
        server: Date.parse(booking.server_time),
        received: Date.now(),
        expiry: Date.parse(booking.expires_at),
        notified: false,
      };
  }, [booking]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = booking
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(booking.expires_at) -
            (clock.current.server + now - clock.current.received)) /
            1000,
        ),
      )
    : 0;
  useEffect(() => {
    if (
      booking?.state === "RESERVED" &&
      remaining <= 0 &&
      !clock.current.notified
    ) {
      clock.current.notified = true;
      refresh();
    }
  }, [booking?.state, remaining, refresh]);
  return remaining;
}
function useBoundedPolling(id: string, pending: boolean, refresh: () => void) {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!pending) return;
    const end = Date.now() + 60000;
    const timer = setInterval(() => {
      if (Date.now() >= end) {
        setTimedOut(true);
        clearInterval(timer);
      } else refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [id, pending, refresh]);
  return timedOut;
}
export function BookingDetail({ returned = false }: { returned?: boolean }) {
  const params = useParams();
  const [search] = useSearchParams();
  const id = returned ? search.get("booking_id") || "" : params.id || "";
  const navigate = useNavigate();
  const { user } = useSession();
  const [confirmation, setConfirmation] = useState<"cancel" | "refund" | null>(
    null,
  );
  const booking = useQuery({
    queryKey: ["booking", user?.id, id],
    enabled: Boolean(id),
    queryFn: ({ signal }) =>
      api("/bookings/{id}", "get", { params: { id }, signal }),
  });
  const data = booking.data;
  const checkout = useCommand(`checkout:${user?.id}:${id}`);
  const cancel = useCommand(`cancel:${user?.id}:${id}`);
  const refund = useCommand(`refund:${user?.id}:${id}`);
  const remaining = useCountdown(data, booking.refetch);
  const pending = Boolean(
    data &&
    ((data.state === "RESERVED" && returned && data.payment.state === null) ||
      data.payment.state === "PENDING" ||
      data.payment.state === "CREATED" ||
      data.state === "REFUND_PENDING" ||
      (data.refund && ["REQUESTED", "PROCESSING"].includes(data.refund.state))),
  );
  const timedOut = useBoundedPolling(id, pending, booking.refetch);
  const tickets = useQuery({
    queryKey: ["booking-tickets", user?.id, id],
    enabled: Boolean(data?.tickets.count),
    queryFn: ({ signal }) =>
      api("/bookings/{id}/tickets", "get", { params: { id }, signal }),
  });
  async function pay() {
    const result = await checkout.execute({}, (key) =>
      api("/bookings/{id}/checkout", "post", { params: { id }, body: {}, key }),
    );
    if (result) {
      await booking.refetch();
      if (result.status === "ready") {
        try {
          const destination = checkoutDestination(result);
          if (result.mode === "simulator") navigate(destination);
          else location.assign(destination);
        } catch (error) {
          await checkout.execute({}, () => Promise.reject(error));
        }
      }
    }
  }
  async function confirm() {
    const command = confirmation === "cancel" ? cancel : refund;
    const result = await command.execute<unknown>({}, (key) =>
      confirmation === "cancel"
        ? api("/bookings/{id}/cancel", "post", {
            params: { id },
            body: {},
            key,
          })
        : api("/bookings/{id}/refund", "post", {
            params: { id },
            body: {},
            key,
          }),
    );
    if (result) setConfirmation(null);
    await Promise.all([
      booking.refetch(),
      queryClient.invalidateQueries({ queryKey: ["bookings"] }),
      queryClient.invalidateQueries({ queryKey: ["booking-tickets"] }),
      queryClient.invalidateQueries({ queryKey: ["ticket"] }),
    ]);
  }
  if (!id)
    return (
      <Empty title="There’s no booking to open.">
        <Link to="/bookings">View your bookings</Link>
      </Empty>
    );
  if (booking.isPending)
    return <Loading>Checking your booking with the server…</Loading>;
  if (!data)
    return (
      <ErrorNotice error={booking.error} retry={() => void booking.refetch()} />
    );
  const reserved = data.state === "RESERVED";
  const busy = checkout.running || cancel.running || refund.running;
  return (
    <>
      <Link className="back-link" to="/bookings">
        <ArrowLeft size={16} aria-hidden="true" /> My bookings
      </Link>
      <PageHeading
        title={data.event.title}
        description={`${data.quantity} × ${data.category.name}`}
      >
        <Badge value={data.state} />
      </PageHeading>
      {returned && (
        <div className="notice" role="status">
          {data.state === "CONFIRMED"
            ? "Your payment is verified. You’re going!"
            : pending
              ? timedOut
                ? "Still processing. Automatic updates have stopped; refresh below to check again."
                : "Checking your payment. Your booking is confirmed only when the server verifies it."
              : "Here is the latest verified booking state."}
        </div>
      )}
      <div className="booking-detail-grid">
        <section className="receipt">
          <div className="receipt-header">
            <Ticket size={28} strokeWidth={1.5} />
            <span>Your booking</span>
          </div>
          <dl className="receipt-lines">
            <div>
              <dt>Ticket category</dt>
              <dd>{data.category.name}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{data.quantity}</dd>
            </div>
            <div>
              <dt>Price per ticket</dt>
              <dd>{money(data.unit_price_minor, data.currency)}</dd>
            </div>
            <div className="receipt-total">
              <dt>Total</dt>
              <dd>{money(data.total_minor, data.currency)}</dd>
            </div>
          </dl>
          {reserved && (
            <div
              className="hold-clock"
              role="timer"
              aria-label="Estimated hold time remaining"
            >
              <Clock3 size={21} />
              <span>
                {remaining > 0
                  ? "Your place is held for"
                  : "Checking whether your hold expired"}
              </span>
              <strong>
                {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, "0")}
              </strong>
            </div>
          )}
          <small className="muted">Booking reference {data.id}</small>
          <Link className="text-button" to={`/events/${data.event.id}`}>
            View event <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="booking-actions">
          <h2>
            {data.state === "CONFIRMED"
              ? "You’re on the list."
              : data.state === "REFUNDED"
                ? "Your refund is complete."
                : data.state === "REFUND_PENDING"
                  ? "Your refund is underway."
                  : reserved
                    ? "Make it a plan."
                    : "Your latest booking status."}
          </h2>
          <div className="status-grid">
            <div>
              <span>Booking</span>
              <Badge value={data.state} />
            </div>
            <div>
              <span>Payment</span>
              <Badge value={data.payment.state} />
            </div>
            <div>
              <span>Refund</span>
              <Badge value={data.refund?.state || null} />
            </div>
            <div>
              <span>Ticket artwork</span>
              <Badge value={data.tickets.artifact_status} />
            </div>
          </div>
          {data.payment.reconciliation_required && (
            <p className="notice">
              Your payment needs reconciliation. Keep this booking reference and
              refresh later; do not start another payment.
            </p>
          )}
          {data.refund && (
            <p className="muted">
              Refund reason: {data.refund.reason.replaceAll("_", " ")}. Tickets
              stay unusable while the refund is pending.
            </p>
          )}
          <ErrorNotice error={checkout.error || cancel.error || refund.error} />
          <div className="actions vertical">
            {reserved && (
              <>
                <button
                  className="button"
                  disabled={
                    busy ||
                    !data.allowed_actions.checkout.allowed ||
                    remaining <= 0
                  }
                  onClick={() => void pay()}
                >
                  {checkout.running
                    ? "Opening checkout…"
                    : checkout.uncertain
                      ? "Retry same checkout"
                      : "Continue to checkout"}
                  <ArrowUpRight size={18} />
                </button>
                {!data.allowed_actions.checkout.allowed && (
                  <small>
                    {reasonText[data.allowed_actions.checkout.reason || ""] ||
                      "Checkout is currently unavailable."}
                  </small>
                )}
                <button
                  className="button secondary"
                  disabled={busy || !data.allowed_actions.cancel.allowed}
                  onClick={() => setConfirmation("cancel")}
                >
                  Cancel reservation
                </button>
              </>
            )}
            {["CONFIRMED", "REFUND_PENDING", "REFUNDED"].includes(
              data.state,
            ) && (
              <>
                <button
                  className="button secondary"
                  disabled={busy || !data.allowed_actions.refund.allowed}
                  onClick={() => setConfirmation("refund")}
                >
                  {refund.uncertain ? "Retry same refund" : "Request refund"}
                </button>
                {!data.allowed_actions.refund.allowed && (
                  <small>
                    {reasonText[data.allowed_actions.refund.reason || ""] ||
                      "A refund is currently unavailable."}
                  </small>
                )}
              </>
            )}
            <button
              className="text-button"
              disabled={booking.isFetching}
              onClick={() => void booking.refetch()}
            >
              <RefreshCw size={16} />{" "}
              {booking.isFetching ? "Checking…" : "Refresh status"}
            </button>
          </div>
          {pending && timedOut && !returned && (
            <p className="notice" role="status">
              Still processing. Use Refresh status to check again.
            </p>
          )}
        </section>
      </div>
      {data.tickets.count > 0 && (
        <section className="ticket-collection">
          <h2>Your tickets.</h2>
          <ErrorNotice
            error={tickets.error}
            retry={() => void tickets.refetch()}
          />
          {tickets.isPending && <Loading>Getting your tickets…</Loading>}
          <div className="ticket-list">
            {tickets.data?.items.map((ticket, index) => (
              <Link
                className="ticket-link"
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
              >
                <Ticket size={26} />
                <div>
                  <strong>Ticket {index + 1}</strong>
                  <span>{data.category.name}</span>
                </div>
                <Badge value={ticket.state} />
                <ArrowUpRight size={20} />
              </Link>
            ))}
          </div>
        </section>
      )}
      {confirmation && (
        <ConfirmDialog
          title={
            confirmation === "refund"
              ? "Request a refund?"
              : "Let this reservation go?"
          }
          description={
            confirmation === "refund"
              ? "Your tickets will be suspended while the server processes your refund. Money is returned only after verified provider success."
              : "Your reserved tickets will be released. You’ll need a new reservation if you change your mind."
          }
          action={
            confirmation === "refund" ? "Request refund" : "Cancel reservation"
          }
          busy={cancel.running || refund.running}
          close={() => setConfirmation(null)}
          confirm={() => void confirm()}
        />
      )}
    </>
  );
}
