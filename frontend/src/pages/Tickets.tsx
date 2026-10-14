import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Copy, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { api } from "../api/client";
import { date } from "../api/format";
import { useSession } from "../api/session";
import { Badge, ErrorNotice, Loading } from "../components/ui";
export function TicketDetail() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const [copied, setCopied] = useState("");
  const ticket = useQuery({
    queryKey: ["ticket", user?.id, id],
    queryFn: ({ signal }) =>
      api("/tickets/{id}", "get", { params: { id }, signal }),
  });
  const booking = useQuery({
    queryKey: ["ticket-booking", user?.id, ticket.data?.booking_id],
    enabled: Boolean(ticket.data),
    queryFn: ({ signal }) =>
      api("/bookings/{id}", "get", {
        params: { id: ticket.data!.booking_id },
        signal,
      }),
  });
  const event = useQuery({
    queryKey: ["ticket-event", booking.data?.event.id],
    enabled: Boolean(booking.data),
    queryFn: ({ signal }) =>
      api("/events/{id}", "get", {
        params: { id: booking.data!.event.id },
        signal,
      }),
    retry: false,
  });
  const refreshTicket = ticket.refetch;
  useEffect(() => {
    if (ticket.data?.artifact_status !== "PENDING") return;
    const end = Date.now() + 60000;
    const timer = setInterval(() => {
      if (Date.now() >= end) clearInterval(timer);
      else void refreshTicket();
    }, 2000);
    return () => clearInterval(timer);
  }, [ticket.data?.artifact_status, refreshTicket]);
  if (ticket.isPending) return <Loading>Opening your ticket…</Loading>;
  if (!ticket.data)
    return (
      <ErrorNotice error={ticket.error} retry={() => void ticket.refetch()} />
    );
  const data = ticket.data;
  return (
    <>
      <Link className="back-link" to={`/bookings/${data.booking_id}`}>
        <ArrowLeft size={16} aria-hidden="true" /> Booking details
      </Link>
      <div className="ticket-page">
        <section className="admission-ticket">
          <div className="admission-top">
            <span className="brand">ticketflow.</span>
            <TicketIcon size={27} />
          </div>
          <h1>{booking.data?.event.title || "Your event ticket"}</h1>
          <p>{booking.data?.category.name || "Admission"}</p>
          {event.data && (
            <p className="muted">
              {date(event.data.starts_at, event.data.timezone, {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              <br />
              {event.data.venue.name} · {event.data.timezone}
            </p>
          )}
          <div className="ticket-qr">
            {data.artifact_status === "READY" && data.qr_svg ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data.qr_svg)}`}
                alt="Your ticket QR code"
                width={220}
                height={220}
              />
            ) : (
              <div role="status">
                <TicketIcon size={38} />
                <p>
                  {data.artifact_status === "FAILED"
                    ? "QR artwork could not be prepared."
                    : "Your QR artwork is being prepared."}
                </p>
                <p>You can still use the credential below.</p>
              </div>
            )}
          </div>
          <div className="ticket-state">
            <Badge value={data.state} />
            <Badge value={data.artifact_status} />
          </div>
          <p className="ticket-guidance">
            {data.state === "VALID"
              ? "Keep this ticket ready at the door. Your organizer will verify admission."
              : data.state === "CHECKED_IN"
                ? "This ticket has already been used for admission."
                : "This ticket cannot be used for admission."}
          </p>
          <div className="credential-block">
            <label>
              Check-in credential
              <textarea
                aria-label="Check-in credential"
                readOnly
                value={data.check_in_token}
                rows={2}
              />
            </label>
            <button
              className="button secondary full"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(data.check_in_token)
                  .then(() => setCopied("Credential copied."))
                  .catch(() =>
                    setCopied("Select and copy the credential above."),
                  );
                if (!navigator.clipboard)
                  setCopied("Select and copy the credential above.");
              }}
            >
              <Copy size={16} /> Copy credential
            </button>
            <span className="copy-status" role="status">
              {copied}
            </span>
          </div>
          <small className="muted">
            This credential admits one person. Share it only with the event
            organizer.
          </small>
        </section>
        <aside className="ticket-aside">
          <h2>
            One ticket.
            <br />A whole experience.
          </h2>
          <p>
            Show your QR code at the door, or copy the credential for manual
            check-in.
          </p>
          <p>
            Admission depends on the latest event, booking, and ticket status.
          </p>
          <button
            className="text-button"
            onClick={() => {
              void ticket.refetch();
              void booking.refetch();
            }}
          >
            <RefreshCw size={17} /> Refresh ticket
          </button>
          <ErrorNotice error={ticket.error} />
        </aside>
      </div>
    </>
  );
}
