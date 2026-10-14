import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { Db } from "../infra/db";
import { decrypt } from "../infra/common";
import { config } from "../infra/config";
import { failures } from "../infra/metrics";
export class Notifications {
  readonly smtp = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
    connectionTimeout: 3000,
    socketTimeout: 5000,
  });
  constructor(private db: Db) {}
  async process(id: string) {
    const job = await this.db.one(
      "UPDATE notification_jobs SET state='PROCESSING',attempts=attempts+1,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1 AND state IN ('PENDING','PROCESSING') AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING *",
      [id],
    );
    if (!job) return;
    try {
      const tickets = await this.db.rows(
        "SELECT id,token_encrypted FROM tickets WHERE booking_id=$1 AND qr_svg IS NULL",
        [job.booking_id],
      );
      for (const t of tickets) {
        const svg = await QRCode.toString(decrypt(t.token_encrypted), {
          type: "svg",
        });
        await this.db.rows(
          "UPDATE tickets SET qr_svg=$2,artifact_status='READY' WHERE id=$1",
          [t.id, svg],
        );
      }
      const b = await this.db.one(
        "SELECT b.id,u.email FROM bookings b JOIN users u ON u.id=b.customer_id WHERE b.id=$1",
        [job.booking_id],
      );
      await this.smtp.sendMail({
        from: "tickets@ticketflow.local",
        to: b.email,
        subject: `TicketFlow ${job.kind}`,
        text: `Booking ${b.id}: ${job.kind}. Retrieve your tickets through the authenticated TicketFlow API.`,
        messageId: `<${job.id}@ticketflow.local>`,
      });
      await this.db.rows(
        "UPDATE notification_jobs SET state='DONE',lease_until=NULL WHERE id=$1",
        [id],
      );
    } catch {
      failures.inc({ kind: "notification" });
      await this.db.rows(
        "UPDATE tickets SET artifact_status='FAILED' WHERE booking_id=$1 AND qr_svg IS NULL",
        [job.booking_id],
      );
      await this.db.rows(
        "UPDATE notification_jobs SET state=CASE WHEN attempts>=5 THEN 'DEAD' ELSE 'PENDING' END,lease_until=NULL,next_at=clock_timestamp()+power(2,attempts)*interval '1 second',error_code='DELIVERY_FAILED' WHERE id=$1",
        [id],
      );
    }
  }
  close() {
    this.smtp.close();
  }
}
