# Bridge M1 — authenticated live notifications (internal SSE)

**Implemented but not publicly deployed.** A single process now provides an authenticated Server-Sent Events (SSE) feed at `GET /v1/conversations/{conversationId}/events` with an `Authorization: Bearer <RS256 JWT>` header.

## Delivery flow

1. A verified subject can open a stream **only** after server-side conversation membership, eligibility, active relationship and block checks pass.
2. The server registers the stream and sends `ready`. **Only then** the client fetches `GET /v1/conversations/{conversationId}/messages?afterSequence=N` to reconcile missed messages. This prevents losing events between the REST replay and stream subscription.
3. The background worker drains the PostgreSQL outbox every 350 ms. It publishes *message-available* hints containing the conversation UUID, message UUID and sequence only—not message text. Each subscriber gets authorization rechecked before delivery.
4. On each hint, the client calls the authenticated messages endpoint with the highest contiguous received sequence, deduplicates by message ID and persists its cursor locally.
5. On disconnect, restart, block, or reconnect, repeat steps 1–2. The database remains authoritative; the notification stream is **at least once** and best-effort, not a message store.

## Security limitations

- Real identities/message text are never included in SSE event data, but event metadata is sensitive and stays behind bearer auth.
- Stream JWT signature/expiry and database eligibility are rechecked before every event and 20-second heartbeat. Active session revocation, issuer key rotation, and emergency disconnect policy remain unimplemented; do not expose publicly.
- In-memory hub works for **exactly one Node process**. Multiple API instances require a shared pub/sub transport; otherwise an outbox event claimed by the wrong instance can leave a connected client without a live hint (REST replay still recovers).
- In-memory per-subject rate limits do not stop distributed abuse.
- The service must remain bound to `127.0.0.1` or `::1`; no public internet reverse proxy is configured.
- Flutter can use streaming HTTP with Authorization; browser-native EventSource cannot set custom Authorization headers. Do not put bearer tokens in query strings.
- There is no iOS/Android app, push notifications, TLS termination, auth provider, human moderation operation, age assurance, privacy/legal signoff or external deployment.

## Testing

`npm test --prefix apps/api` exercises two independent authenticated SSE HTTP clients, outsider rejection, event privacy, disconnect and REST replay, and subscriber count bounds. Other tests exercise outbox at-least-once and PostgreSQL matching. The integrated outbox-to-SSE flow passed isolated PostgreSQL 16 tests with two authorized subscribers and denied/revoked subscribers in [CI run 39934866721](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39934866721). The result remains scoped to one process and synthetic test accounts; load and production security tests are pending.

## Next technical gate

Hosted GitHub CI is green. Implement active session revocation (expiry checks exist), private lab environment support, crash/restart/backpressure testing, concurrent multi-worker behavior and the first Flutter test client. No public chat until safety/age-verification requirements are complete.
