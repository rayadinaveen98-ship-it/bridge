# M1 state and failure contracts

## Search
\`idle → waiting → reserved → connected → ended\`. Alternatives: \`waiting → cancelled|expired|unmatched\`, \`reserved → expired\` after lease. No cancelled/ended resurrection. The server holds unique active match slots per account and revalidates blocks and eligibility inside a transaction.

## Messaging
The client assigns \`clientMessageId\` UUID and an independent idempotency header. Server authenticates and authorizes conversation participant, open status and no block; reserves next sequence under lock, commits durable message and **then** emits event. Replayed request returns same durable message. Recipients may receive events twice and dedupe by server message ID. Reconnect uses \`afterSequence\`.

## Connection
Each user makes an independent decision. Only two fresh accepted votes lead to a connection. Withdrawals, blocked users and stale requests must not allow connection creation.

## Safety
Blocking is server-authoritative and immediately prevents further messaging, matching and reconnecting. Reports receive stable IDs, access-limited evidence handling, human moderation. Client report dialog is not a moderation system.

## API error semantics
\`401\` missing auth; \`403\` ineligible/blocked/not a participant; \`404\` not found **or not visible**; \`409\` active-session/state/idempotency conflict; \`422\` invalid input/language; \`429\` rate limit. Avoid leaking strangers' identities.

## Operational language policy
Explicitly selected languages require a mutually supported language with actual moderation capability. The language list has no geographic or language rank and no silent fallback. Empty pools should be reported honestly.

## Next validation
Concurrent row-lock/reservation tests on real Postgres, auth/RLS penetration tests, stress-test queues, privacy/retention review, human moderation operations and real device messaging.
