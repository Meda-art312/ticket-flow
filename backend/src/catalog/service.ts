import { Db, Tx } from "../infra/db";
import { assert, audit, outbox, pagination } from "../infra/common";
export class Catalog {
  constructor(private db: Db) {}
  async changed(tx: Tx, id: string) {
    await tx.query(
      "UPDATE catalog_generation SET generation=generation+1 WHERE id=1",
    );
    await outbox(this.db, tx, "CatalogChanged", id);
  }
  async event(tx: Tx, id: string, owner?: string) {
    const row = await this.db.one(
      "SELECT * FROM events WHERE id=$1 FOR UPDATE",
      [id],
      tx,
    );
    assert(row && (!owner || row.owner_id === owner), 404, "EVENT_NOT_FOUND");
    return row;
  }
  async venues(owner: string, query: any = {}) {
    return this.ownedList("venues", owner, query);
  }
  async ownedList(table: "venues" | "events", owner: string, query: any) {
    const p = pagination(query),
      count = await this.db.one(
        `SELECT count(*)::int n FROM ${table} WHERE owner_id=$1`,
        [owner],
      );
    return {
      items: await this.db.rows(
        `SELECT * FROM ${table} WHERE owner_id=$1 ORDER BY id LIMIT $2 OFFSET $3`,
        [owner, p.page_size, p.offset],
      ),
      pagination: { page: p.page, page_size: p.page_size, total: count.n },
    };
  }
  async saveVenue(owner: string, input: any, id?: string) {
    return this.db.transaction(async (tx) => {
      if (id) {
        const old = await this.db.one(
          "SELECT * FROM venues WHERE id=$1 AND owner_id=$2 FOR UPDATE",
          [id, owner],
          tx,
        );
        assert(old, 404, "VENUE_NOT_FOUND");
        const refs = await this.db.one(
          "SELECT count(*)::int AS n FROM events WHERE venue_id=$1",
          [id],
          tx,
        );
        assert(refs.n === 0, 409, "VENUE_REFERENCED");
        input = { ...old, ...input };
      }
      const p = [
        owner,
        input.name,
        input.address,
        input.city,
        input.country,
        input.capacity,
        input.timezone,
      ];
      const row = id
        ? await this.db.one(
            "UPDATE venues SET name=$2,address=$3,city=$4,country=$5,capacity=$6,timezone=$7 WHERE owner_id=$1 AND id=$8 RETURNING *",
            [...p, id],
            tx,
          )
        : await this.db.one(
            "INSERT INTO venues(owner_id,name,address,city,country,capacity,timezone) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            p,
            tx,
          );
      await this.changed(tx, row.id);
      return row;
    });
  }
  async deleteVenue(owner: string, id: string) {
    return this.db.transaction(async (tx) => {
      const row = await this.db.one(
        "SELECT * FROM venues WHERE id=$1 AND owner_id=$2 FOR UPDATE",
        [id, owner],
        tx,
      );
      assert(row, 404, "VENUE_NOT_FOUND");
      const refs = await this.db.one(
        "SELECT count(*)::int AS n FROM events WHERE venue_id=$1",
        [id],
        tx,
      );
      if (refs.n)
        await tx.query(
          "UPDATE venues SET archived_at=clock_timestamp() WHERE id=$1",
          [id],
        );
      else await tx.query("DELETE FROM venues WHERE id=$1", [id]);
      await this.changed(tx, id);
      return { archived: refs.n > 0, deleted: refs.n === 0 };
    });
  }
  async ownedEvents(owner: string, query: any = {}) {
    return this.ownedList("events", owner, query);
  }
  async saveEvent(owner: string, input: any, id?: string) {
    return this.db.transaction(async (tx) => {
      let old: any;
      if (id) {
        old = await this.event(tx, id, owner);
        if (old.state !== "DRAFT")
          assert(
            Object.keys(input).every((k) =>
              ["title", "description"].includes(k),
            ),
            409,
            "COMMERCIAL_TERMS_FROZEN",
          );
        input = { ...old, ...input };
      }
      const venue = await this.db.one(
        "SELECT * FROM venues WHERE id=$1 AND owner_id=$2 AND (archived_at IS NULL OR $3::boolean) FOR SHARE",
        [input.venue_id, owner, !!old && old.state !== "DRAFT"],
        tx,
      );
      assert(venue, 404, "VENUE_NOT_FOUND");
      assert(input.capacity <= venue.capacity, 400, "VENUE_CAPACITY");
      if (id) {
        const sum = await this.db.one(
          "SELECT coalesce(sum(capacity),0)::int AS n FROM ticket_categories WHERE event_id=$1",
          [id],
          tx,
        );
        assert(sum.n <= input.capacity, 409, "CATEGORY_CAPACITY");
      }
      const columns = [
        "title",
        "description",
        "category_label",
        "venue_id",
        "starts_at",
        "ends_at",
        "sales_open_at",
        "sales_close_at",
        "timezone",
        "capacity",
        "currency",
      ];
      const vals = columns.map((k) => input[k]);
      const row = id
        ? await this.db.one(
            `UPDATE events SET ${columns.map((k, i) => `${k}=$${i + 1}`).join(",")},version=version+1 WHERE id=$12 RETURNING *`,
            [...vals, id],
            tx,
          )
        : await this.db.one(
            `INSERT INTO events(${columns.join(",")},owner_id) VALUES(${vals.map((_, i) => "$" + (i + 1)).join(",")},$12) RETURNING *`,
            [...vals, owner],
            tx,
          );
      await this.changed(tx, row.id);
      return row;
    });
  }
  async deleteEvent(owner: string, id: string) {
    return this.db.transaction(async (tx) => {
      const e = await this.event(tx, id, owner);
      assert(e.state === "DRAFT", 409, "DRAFT_ONLY");
      const refs = await this.db.one(
        "SELECT count(*)::int n FROM bookings WHERE event_id=$1",
        [id],
        tx,
      );
      assert(refs.n === 0, 409, "EVENT_REFERENCED");
      await tx.query("DELETE FROM ticket_categories WHERE event_id=$1", [id]);
      await tx.query("DELETE FROM events WHERE id=$1", [id]);
      await this.changed(tx, id);
      return { deleted: true };
    });
  }
  async categories(owner: string, event: string, query: any = {}) {
    return this.db.transaction(async (tx) => {
      await this.event(tx, event, owner);
      const p = pagination(query),
        count = await this.db.one(
          "SELECT count(*)::int n FROM ticket_categories WHERE event_id=$1",
          [event],
          tx,
        );
      return {
        items: await this.db.rows(
          "SELECT * FROM ticket_categories WHERE event_id=$1 ORDER BY id LIMIT $2 OFFSET $3",
          [event, p.page_size, p.offset],
          tx,
        ),
        pagination: { page: p.page, page_size: p.page_size, total: count.n },
      };
    });
  }
  async saveCategory(owner: string, event: string, input: any, id?: string) {
    return this.db.transaction(async (tx) => {
      const e = await this.event(tx, event, owner);
      assert(e.state === "DRAFT", 409, "COMMERCIAL_TERMS_FROZEN");
      if (id) {
        const old = await this.db.one(
          "SELECT * FROM ticket_categories WHERE id=$1 AND event_id=$2 FOR UPDATE",
          [id, event],
          tx,
        );
        assert(old, 404, "CATEGORY_NOT_FOUND");
        input = { ...old, ...input };
      }
      assert(input.currency === e.currency, 400, "CURRENCY_MISMATCH");
      const sum = await this.db.one(
        "SELECT coalesce(sum(capacity),0)::int n FROM ticket_categories WHERE event_id=$1 AND ($2::uuid IS NULL OR id<>$2)",
        [event, id || null],
        tx,
      );
      assert(sum.n + input.capacity <= e.capacity, 409, "CATEGORY_CAPACITY");
      const row = id
        ? await this.db.one(
            "UPDATE ticket_categories SET name=$1,capacity=$2,price_minor=$3,currency=$4 WHERE id=$5 RETURNING *",
            [input.name, input.capacity, input.price_minor, input.currency, id],
            tx,
          )
        : await this.db.one(
            "INSERT INTO ticket_categories(event_id,name,capacity,price_minor,currency) VALUES($1,$2,$3,$4,$5) RETURNING *",
            [
              event,
              input.name,
              input.capacity,
              input.price_minor,
              input.currency,
            ],
            tx,
          );
      await this.changed(tx, event);
      return row;
    });
  }
  async deleteCategory(owner: string, event: string, id: string) {
    return this.db.transaction(async (tx) => {
      const e = await this.event(tx, event, owner);
      assert(e.state === "DRAFT", 409, "DRAFT_ONLY");
      const count = await this.db.one(
        "SELECT count(*)::int n FROM bookings WHERE category_id=$1",
        [id],
        tx,
      );
      assert(count.n === 0, 409, "CATEGORY_REFERENCED");
      const row = await this.db.one(
        "DELETE FROM ticket_categories WHERE id=$1 AND event_id=$2 RETURNING id",
        [id, event],
        tx,
      );
      assert(row, 404, "CATEGORY_NOT_FOUND");
      await this.changed(tx, event);
      return { deleted: true };
    });
  }
  async transition(
    owner: string,
    id: string,
    state: "PUBLISHED" | "CANCELED" | "COMPLETED",
    admin = false,
  ) {
    return this.db.transaction(async (tx) => {
      const e = await this.event(tx, id, admin ? undefined : owner);
      if (e.state === state) return e;
      if (state === "PUBLISHED") {
        assert(e.state === "DRAFT", 409, "INVALID_EVENT_TRANSITION");
        const c = await this.db.one(
          "SELECT count(*)::int n,sum(capacity)::int capacity FROM ticket_categories WHERE event_id=$1",
          [id],
          tx,
        );
        assert(
          c.n > 0 && c.capacity <= e.capacity,
          409,
          "PUBLICATION_CATEGORIES",
        );
      } else if (state === "CANCELED")
        assert(
          ["DRAFT", "PUBLISHED"].includes(e.state),
          409,
          "INVALID_EVENT_TRANSITION",
        );
      else {
        const time = await this.db.one(
          "SELECT clock_timestamp()>$1::timestamptz AS ended",
          [e.ends_at],
          tx,
        );
        assert(
          e.state === "PUBLISHED" && time.ended,
          409,
          "INVALID_EVENT_TRANSITION",
        );
      }
      const row = await this.db.one(
        "UPDATE events SET state=$2,version=version+1 WHERE id=$1 RETURNING *",
        [id, state],
        tx,
      );
      await audit(this.db, tx, owner, "Event" + state, id);
      await outbox(
        this.db,
        tx,
        state === "CANCELED" ? "EventCanceled" : "CatalogChanged",
        id,
      );
      await this.changed(tx, id);
      return row;
    });
  }
  async publicDetail(id: string, tx?: Tx) {
    const e = await this.db.one(
      "SELECT e.id,e.title,e.description,e.category_label,e.starts_at,e.ends_at,e.sales_open_at,e.sales_close_at,e.timezone,e.currency,json_build_object('id',v.id,'name',v.name,'address',v.address,'city',v.city,'country',v.country) venue FROM events e JOIN venues v ON v.id=e.venue_id WHERE e.id=$1 AND e.state='PUBLISHED'",
      [id],
      tx,
    );
    assert(e, 404, "EVENT_NOT_FOUND");
    return {
      ...e,
      categories: await this.db.rows(
        "SELECT id,name,price_minor,currency,capacity-reserved_count-sold_count AS indicative_available FROM ticket_categories WHERE event_id=$1 ORDER BY id",
        [id],
        tx,
      ),
      availability_is_indicative: true,
    };
  }
  async publicList(query: any) {
    const p = pagination(query);
    const sort: Record<string, string> = {
      starts_at: "e.starts_at ASC,e.id",
      title: "e.title ASC,e.id",
      starts_at_desc: "e.starts_at DESC,e.id",
    };
    assert(!query.sort || sort[query.sort], 400, "INVALID_SORT");
    const vals = [
      query.city || null,
      query.category || null,
      query.start_from || null,
      query.start_to || null,
      query.q || null,
    ];
    const where =
      "e.state='PUBLISHED' AND ($1::text IS NULL OR lower(v.city)=lower($1)) AND ($2::text IS NULL OR e.category_label=$2) AND ($3::timestamptz IS NULL OR e.starts_at>=$3) AND ($4::timestamptz IS NULL OR e.starts_at<=$4) AND ($5::text IS NULL OR e.title ILIKE '%'||$5||'%')";
    return this.db.transaction(async (tx) => {
      await tx.query(
        "SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const count = await this.db.one(
        `SELECT count(*)::int n FROM events e JOIN venues v ON v.id=e.venue_id WHERE ${where}`,
        vals,
        tx,
      );
      const ids = await this.db.rows(
        `SELECT e.id FROM events e JOIN venues v ON v.id=e.venue_id WHERE ${where} ORDER BY ${sort[query.sort] || sort.starts_at} LIMIT $6 OFFSET $7`,
        [...vals, p.page_size, p.offset],
        tx,
      );
      const items = [];
      for (const e of ids) items.push(await this.publicDetail(e.id, tx));
      return {
        items,
        pagination: { page: p.page, page_size: p.page_size, total: count.n },
      };
    });
  }
}
