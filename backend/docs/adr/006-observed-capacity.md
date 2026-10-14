# ADR 006: Confirm batches, immutable capture time and measured operations

Accepted after real load verification. Awaiting each persistent publisher confirm sequentially produced thousands of pending events despite passing HTTP latency targets. Claim at most 100 outbox rows and pipeline their publication; correlate mandatory returns per transport publication, await each confirm, then mark that row published. A single return dispatcher avoids listener growth and prevents one unroutable message from tainting another. Consumers retain bounded prefetch and transactional deduplication. Expiry claims are bounded at 100; the worker polls every 250ms, skips overlapping ticks and stops new claims on shutdown.

Financial daily sales use immutable `captured_at`, meaning the database instant when verified capture is recorded. Session recovery/cleanup may update `updated_at` later and must not move an existing sale into another UTC day. A database constraint pairs SUCCEEDED with a non-null capture instant. Earlier demonstration records are backfilled from their recorded update instant.

Reference: [RabbitMQ publisher confirm latency and asynchronous batching](https://www.rabbitmq.com/docs/confirms#ack-latency-for-persistent-messages). Mandatory returns precede confirms; each publication must track its own routing outcome. Publisher confirmation remains distinct from consumer completion.
