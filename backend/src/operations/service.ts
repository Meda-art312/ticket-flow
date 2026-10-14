import { Db } from "../infra/db";
import { assert, audit } from "../infra/common";
import { Reporting } from "../reporting/service";
export class Operations {
  constructor(
    private db: Db,
    private reporting: Reporting,
  ) {}
  async inspect(kind: string) {
    switch (kind) {
      case "payments":
        return this.db.rows(
          "SELECT id,booking_id,state,reconciliation_required,manual_resolution,created_at FROM payment_attempts WHERE reconciliation_required OR manual_resolution ORDER BY created_at LIMIT 100",
        );
      case "refunds":
        return this.db.rows(
          "SELECT id,payment_id,booking_id,state,reason,attempts,manual_resolution FROM refunds WHERE state<>'SUCCEEDED' ORDER BY created_at LIMIT 100",
        );
      case "outbox":
        return this.db.rows(
          "SELECT id,event_type,created_at,attempts,dead FROM outbox_events WHERE published_at IS NULL ORDER BY created_at LIMIT 100",
        );
      case "webhooks":
        return this.db.rows(
          "SELECT id,event_id,state,attempts,error_code FROM webhook_events WHERE state<>'DONE' ORDER BY created_at LIMIT 100",
        );
      case "notifications":
        return this.db.rows(
          "SELECT id,booking_id,kind,state,attempts,error_code FROM notification_jobs WHERE state<>'DONE' LIMIT 100",
        );
      case "dead-letters":
        return this.db.rows(
          "SELECT id,event_id,error_code,replayed_at,created_at FROM dead_letters ORDER BY created_at DESC LIMIT 100",
        );
      case "audit":
        return this.db.rows(
          "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100",
        );
      case "drift":
        return this.reporting.drift();
      default:
        assert(false, 404, "NOT_FOUND");
    }
  }
  async retry(actor: string, kind: string, id: string) {
    return this.db.transaction(async (tx) => {
      let row: any;
      switch (kind) {
        case "outbox":
          row = await this.db.one(
            "UPDATE outbox_events SET dead=false,attempts=0,next_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND published_at IS NULL RETURNING id",
            [id],
            tx,
          );
          break;
        case "webhooks":
          row = await this.db.one(
            "UPDATE webhook_events SET state='PENDING',attempts=0,next_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND state='DEAD' RETURNING id",
            [id],
            tx,
          );
          break;
        case "notifications":
          row = await this.db.one(
            "UPDATE notification_jobs SET state='PENDING',attempts=0,next_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND state='DEAD' RETURNING id",
            [id],
            tx,
          );
          break;
        case "payments":
          row = await this.db.one(
            "UPDATE payment_attempts SET manual_resolution=false,reconciliation_required=true,lease_until=NULL WHERE id=$1 AND provider_session_id IS NOT NULL RETURNING id",
            [id],
            tx,
          );
          break;
        case "refunds":
          row = await this.db.one(
            "UPDATE refunds SET manual_resolution=false,attempts=0,next_at=clock_timestamp(),lease_until=NULL WHERE id=$1 AND state IN ('REQUESTED','PROCESSING') RETURNING id",
            [id],
            tx,
          );
          break;
        case "dead-letters": {
          const dead = await this.db.one(
            "SELECT * FROM dead_letters WHERE id=$1 FOR UPDATE",
            [id],
            tx,
          );
          assert(
            dead &&
              dead.envelope.schema_version === 1 &&
              dead.envelope.aggregate_id,
            409,
            "UNREPLAYABLE_MESSAGE",
          );
          const e = dead.envelope;
          await tx.query(
            "INSERT INTO outbox_events(id,event_type,aggregate_id,correlation_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET published_at=NULL,dead=false,attempts=0,next_at=clock_timestamp(),lease_until=NULL",
            [
              e.event_id,
              e.event_type,
              e.aggregate_id,
              e.correlation_id,
              JSON.stringify(e.payload),
            ],
          );
          await tx.query(
            "UPDATE dead_letters SET replayed_at=clock_timestamp() WHERE id=$1",
            [id],
          );
          row = dead;
          break;
        }
        default:
          assert(false, 404, "NOT_FOUND");
      }
      assert(row, 409, "WORK_NOT_RETRYABLE");
      await audit(this.db, tx, actor, "Replay:" + kind, id);
      return { id, status: "queued" };
    });
  }
}
