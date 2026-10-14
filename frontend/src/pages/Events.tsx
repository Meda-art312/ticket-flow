import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "../api/client";
import { useCommand } from "../api/commands";
import { date, money } from "../api/format";
import { queryClient, useSession } from "../api/session";
import {
  Empty,
  ErrorNotice,
  Loading,
  Pagination,
  Poster,
} from "../components/ui";

export function Events() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const from = params.get("from");
  const query = {
    q: params.get("q") || undefined,
    city: params.get("city") || undefined,
    category: params.get("category") || undefined,
    start_from:
      from && !Number.isNaN(Date.parse(from))
        ? new Date(from + "T00:00:00Z").toISOString()
        : undefined,
    page,
    page_size: 9,
    sort: "starts_at" as const,
  };
  const events = useQuery({
    queryKey: ["events", query],
    queryFn: ({ signal }) => api("/events", "get", { query, signal }),
  });
  const [advanced, setAdvanced] = useState(
    Boolean(params.get("city") || params.get("category") || params.get("from")),
  );
  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "city", "category", "from"])
      if (data.get(key)) next.set(key, String(data.get(key)));
    setParams(next);
  }
  return (
    <>
      <section className="discovery-intro">
        <h1>
          Find your next
          <br />
          <span>“I was there.”</span>
        </h1>
        <div className="intro-aside">
          <p>
            Live music. New ideas. Good company.
            <br />A little more life in your calendar.
          </p>
          <a href="#event-collection" className="text-button">
            Explore what’s on <ArrowRight size={18} />
          </a>
        </div>
      </section>
      <form className="search-bar" onSubmit={search}>
        <label className="search-field">
          <Search size={21} aria-hidden="true" />
          <span className="sr-only">Search events</span>
          <input
            name="q"
            placeholder="An artist, an idea, a good plan…"
            defaultValue={params.get("q") || ""}
          />
        </label>
        <button
          type="button"
          aria-expanded={advanced}
          className={`button secondary filter-toggle ${advanced ? "selected" : ""}`}
          onClick={() => setAdvanced(!advanced)}
        >
          <SlidersHorizontal size={17} /> Filters
        </button>
        <button className="button">
          Find events <ArrowUpRight size={18} />
        </button>
        {advanced && (
          <div className="filter-fields">
            <label>
              City
              <input
                name="city"
                defaultValue={params.get("city") || ""}
                placeholder="Any city"
              />
            </label>
            <label>
              Category
              <input
                name="category"
                defaultValue={params.get("category") || ""}
                placeholder="Music, culture…"
              />
            </label>
            <label>
              From date
              <input
                name="from"
                type="date"
                defaultValue={params.get("from") || ""}
              />
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setParams({});
                setAdvanced(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </form>
      <section id="event-collection" className="collection">
        <div className="section-heading">
          <h2>Worth going out for.</h2>
          <span className="muted">
            {events.data
              ? `${events.data.pagination.total} events to explore`
              : "Discover what’s happening"}
          </span>
        </div>
        {events.isPending && <Loading>Finding your next good plan…</Loading>}
        <ErrorNotice error={events.error} retry={() => void events.refetch()} />
        {events.data && !events.data.items.length && (
          <Empty title="Nothing here just yet.">
            <p>Try another search or clear your filters.</p>
            <button className="button secondary" onClick={() => setParams({})}>
              Show all events
            </button>
          </Empty>
        )}
        <div className="event-grid">
          {events.data?.items.map((event, index) => (
            <Link
              to={`/events/${event.id}`}
              key={event.id}
              className="event-card"
            >
              <Poster
                title={event.title}
                category={event.category_label}
                startsAt={event.starts_at}
                timezone={event.timezone}
                variant={index}
              />
              <div className="event-card-meta">
                <span>
                  {date(event.starts_at, event.timezone, {
                    weekday: "short",
                    year: undefined,
                  })}
                </span>
                <span>{event.category_label}</span>
              </div>
              <h3>
                {event.title}
                <ArrowUpRight size={21} aria-hidden="true" />
              </h3>
              <p>
                {event.venue.name} · {event.venue.city}
              </p>
              <div className="event-card-bottom">
                <span>
                  {event.categories.length
                    ? `From ${money(Math.min(...event.categories.map((category) => category.price_minor)), event.currency)}`
                    : "Tickets coming soon"}
                </span>
                <span className="card-link">
                  View event <ArrowRight size={15} />
                </span>
              </div>
            </Link>
          ))}
        </div>
        {events.data && (
          <Pagination
            page={page}
            pageSize={9}
            total={events.data.pagination.total}
            change={(next) => {
              const value = new URLSearchParams(params);
              value.set("page", String(next));
              setParams(value);
            }}
          />
        )}
      </section>
    </>
  );
}
export function EventDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const session = useSession();
  const event = useQuery({
    queryKey: ["event", id],
    queryFn: ({ signal }) =>
      api("/events/{id}", "get", { params: { id }, signal }),
  });
  const reserve = useCommand(`reserve:${id}:${session.user?.id || "visitor"}`);
  const categoryId =
    params.get("category") || event.data?.categories[0]?.id || "";
  const quantity = Math.min(
    6,
    Math.max(1, Number(params.get("quantity")) || 1),
  );
  const category = event.data?.categories.find(
    (item) => item.id === categoryId,
  );
  function select(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  }
  async function book() {
    if (!session.user) {
      navigate(`/login?next=${encodeURIComponent(`/events/${id}?${params}`)}`);
      return;
    }
    if (!category) return;
    const body = { category_id: category.id, quantity };
    const result = await reserve.execute(body, (key) =>
      api("/bookings", "post", { body, key }),
    );
    await queryClient.invalidateQueries({ queryKey: ["event", id] });
    if (result) {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      navigate(`/bookings/${result.id}`);
    }
  }
  if (event.isPending) return <Loading>Opening the event…</Loading>;
  if (!event.data)
    return (
      <ErrorNotice error={event.error} retry={() => void event.refetch()} />
    );
  const item = event.data;
  return (
    <>
      <Link to="/events" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> All events
      </Link>
      <div className="event-detail">
        <div className="event-content">
          <Poster
            large
            title={item.title}
            category={item.category_label}
            startsAt={item.starts_at}
            timezone={item.timezone}
          />
          <h1>{item.title}</h1>
          <div className="event-facts">
            <p>
              <CalendarDays size={18} />
              {date(item.starts_at, item.timezone, {
                weekday: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
              <small>{item.timezone}</small>
            </p>
            <p>
              <MapPin size={18} />
              {item.venue.name}
              <small>
                {item.venue.address}, {item.venue.city}, {item.venue.country}
              </small>
            </p>
          </div>
          <section className="event-description">
            <h2>A little about the event.</h2>
            <p>{item.description}</p>
          </section>
        </div>
        <aside className="reservation-panel">
          <h2>Your place, right here.</h2>
          <p className="muted">Choose how you’ll be there.</p>
          <ErrorNotice error={reserve.error} />
          <fieldset disabled={reserve.running || reserve.uncertain}>
            <legend>Ticket category</legend>
            {item.categories.map((option) => (
              <label
                className={`category-option ${option.id === categoryId ? "chosen" : ""}`}
                key={option.id}
              >
                <input
                  type="radio"
                  name="category"
                  checked={option.id === categoryId}
                  onChange={() => select("category", option.id)}
                />
                <span>
                  <strong>{option.name}</strong>
                  <small>
                    {option.indicative_available
                      ? `${option.indicative_available} currently available`
                      : "Currently sold out"}
                  </small>
                </span>
                <strong>{money(option.price_minor, option.currency)}</strong>
              </label>
            ))}
            <label className="quantity-field">
              Tickets
              <select
                aria-label="Ticket quantity"
                value={quantity}
                onChange={(event) => select("quantity", event.target.value)}
              >
                {[1, 2, 3, 4, 5, 6].map((number) => (
                  <option key={number} value={number}>
                    {number}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <p className="availability-note">
            Availability can change. Your exact total and hold time are
            confirmed when you reserve.
          </p>
          <button
            className="button full"
            disabled={
              reserve.running ||
              session.restoring ||
              !category ||
              (!reserve.uncertain && category.indicative_available < quantity)
            }
            onClick={() => void book()}
          >
            {reserve.running
              ? "Holding your place…"
              : reserve.uncertain
                ? "Retry same reservation"
                : session.user
                  ? "Reserve tickets"
                  : "Sign in to reserve"}
            <ArrowUpRight size={18} />
          </button>
          {reserve.uncertain && (
            <p className="notice">
              The outcome is uncertain. This retry uses the original request.
              Check My bookings before leaving this page.
            </p>
          )}
          <small className="panel-note">No payment taken at this step.</small>
        </aside>
      </div>
    </>
  );
}
