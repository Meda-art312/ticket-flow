import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Plus, RefreshCw, ScanLine } from "lucide-react";
import { api, type Model } from "../api/client";
import { useCommand } from "../api/commands";
import { date, money } from "../api/format";
import { queryClient, useSession } from "../api/session";
import {
  Badge,
  ConfirmDialog,
  Empty,
  ErrorNotice,
  Loading,
  PageHeading,
} from "../components/ui";

const text = (data: FormData, name: string) =>
  String(data.get(name) || "").trim();
const number = (data: FormData, name: string) => Number(data.get(name));
const utc = (hours: number) =>
  new Date(Date.now() + hours * 3600000).toISOString().slice(0, 16);
function Field({
  name,
  label,
  value,
  type = "text",
  required = true,
  min,
  max,
  step,
}: {
  name: string;
  label: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        min={min}
        max={max}
        step={step}
      />
    </label>
  );
}
function VenueForm({
  venue,
  saved,
  close,
}: {
  venue?: Model<"Venue">;
  saved: () => void;
  close: () => void;
}) {
  const command = useCommand(`venue:${venue?.id || "new"}`);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const body = {
      name: text(data, "name"),
      address: text(data, "address"),
      city: text(data, "city"),
      country: text(data, "country").toUpperCase(),
      timezone: text(data, "timezone"),
      capacity: number(data, "capacity"),
    };
    const result = await command.execute(body, () =>
      venue
        ? api("/organizer/venues/{id}", "patch", {
            params: { id: venue.id },
            body,
          })
        : api("/organizer/venues", "post", { body }),
    );
    if (result) saved();
  }
  return (
    <section className="editor-section">
      <h2>{venue ? "Edit venue" : "A new place to gather."}</h2>
      <ErrorNotice error={command.error} />
      <form onSubmit={submit}>
        <fieldset
          disabled={command.running || command.uncertain}
          className="form-grid"
        >
          <Field name="name" label="Venue name" value={venue?.name} />
          <Field
            name="capacity"
            label="Venue capacity"
            type="number"
            min={1}
            max={1000000}
            value={venue?.capacity || 200}
          />
          <Field name="address" label="Street address" value={venue?.address} />
          <Field name="city" label="City" value={venue?.city} />
          <Field
            name="country"
            label="Country code (2 letters)"
            value={venue?.country || "EG"}
          />
          <Field
            name="timezone"
            label="Timezone (IANA)"
            value={venue?.timezone || "Africa/Cairo"}
          />
        </fieldset>
        <div className="actions">
          <button className="button" disabled={command.running}>
            {command.running ? "Saving…" : "Save venue"}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={command.running}
            onClick={close}
          >
            Close editor
          </button>
        </div>
      </form>
      {command.uncertain && (
        <p className="notice">
          Check the venue list before repeating this request. This endpoint has
          no command-idempotency guarantee.
        </p>
      )}
    </section>
  );
}
function EventForm({
  event,
  venues,
  saved,
  close,
}: {
  event?: Model<"Event">;
  venues: Model<"Venue">[];
  saved: (event: Model<"Event">) => void;
  close?: () => void;
}) {
  const command = useCommand(`event-edit:${event?.id || "new"}`);
  const frozen = Boolean(event && event.state !== "DRAFT");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const commercial = {
      category_label: text(data, "category_label"),
      venue_id: text(data, "venue_id"),
      starts_at: `${text(data, "starts_at")}:00Z`,
      ends_at: `${text(data, "ends_at")}:00Z`,
      sales_open_at: `${text(data, "sales_open_at")}:00Z`,
      sales_close_at: `${text(data, "sales_close_at")}:00Z`,
      timezone: text(data, "timezone"),
      capacity: number(data, "capacity"),
      currency: text(data, "currency").toUpperCase(),
    };
    const description = {
      title: text(data, "title"),
      description: text(data, "description"),
    };
    const body = { ...description, ...commercial };
    const result = await command.execute(frozen ? description : body, () =>
      event
        ? api("/organizer/events/{id}", "patch", {
            params: { id: event.id },
            body: frozen ? description : body,
          })
        : api("/organizer/events", "post", { body }),
    );
    if (result) saved(result);
  }
  return (
    <section className="editor-section">
      <h2>{event ? "Event details" : "Make something worth attending."}</h2>
      <ErrorNotice error={command.error} />
      {frozen && (
        <p className="notice">
          Published commercial details are locked. You can still edit the title
          and description.
        </p>
      )}
      <form onSubmit={submit}>
        <fieldset disabled={command.running || command.uncertain}>
          <label>
            Event title
            <input
              name="title"
              defaultValue={event?.title}
              required
              maxLength={200}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              defaultValue={event?.description}
              rows={4}
              required
              maxLength={10000}
            />
          </label>
          <fieldset disabled={frozen} className="form-grid">
            <label>
              Venue
              <select
                name="venue_id"
                aria-label="Venue"
                defaultValue={event?.venue_id || venues[0]?.id}
                required
              >
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <Field
              name="category_label"
              label="Event category"
              value={event?.category_label || "Music"}
            />
            <Field
              name="starts_at"
              label="Starts at (UTC)"
              type="datetime-local"
              value={event?.starts_at.slice(0, 16) || utc(72)}
            />
            <Field
              name="ends_at"
              label="Ends at (UTC)"
              type="datetime-local"
              value={event?.ends_at.slice(0, 16) || utc(75)}
            />
            <Field
              name="sales_open_at"
              label="Sales open (UTC)"
              type="datetime-local"
              value={event?.sales_open_at.slice(0, 16) || utc(-1)}
            />
            <Field
              name="sales_close_at"
              label="Sales close (UTC)"
              type="datetime-local"
              value={event?.sales_close_at.slice(0, 16) || utc(71)}
            />
            <Field
              name="timezone"
              label="Event display timezone (IANA)"
              value={event?.timezone || "Africa/Cairo"}
            />
            <Field
              name="capacity"
              label="Event capacity"
              type="number"
              min={1}
              max={1000000}
              value={event?.capacity || 100}
            />
            <Field
              name="currency"
              label="Currency code"
              value={event?.currency || "USD"}
            />
          </fieldset>
        </fieldset>
        <div className="actions">
          <button
            className="button"
            disabled={command.running || (!event && !venues.length)}
          >
            {command.running
              ? "Saving…"
              : event
                ? "Save event details"
                : "Create draft"}
          </button>
          {close && (
            <button className="button secondary" type="button" onClick={close}>
              Close editor
            </button>
          )}
        </div>
      </form>
      {command.uncertain && (
        <p className="notice">
          The outcome is uncertain. Refresh the event list before retrying this
          editor.
        </p>
      )}
    </section>
  );
}
export function Organizer() {
  const { user } = useSession();
  const [venueEditor, setVenueEditor] = useState<Model<"Venue"> | "new" | null>(
    null,
  );
  const [eventEditor, setEventEditor] = useState(false);
  const [archive, setArchive] = useState<Model<"Venue"> | null>(null);
  const venues = useQuery({
    queryKey: ["venues", user?.id],
    queryFn: ({ signal }) =>
      api("/organizer/venues", "get", { query: { page_size: 100 }, signal }),
  });
  const events = useQuery({
    queryKey: ["organizer-events", user?.id],
    queryFn: ({ signal }) =>
      api("/organizer/events", "get", { query: { page_size: 100 }, signal }),
  });
  const removal = useCommand(`archive-venue:${archive?.id}`);
  async function refresh() {
    await Promise.all([venues.refetch(), events.refetch()]);
  }
  return (
    <>
      <PageHeading
        title="Bring people together."
        description="Your spaces, your events, your kind of good time."
      >
        <button className="button" onClick={() => setEventEditor(!eventEditor)}>
          <Plus size={18} /> New event
        </button>
      </PageHeading>
      <ErrorNotice
        error={events.error || venues.error || removal.error}
        retry={() => void refresh()}
      />
      {(events.isPending || venues.isPending) && (
        <Loading>Opening your workspace…</Loading>
      )}
      {eventEditor &&
        (venues.data?.items.length ? (
          <EventForm
            venues={venues.data.items.filter((venue) => !venue.archived_at)}
            saved={(event) => {
              setEventEditor(false);
              void refresh();
              location.assign(`/organizer/events/${event.id}`);
            }}
            close={() => setEventEditor(false)}
          />
        ) : (
          <p className="notice">
            Add a venue before creating your first event.
          </p>
        ))}
      <section className="workspace-section">
        <div className="section-heading">
          <h2>Your events.</h2>
          <span className="muted">Private organizer workspace</span>
        </div>
        {events.data?.items.length === 0 && (
          <Empty title="The next great event starts here.">
            <p>Create a venue, then make your first draft.</p>
          </Empty>
        )}
        <div className="organizer-event-list">
          {events.data?.items.map((event) => (
            <Link
              className="organizer-event-row"
              to={`/organizer/events/${event.id}`}
              key={event.id}
            >
              <div>
                <h3>{event.title}</h3>
                <p>
                  {date(event.starts_at, event.timezone)} · {event.timezone}
                </p>
              </div>
              <Badge value={event.state} />
              <ArrowUpRight size={22} />
            </Link>
          ))}
        </div>
      </section>
      <section className="workspace-section">
        <div className="section-heading">
          <h2>Your venues.</h2>
          <button
            className="button secondary"
            onClick={() => setVenueEditor("new")}
          >
            <Plus size={17} /> New venue
          </button>
        </div>
        {venueEditor && (
          <VenueForm
            venue={venueEditor === "new" ? undefined : venueEditor}
            close={() => setVenueEditor(null)}
            saved={() => {
              setVenueEditor(null);
              void refresh();
            }}
          />
        )}
        <div className="venue-list">
          {venues.data?.items.map((venue) => (
            <div className="venue-row" key={venue.id}>
              <div>
                <h3>{venue.name}</h3>
                <p>
                  {venue.address} · {venue.city}
                </p>
                <small>
                  {venue.capacity} people · {venue.timezone}
                  {venue.archived_at ? " · Archived" : ""}
                </small>
              </div>
              <div className="actions">
                <button
                  className="text-button"
                  disabled={Boolean(venue.archived_at)}
                  onClick={() => setVenueEditor(venue)}
                >
                  Edit venue
                </button>
                <button
                  className="text-button destructive-text"
                  disabled={Boolean(venue.archived_at)}
                  onClick={() => setArchive(venue)}
                >
                  Remove venue
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {archive && (
        <ConfirmDialog
          title={`Remove ${archive.name}?`}
          description="Unreferenced venues are deleted. A venue used by an event is archived instead, preserving existing events."
          action="Remove venue"
          busy={removal.running}
          close={() => setArchive(null)}
          confirm={() => {
            void removal
              .execute({}, () =>
                api("/organizer/venues/{id}", "delete", {
                  params: { id: archive.id },
                }),
              )
              .then((result) => {
                if (result) {
                  setArchive(null);
                  void refresh();
                }
              });
          }}
        />
      )}
    </>
  );
}
function CategoryEditor({
  event,
  category,
  saved,
  close,
}: {
  event: Model<"Event">;
  category?: Model<"Category">;
  saved: () => void;
  close: () => void;
}) {
  const command = useCommand(
    `category-edit:${event.id}:${category?.id || "new"}`,
  );
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: event.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const body = {
      name: text(data, "name"),
      capacity: number(data, "capacity"),
      price_minor: Math.round(number(data, "price") * 10 ** digits),
      currency: event.currency,
    };
    const result = await command.execute(body, () =>
      category
        ? api("/organizer/events/{id}/categories/{categoryId}", "patch", {
            params: { id: event.id, categoryId: category.id },
            body,
          })
        : api("/organizer/events/{id}/categories", "post", {
            params: { id: event.id },
            body,
          }),
    );
    if (result) saved();
  }
  return (
    <form className="category-editor" onSubmit={submit}>
      <h3>{category ? "Edit ticket category" : "Add ticket category"}</h3>
      <ErrorNotice error={command.error} />
      <fieldset
        className="form-grid"
        disabled={command.running || command.uncertain}
      >
        <Field name="name" label="Ticket name" value={category?.name} />
        <Field
          name="capacity"
          label="Ticket allocation"
          type="number"
          min={0}
          value={category?.capacity || 50}
        />
        <Field
          name="price"
          label={`Ticket price (${event.currency})`}
          type="number"
          min={0}
          step={String(1 / 10 ** digits)}
          value={category ? category.price_minor / 10 ** digits : 25}
        />
      </fieldset>
      <div className="actions">
        <button className="button" disabled={command.running}>
          {command.running ? "Saving…" : "Save ticket category"}
        </button>
        <button className="button secondary" type="button" onClick={close}>
          Close editor
        </button>
      </div>
      {command.uncertain && (
        <p className="notice">
          Refresh the categories before repeating an uncertain editor request.
        </p>
      )}
    </form>
  );
}
export function OrganizerEvent() {
  const { id = "" } = useParams();
  const { user } = useSession();
  const [categoryEditor, setCategoryEditor] = useState<
    Model<"Category"> | "new" | null
  >(null);
  const [confirm, setConfirm] = useState<
    "cancel" | "delete" | "publish" | null
  >(null);
  const [deleteCategory, setDeleteCategory] =
    useState<Model<"Category"> | null>(null);
  const [admission, setAdmission] = useState<string>("");
  const event = useQuery({
    queryKey: ["organizer-event", user?.id, id],
    queryFn: ({ signal }) =>
      api("/organizer/events/{id}", "get", { params: { id }, signal }),
  });
  const categories = useQuery({
    queryKey: ["categories", user?.id, id],
    queryFn: ({ signal }) =>
      api("/organizer/events/{id}/categories", "get", {
        params: { id },
        signal,
      }),
  });
  const venues = useQuery({
    queryKey: ["venues", user?.id],
    queryFn: ({ signal }) =>
      api("/organizer/venues", "get", { query: { page_size: 100 }, signal }),
  });
  const report = useQuery({
    queryKey: ["sales", user?.id, id],
    queryFn: ({ signal }) =>
      api("/organizer/events/{id}/reports/sales", "get", {
        params: { id },
        signal,
      }),
  });
  const lifecycle = useCommand(`event-lifecycle:${id}:${confirm}`);
  const checkIn = useCommand(`check-in:${id}`);
  const categoryRemoval = useCommand(
    `category-remove:${id}:${deleteCategory?.id}`,
  );
  async function refresh() {
    await Promise.all([
      event.refetch(),
      categories.refetch(),
      report.refetch(),
      queryClient.invalidateQueries({ queryKey: ["events"] }),
    ]);
  }
  async function act() {
    const result = await lifecycle.execute<unknown>({}, () =>
      confirm === "cancel"
        ? api("/organizer/events/{id}/cancel", "post", {
            params: { id },
            body: {},
          })
        : confirm === "publish"
          ? api("/organizer/events/{id}/publish", "post", {
              params: { id },
              body: {},
            })
          : api("/organizer/events/{id}", "delete", { params: { id } }),
    );
    if (result) {
      if (confirm === "delete") {
        location.assign("/organizer");
        return;
      }
      setConfirm(null);
      await refresh();
    }
  }
  async function admit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdmission("");
    const token = text(new FormData(e.currentTarget), "token");
    const result = await checkIn.execute({ token }, () =>
      api("/organizer/events/{id}/check-ins", "post", {
        params: { id },
        body: { token },
      }),
    );
    if (result) {
      setAdmission(
        result.status === "admitted"
          ? "Admitted. Enjoy the event!"
          : "Already checked in. This ticket has been used.",
      );
      await report.refetch();
    }
  }
  if (event.isPending) return <Loading>Opening the event workspace…</Loading>;
  if (!event.data)
    return (
      <ErrorNotice error={event.error} retry={() => void event.refetch()} />
    );
  const data = event.data;
  return (
    <>
      <Link className="back-link" to="/organizer">
        <ArrowLeft size={16} aria-hidden="true" /> Organizer workspace
      </Link>
      <PageHeading
        title={data.title}
        description={`${date(data.starts_at, data.timezone)} · ${data.timezone}`}
      >
        <Badge value={data.state} />
      </PageHeading>
      <ErrorNotice
        error={lifecycle.error || categories.error || categoryRemoval.error}
      />
      <div className="organizer-toolbar">
        {data.state === "DRAFT" && (
          <>
            <button className="button" onClick={() => setConfirm("publish")}>
              Publish event <ArrowUpRight size={17} />
            </button>
            <button
              className="button secondary"
              onClick={() => setConfirm("delete")}
            >
              Delete draft
            </button>
          </>
        )}
        {data.state === "PUBLISHED" && (
          <button
            className="button secondary"
            onClick={() => setConfirm("cancel")}
          >
            Cancel event
          </button>
        )}
        <button className="text-button" onClick={() => void refresh()}>
          <RefreshCw size={17} /> Refresh workspace
        </button>
      </div>
      <div className="organizer-columns">
        <div>
          <EventForm
            key={data.id + data.version}
            event={data}
            venues={venues.data?.items || []}
            saved={() => void refresh()}
          />
          <section className="workspace-section">
            <div className="section-heading">
              <h2>Ticket categories.</h2>
              {data.state === "DRAFT" && (
                <button
                  className="button secondary"
                  onClick={() => setCategoryEditor("new")}
                >
                  <Plus size={16} /> Add category
                </button>
              )}
            </div>
            {data.state !== "DRAFT" && (
              <p className="muted">
                Ticket prices and allocations are locked after publication.
              </p>
            )}
            {categoryEditor && (
              <CategoryEditor
                event={data}
                category={categoryEditor === "new" ? undefined : categoryEditor}
                close={() => setCategoryEditor(null)}
                saved={() => {
                  setCategoryEditor(null);
                  void refresh();
                }}
              />
            )}
            {categories.data?.items.map((category) => (
              <div className="category-row" key={category.id}>
                <div>
                  <h3>{category.name}</h3>
                  <p>
                    {money(category.price_minor, category.currency)} ·{" "}
                    {category.capacity} tickets
                  </p>
                </div>
                {data.state === "DRAFT" && (
                  <div className="actions">
                    <button
                      className="text-button"
                      onClick={() => setCategoryEditor(category)}
                    >
                      Edit category
                    </button>
                    <button
                      className="text-button destructive-text"
                      onClick={() => setDeleteCategory(category)}
                    >
                      Delete category
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        </div>
        <aside className="check-in-panel">
          <ScanLine size={30} strokeWidth={1.5} />
          <h2>A warm welcome starts here.</h2>
          <p>Paste a ticket credential to verify admission for this event.</p>
          <form onSubmit={admit}>
            <label>
              Ticket credential
              <textarea
                name="token"
                rows={3}
                minLength={20}
                maxLength={200}
                autoComplete="off"
                required
              />
            </label>
            <button className="button full" disabled={checkIn.running}>
              {checkIn.running ? "Checking ticket…" : "Check in ticket"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="admission-result" role="status">
            {admission}
          </p>
          <ErrorNotice error={checkIn.error} />
          <small>
            Credentials are sent privately. Never put them in a URL.
          </small>
        </aside>
      </div>
      <section className="sales-section">
        <div className="section-heading">
          <h2>The event, in numbers.</h2>
          <button className="text-button" onClick={() => void report.refetch()}>
            <RefreshCw size={16} /> Refresh sales
          </button>
        </div>
        <ErrorNotice error={report.error} />
        {report.data && (
          <>
            <dl className="sales-summary">
              <div>
                <dt>Captured</dt>
                <dd>
                  {money(report.data.captured_minor, report.data.currency)}
                </dd>
              </div>
              <div>
                <dt>Refunded</dt>
                <dd>
                  {money(report.data.refunded_minor, report.data.currency)}
                </dd>
              </div>
              <div>
                <dt>Net collected</dt>
                <dd>
                  {money(report.data.net_collected_minor, report.data.currency)}
                </dd>
              </div>
              <div>
                <dt>Checked in</dt>
                <dd>
                  {report.data.checked_in_count} / {report.data.ticket_count}
                </dd>
              </div>
            </dl>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">Sales by ticket category</caption>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Capacity</th>
                    <th>Reserved</th>
                    <th>Sold</th>
                    <th>Checked in</th>
                    <th>Captured</th>
                    <th>Refunded</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.categories.map((row) => (
                    <tr key={row.category_id}>
                      <th scope="row">{row.name}</th>
                      <td>{row.capacity}</td>
                      <td>{row.reserved_count}</td>
                      <td>{row.sold_count}</td>
                      <td>{row.checked_in_count}</td>
                      <td>
                        {money(row.captured_minor, report.data!.currency)}
                      </td>
                      <td>
                        {money(row.refunded_minor, report.data!.currency)}
                      </td>
                      <td>
                        {money(row.net_collected_minor, report.data!.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      {confirm && (
        <ConfirmDialog
          title={
            confirm === "publish"
              ? "Ready to publish?"
              : confirm === "cancel"
                ? "Cancel this event?"
                : "Delete this draft?"
          }
          description={
            confirm === "publish"
              ? "Publication makes this event discoverable and locks venue, schedule, capacity, currency and ticket prices."
              : confirm === "cancel"
                ? "Sales and admission will stop. The backend releases holds and processes eligible refunds asynchronously."
                : "The draft and its ticket categories will be removed."
          }
          action={
            confirm === "publish"
              ? "Publish event"
              : confirm === "cancel"
                ? "Cancel event"
                : "Delete draft"
          }
          busy={lifecycle.running}
          close={() => setConfirm(null)}
          confirm={() => void act()}
        />
      )}
      {deleteCategory && (
        <ConfirmDialog
          title="Delete this ticket category?"
          description="This removes the draft allocation and price."
          action="Delete category"
          busy={categoryRemoval.running}
          close={() => setDeleteCategory(null)}
          confirm={() => {
            void categoryRemoval
              .execute({}, () =>
                api(
                  "/organizer/events/{id}/categories/{categoryId}",
                  "delete",
                  { params: { id, categoryId: deleteCategory.id } },
                ),
              )
              .then((result) => {
                if (result) {
                  setDeleteCategory(null);
                  void refresh();
                }
              });
          }}
        />
      )}
    </>
  );
}
