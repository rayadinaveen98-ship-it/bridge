# PostgreSQL schema foundation

This is a **proposal, not an applied migration**. Use only on a dedicated Bridge database. A DBA/security review and a disposable-database dry run are required.

## Transaction-level invariants
1. **Match:** Lock both accounts/queues in canonical UUID order. Recheck age verification, active/safe accounts, both directions of blocks, explicit shared *moderation-ready* language and slot uniqueness. Create one session and **two active slots atomically**. If either insertion fails, rollback both.
2. **Send:** Server authenticates sender, validates active conversation participation and both-way blocks within transaction; serialize on conversation row, increment \`next_message_sequence\`, persist message; publish event only after commit. A client retry with same \`client_message_id\` returns the existing message. Never trust client-supplied sequence.
3. **Connect:** Two distinct, affirmative and unwithdrawn votes from current participants, and no blocks; enforce in one transaction. No single-sided connect.
4. **Block:** Immediately prevent messaging and rematching, remove slots and end relevant sessions. Blocking cannot be undone by a delayed message or queue event.
5. **Retention:** Ephemeral conversations, evidence and account deletion must follow a reviewed policy with legal-preservation requirements.

## Schema scope
Accounts, pseudonymous profiles, explicit unranked language selection, preferences, blocks, match queue/session/slots, conversation participants, durable messages and idempotency, double-opt-in votes, persistent connections, reports, enforcement, audits and privacy requests.

## Security
- Every table has RLS enabled, and none has any direct-client policies. Access is via audited backend service with least privilege, **not an app-side service key**.
- Supabase/PostgREST table permissions must be explicitly inspected; RLS + grant design requires deployment review.
- Database constraints are defense-in-depth, **not** a full substitute for participant authorization and transactional rechecks.
- Age flags originate from trusted age-assurance verification, never from mobile checkbox/self-assertion.

## Not done
No running DB, no migration execution, no live moderation, no CI Postgres integration test, no deployment, no API service.
