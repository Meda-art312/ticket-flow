# Browser walkthrough

1. Start/seed the independent backend, then start frontend Compose. Open http://localhost:8080. Search by event title; Filters adds city/category/from-date. Open a card and choose a category and 1–6 tickets.
2. Sign in using backend-configured credentials or register. You return to your selection without automatically reserving. Press Reserve tickets deliberately. The booking displays the exact server price/total and estimated hold countdown.
3. Continue to checkout. In local mode, the page clearly labels payment simulation; choose success or decline. Confirmation comes from backend state, never the return address. If processing persists, use Refresh status after automatic updates stop.
4. Open an issued ticket. QR readiness and ticket usability are separate. Copy the private credential or show the QR. Unavailable artwork does not invent a failed purchase.
5. For a confirmed, unused booking more than 24 hours before its event, Request refund and review the confirmation. Watch refund progress independently of payment state. Pending refunds suspend ticket use. For an active reservation, Cancel reservation releases its hold through the backend.
6. Sign in in a separate browser profile/context as the configured organizer. Organizer → New venue → New event creates a draft. Add categories, review, then Publish. Published commercial details are locked; title/description remain editable. Sales are a simple category table.
7. Open the separate admission fixture (starts about one hour after seed), paste a customer ticket credential into Check in ticket. Repeat admission is reported clearly. The refund fixture is separate and starts about 72 hours after seed. Create fresh fixtures if seeded windows have elapsed.
8. Cancel an organizer event only after reviewing the dialog. Server-side release/refund processing is asynchronous. The UI never changes financial or stock facts itself.

Ambiguous connections preserve the command key and payload on the current page. Retry uses that same identity; double submission is disabled. After reload, retrieve your bookings and current state before any new command. Sign out before switching accounts. No passwords are supplied by this frontend or saved in its assets.
