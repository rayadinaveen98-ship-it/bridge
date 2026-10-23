# Technical architecture proposal V1

**Status: design proposal. No backend, infrastructure, accounts, APK or moderation service is deployed.**

## Logical components
- Flutter Android application: onboarding, discovery, chat, connections, privacy & support.
- TypeScript/NestJS service: signed sessions, eligibility, match/relationship authorization, moderation APIs.
- PostgreSQL/Supabase: durable account, preference, conversation, messages, reports and consent records.
- Managed realtime delivery: presence, subscriptions and message delivery events; database remains source of truth.
- Redis **if/when needed**: short-lived queue leases, locks, presence and backpressure.
- FCM: opt-in notifications; avoid exposing message contents on lock screen by default.
- React/Next.js admin: reviewer-only queue, sanctions, appeals, audit logs.

## Minimal entities
accounts, identities, age_eligibility, consents, preferences, languages, match_queue, match_sessions, conversations, participants, messages, connection_requests, connections, blocks, reports, evidence_refs, enforcement_actions, audit_logs, devices, privacy_requests.

## Matching invariant
One active match per account. Atomically reserve eligible user pairs with no mutual blocks and at least one explicitly selected shared supported language. Soft-score compatible intents and interests without language-list position or market ranking. Expire leases; guard retries with idempotency keys and server transactions.

## Messaging
Accept only authenticated current participants; assign server-side durable message ID and order before delivery event. Track acknowledged/failed delivery separately. Deny send after exit or block. Implement resume, pagination, dedupe and retention.

## Relationships
Server stores pairwise request states: none, pending, accepted, declined, withdrawn, expired, blocked. Only two affirmative consents create a connection. Enforce via database constraint/transaction, not client-side flags.

## Authorization/security
RLS least-privilege or backend-only restricted access. No client capability to enumerate random other users or subscribe to unrelated rooms. Rate limits, account abuse heuristics, safe error messages, secret management, audit trails, backup/restore and deletion validation.

## Encryption
TLS and encryption-at-rest planned for V1; do **not** call this E2EE. True E2EE would require separate threat modeling, key lifecycle design, cryptography review and user-controlled report mechanisms.

## M1 acceptance
Two physical Android devices can create eligible test accounts, match, exchange and recover durable messages, safely leave/block/report, and form mutual connections. Unauthorized access and duplicate-match attempts must fail in integration tests.
