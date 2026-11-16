# Bridge V2-06 — Privacy-Scoped Live Messages and Finite Unread Delivery

**Status:** PROPOSED IMPLEMENTATION BRIEF — DOCUMENTATION ONLY; V2-06 code NOT authorized.
**Prepared:** 2026-11-16.
**Verified baseline:** main@d50a4d00d7545c555e99f1f09283145520960a01; V2-05A PR #24 merged; [post-merge Foundation checks #43820774828](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43820774828) completed SUCCESS for matching and postgres-integration.
**Source of truth:** [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md) BR-004–006, BR-009–017, BR-019–026, BR-029, D-01–D-05, D-06a/b and M-01; [Architecture V2](ARCHITECTURE_V2.md); [Implementation packages](V2_IMPLEMENTATION_PACKAGES.md); [V2-05 evidence](V2_05_EVIDENCE.md).
**Authorization for this PR:** docs inspection, reconciliation and planning only. No source code, migrations, app, Neon/Render, CI wiring, protected messages, retention or release changed.

## 1. Intended user outcome and precise privacy model

While a random or free mutual direct session is OPEN and eligible, each member may send and see the **current session only**. Only a newly accepted unique message extends that session's server-owned 30-minute idle deadline. Leaving the screen, reconnecting, polling, receiving an SSE hint and retrying an already accepted message do not extend it.

For an **active mutual relationship**, the intended recipient may receive a separately stored **recipient-scoped unread envelope**, even when the originating direct segment is now closed, until the envelope's accepted-message timestamp plus seven days. Its delivery is an inbox item, not a historical timeline or navigation into the old room. Acknowledgment consumes the unread item; a bounded recovery mechanism covers an interrupted presentation, with a 15-minute maximum retry window. Block, relationship revocation or failed eligibility immediately denies access even if a record remains in storage.

No free previous-session transcript, no random-session unread archive, no retroactive migration of earlier stranger bodies, no premium history, no notifications carrying bodies, and no public-user activation.

## 2. Repository evidence and blockers

| Observed current source | Verified implication for V2-06 |
|---|---|
| Existing apps/api/src/http.mjs GET /v1/conversations/:id/messages uses afterSequence | The v1 handler supplies a generic historical read surface. It must be denied or made scope-safe during separately authorized V2-11 cutover before any V2 ID reaches a hosted client. |
| Existing apps/api/src/postgres.mjs sendMessage/messages uses bridge_messages.body (NOT NULL), participant check and conversation open state | Legacy body storage and generic pagination cannot be treated as privacy-safe V2 live or unread. Do not wire V2 routes to these methods. |
| Existing apps/api/src/outbox.mjs dispatches at-least-once and SSE hint events, not exactly-once | Duplicates and reordered transport events are expected; use durable sequence/cursor state and idempotent client presentation. Never send message bodies in event payloads or logs. |
| 0004_v2_metadata.sql adds V2 markers, last_accepted_at, idle_expires_at, payload_scope, content_purged_at | New V2 rows must have explicit marker/role and valid server clock; legacy_qa must stay untouched. |
| 0005_v2_delivery.sql adds bridge_message_payloads and bridge_unread_deliveries, plus bridge_v2_direct_sessions | The unread table constrains at most one envelope per (message_id,recipient_id), expires_at at most seven days, recovery digest length 32, and state unread/acknowledged/expired/revoked. It does NOT implement access authorization, content encryption, key management or timers. |
| 0005_v2_delivery.sql ciphertext and encrypted_copy are bytea | Merely storing bytea is NOT proof of encryption. No reviewed encryption/key-provider, rotation, backup or purge solution exists yet; treat ciphertext as synthetic opaque bytes in disconnected tests only. |
| 0001 bridge_messages.body remains NOT NULL after migrations 0004–0007 | This is a material unresolved privacy/storage design gate. Avoid writing actual secret bodies into the legacy plaintext column as a workaround. Propose a separate future schema/key-management review, not a silent in-place migration. |
| V2-02 policy kernel, V2-04A random lifecycle, V2-05A Keep/direct modules | All are disconnected from current HTTP routes. Internal actor IDs are trusted adapter inputs, **not** authentication. V2-06 must enforce its own typed guards and test race ordering without pretending these parts are live-wired. |
| V2-05A post-merge Foundation #43820774828 | Matching and disposable PG16 jobs passed; **no device test or live V2 enforcement** was established. |

Private QA uses Render Free, Neon Free and two synthetic identities. The original four-message/one-room/two-slot fixture must remain intact. R0 physical phone/tablet acceptance remains OPEN. Nothing in this proposal authorizes querying live Neon.

## 3. Proposed bounded engineering package: V2-06A — DISCONNECTED

**Recommendation:** Authorize V2-06A separately as a pure, testable message-scope and recipient-unread state engine, plus isolated PostgreSQL 16 synthetic tests. The first PR should not send or expose real message bodies or attach to existing routes.

| Proposed path | Scope for separate approval |
|---|---|
| apps/api/src/messaging/scope.mjs | Pure LIVE vs UNREAD guard, typed current-session role/state/participants, deadline, block and relationship checks; reject previous-room and legacy markers; only server-derived trusted context. |
| apps/api/src/messaging/sequence.mjs | Pure accepted-message identity/sequence, duplicate/conflict handling, monotonic authorized cursor/checkpoint/tombstone protocol; no previous-session pagination. |
| apps/api/src/messaging/unread.mjs | Pure recipient-only 7-day envelope state, acknowledgment and one-use/bounded recovery token policy. |
| apps/api/src/messaging/repository.mjs | DISCONNECTED synthetic PostgreSQL adapter: atomic sequence+idempotency metadata; receipt/outbox metadata-only and unread envelope transitions using existing 0004–0007 schema and fixture opaque bytes. No production content encryption claims. |
| apps/api/tests/v2/messaging/** | Deterministic pure time and authorization tests, PG16 concurrency/race/rollback tests, synthetic ciphertext fixture and legacy-four-message SHA manifest. |
| apps/api/package.json | Named test-only runner; unchanged production start. |
| .github/workflows/foundation.yml | Add isolated pure + disposable PG16 tests to existing jobs, preserving all prior checks. |
| docs/engineering/V2_06_EVIDENCE.md | Test-to-requirement trace, exact head/merge CI, prohibited file diff and remaining blockers. |

**Strictly prohibited in V2-06A:** modifying existing HTTP/PostgreSQL/auth/SSE/outbox/start/policy/V2-04A/V2-05A production modules, SQL migrations 0001–0007, Android, Render, live Neon schema/data/roles, existing QA users/rooms, payment, subscriptions, identity, retention deletion, background workers, notification content, production key material or release artifacts. If a needed API requires these, stop and prepare a separately reviewed V2-06B/V2-11 change proposal.

**Suggested PR boundary:** V2-06A may introduce new disconnected files and test-only package/CI/evidence changes; no use by the service import graph, no network listener and no cloud credentials. The exact file list must be approved before implementation. V2-06B should be a **future** integration-design gate only, contingent on explicit storage/crypto, policy+SQL role, legacy route and compatibility decisions. Do not auto-start it after V2-06A.

## 4. Proposed protocol contracts (to freeze before coding)

### LIVE scope
- Strict random: valid V2 marker, currently OPEN/unexpired; both participant and adult/safety authorization; block denies. No read of any ended random segment, even if message bytes remain stored.
- Strict direct: valid V2 marker, OPEN/unexpired and attached to the active, unblocked mutual pair; only current D1 or D2 and its own sequence. A new D2 must never replay D1.
- New accepted unique message: transaction checks membership, current state and **clock_timestamp() after locks**; append exactly once; advance sequence by one and set idle expiry based on its **acceptance time**. A duplicate with same sender/client_message_id and identical content metadata returns the same acceptance; different payload is conflict and does not reset deadline.
- Expiration at now >= deadline denies acceptance; if a lock waits past the deadline, it may not accept based on stale transaction start time. End and Block races fail closed.
- Authorized LIVE replay may return ordered items/checkpoints from current active session only. An opaque cursor must bind to actor, session and scope. Deleted/purged bodies advance a checkpoint/tombstone without exposing body or providing a path to earlier sessions.
- No secret in logs, SSE events, notification previews, URL cursor or audit trace. Push and Android clients remain outside V2-06A.

### UNREAD scope
- ONLY direct messages addressed to the other member of an active eligible mutual relationship, never random chat or a sender's own envelope.
- An envelope has intended recipient, connection, source message, accepted timestamp, expiry <= accepted+7d, opaque encrypted_copy **test fixture only** and a recipient-only visibility rule.
- Relationship remaining mutual is sufficient to deliver an eligible unread item after its direct segment closes; source-room transcript access stays denied.
- Acknowledge is idempotent and scoped to the authenticated recipient; if repeat acknowledgment occurs, it must not create a new seven-day window or a second recovery grant.
- First acknowledged presentation issues a cryptographically unpredictable recovery capability whose **digest only** is stored; future credential issuance requires an approved trusted production entropy/transport design. The capability binds recipient+envelope+scope and cannot be guessed, reused by other recipients, or extended by repeated recovery.
- Recommended conservative boundary (not yet an approved product change): recovery access ends at **min(first_ack+15m, accepted_at+7d)**; founder must approve this interpretation because D-06b specifies bounded recovery and seven-day unread maximum but not the cross-boundary tie-breaker.
- After expiration, revocation, block or account ineligibility, unread and recovery reads deny regardless of late jobs or stored bytes. No older-session pagination or unread-to-history links.

### In-flight and race conditions
- Per-message uniqueness must handle duplicate client sends and concurrent devices. Database uniqueness/locks are authoritative; outbox is metadata-only and at-least-once; client deduplication keys are not proof of server exactly-once.
- Concurrent fetch+ack vs unmatch/block/expiry must recheck state under transaction locks; no content should leak after an authoritative revoke.
- An attempted rollback/failure at any step must not leave a visible orphan envelope, skipped untracked sequence, duplicated unread, stale grant or leaked notification payload.
- All query APIs must hide resource existence from outsiders and avoid exposing peer identity through error differences.

## 5. Thirty proposed acceptance requirements — NOT YET TESTED

| IDs | Acceptance behavior |
|---|---|
| M06-01–03 | Authenticated current random/live, direct/live, and strict role/marker matching. |
| M06-04–06 | Closed/expired session denial, blocked pair denial, mismatched relationship denial. |
| M06-07–09 | New unique acceptance advances sequence/idle once; duplicate retry idempotent; conflicting retry rejected. |
| M06-10–12 | Lock-delay expiration boundary, End/Block race, two-device concurrent sends. |
| M06-13–15 | LIVE cursor actor+session binding, gap/purge tombstone progression, D2 cannot show D1. |
| M06-16–18 | Only addressed mutual peer gets UNREAD, never random/self, no guessed envelope/outsider. |
| M06-19–21 | Exact seven-day expiry, relationship revocation/safety denial, ended-D1 unread permitted while active mutual remains. |
| M06-22–24 | First ack idempotent; 15-minute recovery bounded; forged/replayed/wrong-owner recovery denied. |
| M06-25–27 | Outbox metadata-only, retryable SSE duplicate harmless, no plaintext in logs/results to wrong scope. |
| M06-28–29 | Failure-injection atomic rollback; unchanged original four-message legacy fixture hash. |
| M06-30 | All V1/V2-01–05A regression and isolated PG16 migration/restore checks pass; only approved paths changed. |

Additional explicit negative checks: exact 29:59.999 vs 30:00 session boundary; exact 7d boundary; 14:59.999 vs 15:00 recovery; source payload purged while envelope valid; multiple devices ack; revoked peer sending after lock wait; malformed/unsigned cursor; no cross-session sequence carryover; malformed or unrecognized role fail closed.

Test documentation must map each M06 ID to a named runnable assertion and give expected status/error class, relevant row changes, allowed returned fields, and exact main/PR SHA. Green pure tests alone do not prove live privacy.

## 6. Non-negotiable dependencies before live API/device use

1. **Storage/cryptography decision:** Resolve existing non-null legacy bridge_messages.body vs scoped encrypted V2 payload model. Specify key origin, rotation, access, transport, backup, loss/revocation and actual encryption verification. No plaintext fallback or secret test data. Any schema revision requires a fresh approved migration brief and disposable rehearsal; do not rewrite 0001–0007.
2. **Trusted identity and policy integration:** Bind authenticated identity server-side to every operation; V2-02 authorization must be wired using actual DB-derived facts and verified runtime least-privilege roles/RLS. Test SQL cross-account access. No caller-supplied validated flags.
3. **V1 generic read cutover:** Old /v1/conversations/:id/messages and SSE routes cannot see new V2 resources or old history. G1/V2-11 needs version gating and privacy-safe denial even for stale Android APKs. Following privacy cutover, rollback must be safe-deny or forward fix, not unrestricted old reader.
4. **Full Android protocol:** Design read/ack presentation, opaque cursor persistence, crash recovery, local cache/backup exclusion, offline handling, expired timers, empty/loading/error and accessible phone/tablet states in V2-10, with physical tests.
5. **Retention and safety:** A seven-day unread envelope must not be mistaken for prior-session history. Ordinary body purge and restricted case evidence are distinct later stages; no deletion enabled in V2-06A. Report capture must not assume purged bodies exist.
6. **QA and deployment:** Preserve original QA fixture, R0 physical device acceptance OPEN, no live Neon DDL or Render wiring without founder approval and recorded rollback.
7. **Economics and security:** Stay on existing free infrastructure for synthetic tests. Load, abuse resistance, rate limits, encryption threat-model and data-protection/legal review precede public beta.

## 7. Gate, rollback, sequence and founder decisions

**Proposed implementation order after a separate authorization:**
1. Author and test pure LIVE/UNREAD policies and deterministic clock/cursor vectors.
2. Implement disconnected disposable-PG16 metadata/envelope repository with synthetic opaque payload fixture only; no real-message crypto or network calls.
3. Run concurrent idempotency/lock-delay/expiry/ack/rollback tests, existing V2-01–05A suite, PG16 schema+restore and full pre-existing regression.
4. Inspect exact changed-file allowlist and one immutable final PR head with both CI jobs green.
5. Merge disconnected source only after approved gates; verify post-merge main CI and record SHA in evidence.
6. Plan V2-06B integration and V2-11 cutover separately; do not silently implement.

**Proposed rollback for V2-06A:** revert isolated source/tests/CI; discard disposable local DB. There is no hosted data, live app feature or deployment to roll back. For future activated privacy read scopes, disable v2 feature or fail closed; NEVER restore broad v1 historical replay.

**Founder decision requested next:** approve/amend **V2-06A disconnected-only** code/test paths and the explicit unresolved crypto/storage and recovery-boundary decisions. This documentation is NOT V2-06 authorization.

**Hard status:** V2-05A isolated engine IMPLEMENTED/CI VERIFIED; V2-06 documented/PROPOSED; V2-06 implementation NOT STARTED; V2-05B/Neon/Render/Android NOT ACTIVATED; R0 hardware sign-off OPEN; final comprehensive 138-case What If? review stays V2-16.
