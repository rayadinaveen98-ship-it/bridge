# Bridge M1 durable event outbox

The accepted message and its notification intent now share the same PostgreSQL transaction. The outbox contains only conversation ID, message ID and sequence number—not private message text.

An internal worker can claim due events with `FOR UPDATE SKIP LOCKED`, publish them through an injected authenticated transport, then acknowledge the row. Failed publication is retried with a bounded exponential delay. Delivery is **at least once**, never exactly once. Downstream clients must deduplicate by message ID and fetch message history using sequence numbers after reconnect.

Files:
- `database/migrations/0002_message_outbox.sql` — new RLS-enabled event outbox.
- `apps/api/src/outbox.mjs` — claim/ack/retry worker implementation.
- `apps/api/src/postgres.mjs` — atomic enqueue after first message acceptance.
- `apps/api/tests/outbox.test.mjs` — fake-DB publisher ordering tests.
- `apps/api/tests/postgres.integration.test.mjs` — real DB row and idempotency assertions.

**Not implemented:** Production publisher adapter, broker, worker process, operational alerts/dead-letter handling, live WebSocket subscriptions, physical-device tests. The added outbox does NOT itself mean real-time messaging works.

**Verified on isolated PostgreSQL 16 CI:** migrations 0001+0002, message-outbox atomicity/deduplication, simulated transport failure and replay/ack, and public-style database role RLS tests passed on October 23, 2026 ([Actions run](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488)). This validates the tested paths only, not production operations, load behavior, or security approval. Never deploy the schema to a shared database without review.
