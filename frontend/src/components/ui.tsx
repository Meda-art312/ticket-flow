import { useEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw, Ticket, X } from "lucide-react";
import { ApiError } from "../api/client";
import { reasonText, dateParts } from "../api/format";

export function ErrorNotice({
  error,
  retry,
}: {
  error: Error | null;
  retry?: () => void;
}) {
  if (!error) return null;
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div className="notice error" role="alert">
      <strong>
        {apiError?.code === "CONTRACT_MISMATCH"
          ? "An API update needs attention"
          : "Something needs your attention"}
      </strong>
      <p>
        {apiError
          ? reasonText[apiError.code] || apiError.message
          : error.message}
      </p>
      {apiError?.fields?.map((field) => (
        <p key={field.field}>
          {field.field.replaceAll("_", " ")}: {field.message}
        </p>
      ))}
      {apiError?.requestId && <small>Reference: {apiError.requestId}</small>}
      {retry && (
        <button className="text-button" onClick={retry}>
          <RefreshCw size={16} /> Try again
        </button>
      )}
    </div>
  );
}
export function Loading({
  children = "Getting things ready…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="loading" role="status">
      <span className="loader" />
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Ticket size={30} strokeWidth={1.5} />
      <h2>{title}</h2>
      <div>{children}</div>
    </div>
  );
}
export function Badge({ value }: { value: string | null }) {
  const text = value ? value.toLowerCase().replaceAll("_", " ") : "not started";
  const tone =
    value &&
    [
      "CONFIRMED",
      "VALID",
      "READY",
      "SUCCEEDED",
      "PUBLISHED",
      "admitted",
    ].includes(value)
      ? "positive"
      : value && ["FAILED", "VOID", "CANCELED", "EXPIRED"].includes(value)
        ? "negative"
        : "neutral";
  return <span className={`badge ${tone}`}>{text}</span>;
}
export function PageHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function Pagination({
  page,
  pageSize,
  total,
  change,
}: {
  page: number;
  pageSize: number;
  total: number;
  change: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        className="button secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <button
        className="button secondary"
        disabled={page * pageSize >= total}
        onClick={() => change(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
export function Poster({
  title,
  category,
  startsAt,
  timezone,
  variant = 0,
  large = false,
}: {
  title: string;
  category: string;
  startsAt: string;
  timezone: string;
  variant?: number;
  large?: boolean;
}) {
  const parts = dateParts(startsAt, timezone);
  return (
    <div
      className={`poster poster-${variant % 4} ${large ? "poster-large" : ""}`}
      aria-hidden="true"
    >
      <div className="poster-top">
        <span>{category}</span>
        <span>Live / In person</span>
      </div>
      <div className="poster-title">{title}</div>
      <div className="poster-bottom">
        <span className="poster-date">
          {parts.day}
          <small>{parts.month}</small>
        </span>
        <span className="poster-emblem">
          <Ticket strokeWidth={1} />
        </span>
        <span>
          Be
          <br />
          there.
        </span>
      </div>
    </div>
  );
}
export function ConfirmDialog({
  title,
  description,
  action,
  busy,
  close,
  confirm,
}: {
  title: string;
  description: string;
  action: string;
  busy: boolean;
  close: () => void;
  confirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-description"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else close();
      }}
    >
      <button
        className="icon-button dialog-close"
        aria-label="Close confirmation"
        disabled={busy}
        onClick={close}
      >
        <X size={20} />
      </button>
      <h2 id="dialog-title">{title}</h2>
      <p id="dialog-description">{description}</p>
      <div className="actions">
        <button
          autoFocus
          className="button secondary"
          disabled={busy}
          onClick={close}
        >
          Keep it
        </button>
        <button className="button danger" disabled={busy} onClick={confirm}>
          {busy ? "Working…" : action}
        </button>
      </div>
    </dialog>
  );
}
export function Arrow() {
  return <ArrowUpRight aria-hidden="true" size={20} />;
}
