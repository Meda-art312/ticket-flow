export function money(minor: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** digits);
}
export function date(
  value: string,
  timezone = "UTC",
  options: Intl.DateTimeFormatOptions = {},
) {
  try {
    return new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
      ...options,
    }).format(new Date(value));
  } catch {
    return `${new Date(value).toISOString()} UTC`;
  }
}
export function dateParts(value: string, timezone: string) {
  return {
    month: date(value, timezone, {
      month: "short",
      day: undefined,
      year: undefined,
    }),
    day: date(value, timezone, {
      day: "2-digit",
      month: undefined,
      year: undefined,
    }),
  };
}
export const reasonText: Record<string, string> = {
  INVALID_TICKET:
    "This credential is invalid or belongs to a different event. Check the ticket and event.",
  OUTSIDE_ENTRY_WINDOW:
    "Admission is not open for this event right now. Check the event schedule.",
  VENUE_REFERENCED:
    "This venue is used by an event and cannot be edited. Create a new venue for different details.",
  EVENT_NOT_FOUND:
    "This event does not exist or is not accessible to your account.",
  BOOKING_NOT_FOUND:
    "This booking does not exist or belongs to another account.",
  TICKET_NOT_FOUND: "This ticket does not exist or belongs to another account.",
  CHECKOUT_SESSION_NOT_FOUND:
    "This checkout does not exist or belongs to another account.",
  FORBIDDEN: "Your account does not have permission for this action.",
  UNTRUSTED_ORIGIN:
    "The app address does not match the backend configuration. Check FRONTEND_ORIGIN with your operator.",
  RATE_LIMITED: "Too many attempts. Wait a minute before trying again.",
  REFRESH_REUSE_OR_EXPIRED:
    "Your session expired or was used in another refresh. Sign in again.",
  HOLD_INELIGIBLE: "This hold is no longer eligible for payment.",
  NOT_RESERVED: "Only an active reservation can be canceled.",
  REFUND_INELIGIBLE:
    "Refunds require an unused ticket and an event more than 24 hours away.",
  REFUND_REQUIRES_REVIEW:
    "A previous refund failed. Contact the organizer for review.",
  INVENTORY_UNAVAILABLE:
    "There aren’t enough tickets left. Try a smaller quantity or another category.",
  EVENT_NOT_ON_SALE: "Tickets are not on sale right now.",
  TICKET_UNUSABLE: "This ticket cannot be admitted in its current state.",
  SESSION_EXPIRED: "Your session ended. Sign in again.",
};
