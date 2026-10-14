import amqp, { ChannelModel, ConfirmChannel, ConsumeMessage } from "amqplib";
import { Db } from "./db";
import { config } from "./config";
import { assert, failpoint } from "./common";
import { config as runtimeConfig } from "./config";
import { failures, log } from "./metrics";
import { z } from "zod";
import { randomUUID } from "node:crypto";
const envelopeSchema = z
  .object({
    event_id: z.uuid(),
    event_type: z.enum([
      "ReservationCreated",
      "ReservationExpired",
      "ReservationCanceled",
      "BookingConfirmed",
      "EventCanceled",
      "RefundRequested",
      "RefundSucceeded",
      "CatalogChanged",
      "TicketArtifactsRequested",
    ]),
    schema_version: z.literal(1),
    occurred_at: z.iso.datetime({ offset: true }),
    aggregate_id: z.uuid(),
    correlation_id: z.string().min(1).max(128),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
const exchange = "ticketflow.events",
  queue = "ticketflow.jobs",
  dlq = "ticketflow.dead";
export class Messaging {
  connection?: ChannelModel;
  channel?: ConfirmChannel;
  ready = false;
  stopping = false;
  consumerTag?: string;
  private publications = new Map<string, { returned: boolean }>();
  constructor(private db: Db) {}
  async connect() {
    if (this.ready || this.stopping) return;
    if (this.connection) {
      try {
        await this.connection.close();
      } catch {
        log("broker_connection_reset");
      }
      this.connection = undefined;
    }
    let opening: ChannelModel | undefined;
    try {
      const c = await amqp.connect(config.RABBITMQ_URL, { timeout: 3000 });
      opening = c;
      c.on("error", () => {});
      c.on("close", () => {
        if (this.connection !== c) return;
        this.ready = false;
        this.channel = undefined;
        this.consumerTag = undefined;
        this.connection = undefined;
      });
      const ch = await c.createConfirmChannel();
      ch.on("return", (msg) => {
        const pending = this.publications.get(
          String(msg.properties.headers?.["x-publication-id"]),
        );
        if (pending) pending.returned = true;
      });
      ch.on("error", () => {
        this.ready = false;
      });
      await ch.assertExchange(exchange, "topic", { durable: true });
      await ch.assertExchange("ticketflow.dlx", "fanout", { durable: true });
      await ch.assertQueue(dlq, { durable: true });
      await ch.bindQueue(dlq, "ticketflow.dlx", "");
      await ch.assertQueue(queue, {
        durable: true,
        arguments: { "x-dead-letter-exchange": "ticketflow.dlx" },
      });
      await ch.bindQueue(queue, exchange, "#");
      for (let n = 1; n <= 5; n++) {
        const q = `ticketflow.retry.${n}`;
        await ch.assertQueue(q, {
          durable: true,
          arguments: {
            "x-message-ttl": Math.pow(2, n) * 1000,
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": queue,
          },
        });
      }
      await ch.prefetch(10);
      this.connection = c;
      this.channel = ch;
      this.ready = true;
      const consumer = await ch.consume(
        queue,
        (msg) => {
          if (msg)
            void this.consume(msg).catch(() => {
              this.ready = false;
              void ch.close().catch(() => {});
            });
        },
        { noAck: false },
      );
      this.consumerTag = consumer.consumerTag;
    } catch {
      this.ready = false;
      try {
        await opening?.close();
      } catch {
        log("broker_connect_failed");
      }
    }
  }
  async confirmed(
    exchangeName: string,
    routing: string,
    body: Buffer,
    options: amqp.Options.Publish = {},
  ) {
    const ch = this.channel;
    assert(ch && this.ready, 503, "BROKER_UNAVAILABLE");
    const publicationId = randomUUID(),
      pending = { returned: false };
    this.publications.set(publicationId, pending);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Publish timeout")),
          5000,
        );
        try {
          ch.publish(
            exchangeName,
            routing,
            body,
            {
              ...options,
              headers: {
                ...options.headers,
                "x-publication-id": publicationId,
              },
              persistent: true,
              mandatory: true,
            },
            (error) => {
              clearTimeout(timer);
              if (error || pending.returned)
                reject(error || new Error("Unroutable"));
              else resolve();
            },
          );
        } catch (error) {
          clearTimeout(timer);
          reject(error);
        }
      });
    } finally {
      this.publications.delete(publicationId);
    }
  }
  async publish() {
    if (!this.ready || this.stopping) return;
    const rows = await this.db.rows(
      "UPDATE outbox_events SET lease_until=clock_timestamp()+interval '30 seconds',attempts=attempts+1 WHERE id IN (SELECT id FROM outbox_events WHERE published_at IS NULL AND NOT dead AND next_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 100) RETURNING *",
    );
    await Promise.allSettled(
      rows.map(async (row) => {
        if (this.stopping) return;
        const envelope = {
          event_id: row.id,
          event_type: row.event_type,
          schema_version: row.schema_version,
          occurred_at: row.created_at,
          aggregate_id: row.aggregate_id,
          correlation_id: row.correlation_id,
          payload: row.payload,
        };
        try {
          await this.confirmed(
            exchange,
            row.event_type,
            Buffer.from(JSON.stringify(envelope)),
            { messageId: row.id, contentType: "application/json" },
          );
          await this.db.rows(
            "UPDATE outbox_events SET published_at=clock_timestamp(),lease_until=NULL WHERE id=$1",
            [row.id],
          );
        } catch {
          failures.inc({ kind: "outbox" });
          await this.db.rows(
            "UPDATE outbox_events SET lease_until=NULL,next_at=clock_timestamp()+least(300,power(2,attempts))*interval '1 second',dead=attempts>=5 WHERE id=$1",
            [row.id],
          );
        }
      }),
    );
  }
  async consume(msg: ConsumeMessage) {
    const ch = this.channel!;
    let envelope: any;
    try {
      envelope = JSON.parse(msg.content.toString());
      envelopeSchema.parse(envelope);
      assert(
        typeof envelope.event_id === "string" &&
          /^[0-9a-f-]{36}$/i.test(envelope.event_id) &&
          envelope.schema_version === 1 &&
          typeof envelope.event_type === "string",
        400,
        "INVALID_MESSAGE",
      );
      await this.db.transaction(async (tx) => {
        if (
          !process.env.TEST_FAILPOINT_EVENT_ID ||
          process.env.TEST_FAILPOINT_EVENT_ID === envelope.event_id
        )
          failpoint("consumer_transaction");
        const inserted = await this.db.one(
          "INSERT INTO processed_messages(consumer_name,event_id) VALUES('notifications-v1',$1) ON CONFLICT DO NOTHING RETURNING event_id",
          [envelope.event_id],
          tx,
        );
        if (!inserted) return;
        if (
          ["BookingConfirmed", "RefundSucceeded"].includes(envelope.event_type)
        )
          await tx.query(
            "INSERT INTO notification_jobs(business_key,booking_id,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [
              `${envelope.event_type}:${envelope.aggregate_id}`,
              envelope.aggregate_id,
              envelope.event_type === "BookingConfirmed"
                ? "confirmation"
                : "refund",
            ],
          );
      });
      if (
        runtimeConfig.APP_MODE === "test" &&
        (!process.env.TEST_FAILPOINT_EVENT_ID ||
          process.env.TEST_FAILPOINT_EVENT_ID === envelope.event_id) &&
        process.env.TEST_FAILPOINT === "consumer_after_commit"
      ) {
        await this.connection?.close();
        this.ready = false;
        return;
      }
      ch.ack(msg);
    } catch {
      failures.inc({ kind: "consumer" });
      const previous = Number(msg.properties.headers?.["x-attempt"] || 0);
      const attempt =
        Number.isInteger(previous) && previous >= 0 ? previous + 1 : 5;
      if (attempt >= 5) {
        await this.db.rows(
          "INSERT INTO dead_letters(event_id,envelope,error_code) VALUES($1,$2,$3)",
          [
            envelope?.event_id && /^[0-9a-f-]{36}$/i.test(envelope.event_id)
              ? envelope.event_id
              : "00000000-0000-0000-0000-000000000000",
            JSON.stringify(envelope || { malformed: true }),
            "CONSUMER_FAILED",
          ],
        );
        await this.confirmed("ticketflow.dlx", "", msg.content, {
          headers: { "x-attempt": attempt },
        });
      } else
        await this.confirmed("", `ticketflow.retry.${attempt}`, msg.content, {
          headers: { "x-attempt": attempt },
        });
      ch.ack(msg);
    }
  }
  async pause() {
    this.stopping = true;
    if (this.channel && this.consumerTag) {
      try {
        await this.channel.cancel(this.consumerTag);
      } catch {
        log("consumer_pause_unavailable");
      }
      this.consumerTag = undefined;
    }
  }
  async close() {
    await this.pause();
    this.stopping = true;
    this.ready = false;
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      log("broker_shutdown");
    }
  }
}
