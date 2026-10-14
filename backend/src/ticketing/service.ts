import { Db, Tx } from "../infra/db";
import { Reservations } from "../reservations/service";
import { assert, hash, decrypt, audit, token, encrypt } from "../infra/common";
export class Ticketing {
  async issue(tx: Tx, b: any) {
    for (let ordinal = 1; ordinal <= b.quantity; ordinal++) {
      const credential = token();
      await tx.query(
        "INSERT INTO tickets(booking_id,ordinal,token_hash,token_encrypted) VALUES($1,$2,$3,$4) ON CONFLICT(booking_id,ordinal) DO NOTHING",
        [b.id, ordinal, hash(credential), encrypt(credential)],
      );
    }
  }
  async checkedIn(tx: Tx, id: string) {
    return (
      await this.db.one(
        "SELECT count(*)::int n FROM tickets WHERE booking_id=$1 AND checked_in_at IS NOT NULL",
        [id],
        tx,
      )
    ).n as number;
  }
  async suspend(tx: Tx, id: string) {
    await tx.query(
      "UPDATE tickets SET state='SUSPENDED' WHERE booking_id=$1 AND state='VALID'",
      [id],
    );
  }
  async void(tx: Tx, id: string) {
    await tx.query("UPDATE tickets SET state='VOID' WHERE booking_id=$1", [id]);
  }
  async restore(tx: Tx, id: string) {
    await tx.query(
      "UPDATE tickets SET state='VALID' WHERE booking_id=$1 AND state='SUSPENDED'",
      [id],
    );
  }
  constructor(
    private db: Db,
    private reservations: Reservations,
  ) {}
  async list(actor: string, booking: string) {
    const b = await this.db.one(
      "SELECT id FROM bookings WHERE id=$1 AND customer_id=$2",
      [booking, actor],
    );
    assert(b, 404, "BOOKING_NOT_FOUND");
    const rows = await this.db.rows(
      "SELECT t.* FROM tickets t WHERE booking_id=$1 ORDER BY ordinal",
      [booking],
    );
    return { items: rows.map((t) => this.safe(t)) };
  }
  safe(t: any) {
    return {
      id: t.id,
      booking_id: t.booking_id,
      state: t.state,
      artifact_status: t.artifact_status,
      qr_svg: t.qr_svg || null,
      check_in_token: decrypt(t.token_encrypted),
    };
  }
  async detail(actor: string, id: string) {
    const t = await this.db.one(
      "SELECT t.* FROM tickets t JOIN bookings b ON b.id=t.booking_id WHERE t.id=$1 AND b.customer_id=$2",
      [id, actor],
    );
    assert(t, 404, "TICKET_NOT_FOUND");
    return this.safe(t);
  }
  async checkin(actor: string, eventId: string, credential: string) {
    return this.db.transaction(async (tx) => {
      const ref = await this.db.one(
        "SELECT booking_id FROM tickets WHERE token_hash=$1",
        [hash(credential)],
        tx,
      );
      assert(ref, 404, "INVALID_TICKET");
      const { booking: b, event } = await this.reservations.locked(
        tx,
        ref.booking_id,
      );
      assert(
        event.id === eventId && event.owner_id === actor,
        404,
        "INVALID_TICKET",
      );
      assert(
        event.state === "PUBLISHED" && b.state === "CONFIRMED",
        409,
        "TICKET_UNUSABLE",
      );
      const t = await this.db.one(
        "SELECT * FROM tickets WHERE booking_id=$1 AND token_hash=$2 FOR UPDATE",
        [b.id, hash(credential)],
        tx,
      );
      const { eligible } = await this.db.one(
        "SELECT clock_timestamp()>=$1::timestamptz-interval '2 hours' AND clock_timestamp()<=$2::timestamptz AS eligible",
        [event.starts_at, event.ends_at],
        tx,
      );
      assert(eligible, 409, "OUTSIDE_ENTRY_WINDOW");
      if (t.state === "CHECKED_IN")
        return { status: "already_checked_in", ticket_id: t.id };
      assert(t.state === "VALID", 409, "TICKET_UNUSABLE");
      await tx.query(
        "UPDATE tickets SET state='CHECKED_IN',checked_in_at=clock_timestamp(),checked_in_by=$2 WHERE id=$1",
        [t.id, actor],
      );
      await audit(this.db, tx, actor, "TicketAdmitted", t.id);
      return { status: "admitted", ticket_id: t.id };
    });
  }
}
