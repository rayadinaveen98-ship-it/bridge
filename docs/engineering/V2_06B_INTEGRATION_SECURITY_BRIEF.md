# Bridge V2-06B — Private Messaging Storage, Key Security and Safe Integration Brief

**Status: PROPOSED / DOCUMENTATION ONLY / FOUNDER REVIEW REQUIRED.**
**Date:** 2026-11-16.
**Verified baseline:** main@d6d3267c88810e40a3529bfda3de64e2a13e4708, after V2-06A PR #26 merged, certification PR #27 merged and [Foundation CI #43826466068](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43826466068) matching + PostgreSQL integration SUCCESS.
**Authoritative contracts:** [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md) BR-004–017, BR-019–029, D-01–D-05, D-06a/b and M-01; [Architecture V2](ARCHITECTURE_V2.md); [V2 Implementation Packages](V2_IMPLEMENTATION_PACKAGES.md); [V2-06A evidence](V2_06_EVIDENCE.md).
**No approval conferred:** This document approves no SQL, crypto, app, API, roles, Neon inspection/migration, Render deployment, paid provider, key creation, retention deletion, beta or release action.

## 1. Product experience and security outcome

The product must let eligible consenting adult users:
- Chat in an **active, unexpired current random room** with no recoverable random-room history after the room ends.
- Independently Keep one another; retain a **free**, revocable mutual relationship with fresh independent direct session IDs, never copying the old random transcript.
- Send/read messages only in the **currently active direct session**, with server-owned 30-minute unique-accepted-message inactivity expiry.
- Receive individually intended **UNREAD** direct messages for at most **seven days from acceptance**, including after a direct session closes, without receiving previous-session pagination or a route to the old transcript. Acknowledge presentation and allow **up to fifteen minutes** for idempotent delivery recovery, bounded also by the original seven-day cap.
- Block/unmatch/report without charge. Blocks, relationship revocation, ineligibility or expired authorizations immediately deny access even if encrypted bytes have not yet been purged.

**Security claim boundary:** Propose **authenticated server-side encryption at rest**, not end-to-end encryption. The Bridge server can decrypt content within authorized operations. TLS, scoped server policy, DB privileges, encryption and incident controls are complementary; one does not replace another. Do not label Bridge "anonymous to operators," E2EE, or "fully secure" without separate verification.

## 2. Verified reasons V2-06A cannot simply be connected

| Repository fact | Integration consequence |
|---|---|
| apps/api/src/messaging/repository.mjs accepts only an acknowledged disposable loopback bridge_test URL and checks the pool connection string | Deliberately **synthetic** code. Never remove that guard or import it into production routes; build a new separately reviewed real-data adapter. |
| V2-06A persists a constant non-user marker in bridge_messages.body and opaque non-encrypted bytea fixtures | The field is **not confidential storage**, and the bytes **are not encryption**. Neither can carry real user content. |
| database/migrations/0001_bridge_foundation.sql bridge_messages.body TEXT NOT NULL; 0005_v2_delivery.sql payload and unread rows use FKs to bridge_messages | Existing 0005 V2 tables cannot store new standalone messages without involving the legacy body table. There is no accepted production plaintext alternative. |
| apps/api/src/http.mjs exposes /v1/conversations/:id/messages, /events, /peer, /close, /connection-vote and /v1/connections | All relevant V1 entry points must be checked against the V2 marker and access matrix; UI hiding does not prevent API disclosure. |
| apps/api/src/postgres.mjs::messages returns body ordered by numeric afterSequence for a currently OPEN room | Invalid as a V2 previous-history denial: an active new direct room could otherwise provide replay of content outside the intended current-only policy. |
| apps/api/src/outbox.mjs and SSE use at-least-once delivery | Duplicate/reordered notifications expected; body-free events and idempotent presentation required. SSE alone does not prove content confidentiality. |
| V2-02 policy, V2-04A expiry, V2-05A Keep/direct and V2-06A messaging are **disconnected** from hosted HTTP and PostgreSQL runtime | The current private QA app has **not** switched to any V2 invariant, notwithstanding passing isolated tests. |
| Architecture V2 records Neon owner BYPASSRLS and unknown actual Render DB runtime identity | RLS flags in a disposable test DB are not proof of live least privilege. A founder-authorized read-only inventory and privilege audit must precede any Neon change. |

**Legacy preservation:** Preserve exactly the old synthetic tester_a/tester_b identities, existing random room, four text messages and slot records. No retroactive expiry, reset, mutation, copy, backfill or unapproved live query.

## 3. Competing storage approaches and recommendation

### Option A — recommended: new V2-only metadata + encrypted payload and recipient envelope tables

Add **new** storage tables in a new numbered migration (proposed **0008**, subject to migration inventory) rather than editing 0001–0007, relaxing the V1 body's NOT NULL constraint, or writing confidential text/placeholder records into bridge_messages. Define versioned V2-only routes and DB adapters that never call generic V1 message body readers.

- **Proposed logical tables (names are candidates, not finalized DDL):**
  - bridge_v2_private_messages: id, conversation_id, sender_id, client_message_id, sequence_number, accepted_at, policy_version, state/authoritative scope. Distinct unique (room,sequence) and (room,sender,client_message_id).
  - bridge_v2_live_ciphertexts: message_id FK, encrypted payload bytes, cryptographic version, key ID, unique IV/nonce, authentication tag, purpose-bound AAD version, expires/purged markers; content ciphertext stored separately from sequence metadata.
  - bridge_v2_unread_envelopes: message_id FK, connection_id, recipient_id, independent AEAD payload or distinct protected key wrapping, accepted_at, hard expires_at <= accepted+7d, unread/acknowledged/expired/revoked, first acknowledged time and 32-byte recovery token digest; UNIQUE(message_id,recipient_id).
- Keep the previously authored 0005 V2 tables in place untouched and inactive for now. A later governed schema cleanup may deprecate them; **no destructive cleanup in V2-06B**.
- Secure metadata with app-side scope checks **plus** least-privilege database role/RLS policies; explicit state/policy markers and correctly ordered locks and authoritative clock. Neither UUID obscurity nor encryption substitutes for authorization.
- Distinct LIVE and UNREAD ciphertext lifetimes; ending a direct room denies LIVE access but does **not** invalidate an unread envelope solely due to room closure. A block/revocation immediately denies both.
- Operational trade-off: additional tables and encrypted copies increase schema complexity and storage, but avoid legacy plaintext coupling, support independent scope/retention and make cutover audit clearer.

### Option B — not recommended: reuse bridge_messages with a nonsecret marker body

Write only a fixed nonsecret marker into the mandatory V1 body field and encrypt content in a side table. This avoids a new V2 message index and makes some existing FKs easy, but requires keeping v1 rows and any generic reader fully isolated, permits V1 metadata/marker exposure on mistakes, and confuses future deletion and history contracts. The synthetic V2-06A adapter is **not** evidence this approach is safe for real users.

### Option C — not recommended now: relax bridge_messages.body NOT NULL

An additive nullable change plus complex dual writer/reader support could be made backward-compatible with careful rehearsal, but modifies the legacy schema contract and increases blast radius for current hosted QA, old clients, rollback and retention. Do not amend 0001–0007 retroactively.

**Decision requested:** approve Option A as a proposed direction only, then authorize an independently bounded **B1** schema/cryptography rehearsal PR if the detailed schema and key design are satisfactory. No existing customer/private QA content migration is proposed.

## 4. Proposed server-side authenticated encryption design (not implemented)

- Use a maintained, established authenticated encryption primitive such as **AES-256-GCM** via the supported Node crypto interface (subject to threat-model review); an encryption algorithm alone does not solve access control or key theft.
- Each encryption operation must generate an appropriate **unique nonce per key**; validate IV length/construction, integrity tag and per-key usage/rotation limits. Reject missing, reused, malformed or corrupt parameters in tests.
- Authentication-associated data (AAD) must be unambiguously serialized and cryptographically bind **policy version, scope (LIVE/UNREAD), message ID, conversation ID, sender ID, recipient ID where applicable, and envelope schema version**. A ciphertext replayed under a different scope, user or room must fail authentication.
- Treat network/proxy logs, analytics, traces, SSE outbox and notifications as **content-free**. Encrypt only at the trusted server boundary; content must never be persisted in legacy message body, error text or metrics.
- Use **separate key purposes** for payload AEAD, HMAC cursors and unread recovery capabilities. Key IDs and versions identify rotation epoch; keys never reside in Git, client builds, application DB or test fixtures used with private QA.
- Plan **envelope encryption** for future production: per-message DEK, independently protected by KEK held outside the ciphertext database with documented rotation, key loss, backup-restore and incident processes. A Render environment secret could be an inexpensive **synthetic QA-only interim key source**, but it offers limited separation if both app and DB access are compromised; its use for real users requires threat review and explicit founder sign-off. No paid KMS provider is approved.
- Real key custody/availability, incident response, compromised-key rotation, key hierarchy, provider availability/cost and disaster recovery remain **BLOCKED** until explicit approval.
- **Not E2EE:** operators may access plaintext in authorized server processing; do not market E2EE or absolute anonymity.

External technical guidance: OWASP Cryptographic Storage Cheat Sheet, NIST SP 800-38D (GCM); OWASP API1:2023 Broken Object Level Authorization. References:
- https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- https://csrc.nist.gov/pubs/sp/800/38/d/final
- https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/

## 5. Trust boundaries, explicit endpoint decisions

### Inbound HTTP authentication (FUTURE; separate scope)
1. Verify a signed, unexpired, revocable identity token server-side; map subject to an eligible DB account. **Never** accept actorId, verifiedAdult, authorized, blocked, premium, role or trusted-session flags from caller JSON.
2. Server must load actual account, bilateral peer, session, connection, blocks, current policy version and authoritative DB time. Central V2-02 policy must return a typed **allow/deny** per operation, independent of UI state.
3. Inside one ordered locking transaction, re-check session/pair state and deadline **after lock waits**, validate the message identity/payload, encrypt, sequence, append outbox metadata and recipient envelope atomically. Duplicate clientMessageId returns previous acceptance without extending deadline; differing content is a conflict.
4. Protect response/body access at both API and **least-privileged database** levels. Uniform outsider/guessed-ID denial and non-oracular error response.
5. SSE carries **only hints** such as protected message identifiers/sequence; each subsequent body fetch must independently re-authorize. On block, logout, token revocation, clock expiry or relationship end, protected reads stop even if the socket remains open.

### Required V1 route inventory (V2 cutover gate)
Audit every existing V1 entry point before giving a V2 conversation ID to any client:
- GET/POST /v1/conversations/:id/messages
- GET /v1/conversations/:id/events
- GET /v1/conversations/:id/peer
- POST /v1/conversations/:id/close
- PUT /v1/conversations/:id/connection-vote
- GET /v1/connections
- GET /v1/bootstrap
- Block and report paths, active match searches/queue and old Android local data/notification surfaces

At G1/V2-11, a stale client must either receive **safe upgrade-required/deny** for V2 resources or pass exactly equivalent server-side scopes; never expose a protected transcript via old generic reader. **Rollback after privacy cutover is safe deny or forward fix, not old unrestricted V1 replay.** Legacy synthetic QA room access is separately governed; do not prematurely break it before operator R0 sign-off.

### Recipient unread lifecycle
- Only a mutual's intended recipient gets a finite delivery envelope, never random rooms, self-sent items or former/blocked contacts.
- Encrypt recipient copy independently of LIVE payload. Read through recipient-scoped endpoint; don't turn envelope into a previous-session timeline. No old room body fetch or source-room ID in unread response.
- Acknowledge only after the Android client has safely presented the message. Exactly one first acknowledgment establishes idempotent recovery, bounded to min(first_ack+15m, accepted+7d) **proposed interpretation requiring founder confirmation**.
- For Android process kill, offline reconnect and two devices, design crash-state and deduplication with a bounded capability, no body leaks in screenshots/notifications/OS backups and minimal local persistence (device-level testing V2-10).
- Physical removal and lawful safety evidence are separate later governance gates: immediate logical deny is not physical deletion.

## 6. Separate integration work packages and authority

| Gate | Proposed deliverable | Exact approval boundary |
|---|---|---|
| **B0 — NOW** | Documentation: threat model, storage alternatives, explicit design/acceptance/rollback | Only docs. No code, keys, queries to live Neon or service |
| **B1 — NEXT, separately approved** | Disconnected **0008 additive V2-only schema** plus synthetic PG16 migration/rehearsal/backup/restore and pure AEAD/key-contract tests under new messaging modules; validate nonce/AEAD/AAD/corruption/rotation | **Only new numbered SQL, disconnected crypto source/tests, test-only CI and evidence.** No current API, old SQL changes, Android, Neon or real keys |
| **B2 — separate founder approval** | Private V2 server adapter designed around trusted authorization, scoped encrypted storage, atomic send/delivery and byte-free outbox; isolated fake HTTP/PG tests | May not connect hosted endpoints; audit interop/lock order and least-privilege DB policy via synthetic tests |
| **B3 — architectural readiness only** | Full HTTP versioned route table, old V1 path safe-deny/upgrade plan, Android protocol, monitoring/rollback rehearsals | **Actual activation/deployment must wait for V2-10 + G1/V2-11 and independent founder approval**, not part of B1/B2 |
| **R0** | Exact physical phone/tablet acceptance for legacy private QA | Operator-run evidence gate remains OPEN |
| **G1/V2-11** | Founder-approved non-destructive Neon migration, runtime principal isolation, version gate, private synthetic staged rollout, old reader safe-deny | No public users, real identities or payment; authorized separately |
| **V2-16** | Final comprehensive 138-scenario What If? audit and founder release go/no-go | Remains last; mandatory package safety tests run earlier |

**Do not silently change app/cloud/SQL just because B1/B2 pass.** Initial B1 exact proposed file allowlist is new database/migrations/0008_v2_private_messaging.sql; new apps/api/src/messaging/private_crypto.mjs and crypto key-contract helper; synthetic apps/api/tests/v2/private_crypto/** and migrations rehearsal additions; additive package test scripts, Foundation CI test steps and new evidence document. Exact list/DDL must be approved in an implementation-specific follow-up PR brief, not inferred from this planning document. Existing migrations 0001–0007 cannot be edited.

## 7. Proposed numbered acceptance matrix (UNIMPLEMENTED)

| IDs | Acceptance requirements |
|---|---|
| B06-01–04 | New V2-only tables, FK/unique/RLS/role constraints, sequential migration and protected old QA fixture |
| B06-05–08 | Disposable apply twice, interrupted 0008 rollback, backup/restore byte/hash preservation, legacy inserts unchanged |
| B06-09–12 | AEAD encryption/decryption, nonce uniqueness/usage, authentication tag tamper rejection, wrong scope/AAD rejection |
| B06-13–16 | Key separation/version/rotation, wrong/retired key safe denial, no secrets in DB/CI logs, no plaintext body writes |
| B06-17–20 | Trusted subject-to-account mapping, outsider/guessed IDs deny, blocked/revoked/ineligible deny, old V1-route bypass denied |
| B06-21–24 | Two-device duplicate/reorder/idempotent acceptance, clock sampled after locks, atomic encrypted write/outbox/recipient envelope, endpoint replay and no cross-session body |
| B06-25–28 | Seven-day unread and 15m recovery boundaries, direct ended but unread still authorized, crash/ack race and sender-revocation race |
| B06-29–32 | Key loss/fail-closed/partial recovery, privacy-safe rollback after cutover, legacy 4-message fixture intact, Android phone/tablet and full suite with known build/deploy SHA |

**Traceability rule:** B1 can PASS only B1-specific schema/crypto checks; B2 can PASS isolated integration tests; B3 can PASS documentation/protocol review; V2-11 physical and hosted acceptance cannot be reported as passed in these earlier stages. No blanket "32/32 PASS" until exact mapped tests exist. Every failing regression blocks merge.

## 8. Risk register, cost and exit conditions

- **Critical:** plain legacy message body coupling; v1 read bypass; actual least-privilege runtime role unknown; no encryption/key management; untested cross-version lock order; production authentication and moderation not ready.
- **High:** key/nonce misuse and backup exposure; unauthorized cross-recipient unread; race between Block/End/accept; stale Android cursor/cache/notification leaks; sender message restoration after session expiry; lost key makes unread unavailable.
- **Medium:** duplicate AEAD payload copies and index costs; possible Render Free sleep/disconnections; long-held locks, growth and migration operability; metadata inference even with encrypted bodies.
- **Cost recommendation:** keep existing free synthetic QA infrastructure. Use Node built-in crypto and disposable local PG16 tests for B1 *subject to review*. No purchases, KMS subscription, other paid services or unexpected hosting tier changes are authorized. Reassess capacity and provider costs before real-user beta.
- **Rollbacks:** B1/B2 disconnected PR revert and disposable test DB discard; approved additive live DDL expansion would need forward compatibility and **may not** be reversible by dropping tables containing data. Once G1 read scope is active, fallback is safe-deny and forward fix; never revert unrestricted /v1/.../messages.
- **Exit:** founder signs off storage Option A vs alternatives, AEAD/key storage threat model, detailed B1 file/SQL scope, 7d/15m boundary rule, actual runtime role audit plan, no-live rule, and R0 unchanged. Only then may B1 disconnected engineering begin. Live activation, public beta, paid keys and retention remain separately gated.

## Founder decision requested

**Proposed:** "Approve Bridge V2-06B Option A for planning and authorize drafting the exact B1 disconnected 0008 schema plus crypto test-only engineering brief. Do not authorize B1 implementation, Neon/Render access/deploy, Android, billing, retention or API cutover."

This document is an architecture proposal, not a coded or tested feature.
