# Bridge V2-06B/B2 — Exact Trusted Messaging Integration Engineering Brief

**Status: PROPOSED / DOCUMENTATION ONLY / SEPARATE FOUNDER APPROVAL REQUIRED FOR EACH ENGINEERING PACKAGE.**  
**Prepared:** 2026-11-16.  
**Verified baseline:** `main@7ca0865b18abdfd123fb28dc58a4f720d50385f6` after [B1b PR #33](https://github.com/rayadinaveen98-ship-it/bridge/pull/33) and [B1b documentation PR #34](https://github.com/rayadinaveen98-ship-it/bridge/pull/34); [Foundation #43841548152](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43841548152) matching and PostgreSQL integration SUCCESS.  
**Source of truth:** [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md), [Architecture V2](ARCHITECTURE_V2.md), [B1 implementation brief](V2_06B_B1_IMPLEMENTATION_BRIEF.md), [B1 schema/crypto contract](V2_06B_B1_SCHEMA_CRYPTO_CONTRACT.md), [B1a evidence](V2_06B_B1_EVIDENCE.md), [B1b evidence](V2_06B_B1B_EVIDENCE.md), and [B2 threat/acceptance matrix](V2_06B_B2_THREAT_AND_ACCEPTANCE.md).  
**Permission warning:** This document authorizes **NO application code, SQL, key material, database query/role, Render deployment, Android edit, billing, retention deletion, report evidence activation or production encryption.** B2a and B2b each require distinct, exact founder code approval.

## 1. Engineering verdict and product invariants

B1a added **separate V2-only message metadata, live AES-GCM-shaped payload and per-recipient unread envelope tables** under `database/migrations/0008_v2_secure_messaging.sql`; B1b added an **isolated** AES-256-GCM in-memory *synthetic* codec and key contract. The 0008 migration is applied **only in disposable PostgreSQL 16 CI**. B1b was unit-tested using ephemeral generated keys; neither package is imported into the existing hosted API.

Preserve:
1. Random conversation only LIVE while **unexpired 30-minute idle from last newly accepted unique message**; ended random transcript is never ordinary history.
2. Two independent current Keep votes only; original random source immutable; fresh direct session D1/D2 with **free mutual reconnection**, each its own 30-minute clock.
3. Free current-session read only; recipient-only **7-day** unread for direct mutual peers and **15-minute** first-ack transport recovery bounded by original seven-day cap; no previous direct-session timeline.
4. Block, relationship revoke, ineligibility and terminal state deny access instantly; safety report and required privacy actions remain free.
5. No actual adult verification, consented history, public user beta or payments inferred from synthetic QA flags.

**B2 objective:** establish a trustworthy **disconnected repository and cryptographic authorization boundary on synthetic PostgreSQL only**, with atomic encrypted write, policy validation, duplicate handling, independently authorized LIVE and UNREAD reads, and failure/race tests. Avoid wiring source modules into real `apps/api/src/http.mjs`, `postgres.mjs`, `start.mjs`, `outbox.mjs` or Android.

## 2. Verified integration blockers and existing-file compatibility

| Observed source detail | Required B2 design response |
|---|---|
| `bridge_messages.body` legacy TEXT NOT NULL and V1 `GET /v1/conversations/:id/messages` reads it | New B2 adapter MUST write only `bridge_v2_secure_*` and never create legacy `bridge_messages` rows; no V1 route integration in B2 |
| B1a 0008 is new source-only migration; RLS enabled, no app grants/policies | B2 runs only on explicitly acknowledged loopback `bridge_test`, exercising synthetic owner adapter and separately demonstrated nonowner default-deny; **cannot** claim hosted runtime DB role is safe |
| Existing V2-04A/05A/06A transaction paths use advisory lock `714411`, then row locks, then `clock_timestamp()` after lock wait | B2 must adopt one audited global lock order and database-derived accepted time; never `now()` captured before waiting |
| `bridge_v2_secure_messages` has unique (room,sequence) and (room,sender,clientMessageId); live ciphertext and unread are separate FKs | Duplicate retry must be **idempotent** without a new sequence, outbox or 30m clock reset; conflicting body same ID denied via authorized ciphertext decrypt while available |
| B1b `private_crypto.mjs` uses ephemeral purpose-specific KEKs, in-process wrap-IV registry | Use **synthetic ephemeral injected provider ONLY** for B2 tests; keys disappearing after restart must FAIL CLOSED and must not masquerade as reliable real-user recovery |
| Existing outbox allows only `conversation.message.accepted` and references a conversation with jsonb hint | B2 may write existing **body-free** event intent inside the test transaction; must never call hosted dispatcher or publish network events; verify outbox JSON contains no ciphertext, body or identity leak beyond agreed minimal IDs |
| V2-06A unread uses `acknowledged_at` from old `bridge_unread_deliveries` | New secure unread table uses `first_acknowledged_at`; B2 MUST map explicitly and not silently reuse legacy SQL/field names |
| `bridge_report_evidence.source_message_id` and `bridge_history_items.message_id` refer to `bridge_messages(id)` | **Important future V2-07/V2-09 blocker:** these old-case/history FKs cannot represent a new `bridge_v2_secure_messages` record. Propose separately approved future additive source links (candidate future 0009), not a B2 change or silent duplicate legacy row |
| V2 policy kernel requires server-trusted principal/adult/policy status but hosted token maps `sub` to an account; no production scope wiring | In B2, actor IDs and eligibility are synthetic fixture facts only. For live use, verified token and durable policy acceptance source-of-truth require separate implementation and tests |
| Existing `bridge_event_outbox` and server single process support at-least-once hints | Test duplicates/reordering and no body; **no** claim of cross-node durability or secure realtime push |

**Critical privilege gap:** Architecture V2 reports privileged Neon inspection owner can BYPASSRLS; the Render runtime connection identity is **unverified**. No production role/DDL is allowed in B2. Before G1, approve a read-only redacted runtime role inventory and a separately reviewed least-privilege migrator/app/worker role plan.

## 3. Recommended B2 PR boundaries

### B2a — DISCONNECTED encrypted acceptance repository, synthetic PG16

**Status:** PROPOSED. **Implement only with founder approval of exactly these 7 paths:**

1. `apps/api/src/messaging/private_repository.mjs` — NEW self-guarding disconnected V2-only PostgreSQL write adapter, no hosted imports.
2. `apps/api/tests/v2/private_messaging/b2_accept.test.mjs` — NEW synthetic send/duplicate/immutability/AEAD database test.
3. `apps/api/tests/v2/private_messaging/b2_races.test.mjs` — NEW disposable PG16 lock-wait/Block/End/expiry/rollback/concurrent send tests.
4. `apps/api/tests/v2/private_messaging/b2_fixtures.mjs` — NEW synthetic fixture builders, key-injection and original four-message SHA snapshots.
5. `apps/api/package.json` — ADD named `test:v2:private-accept:db` runner, no runtime dependency changes.
6. `.github/workflows/foundation.yml` — ADD only disposable PG16 test step AFTER existing V2-03/B1a checks and backups, with ACK.
7. `docs/engineering/V2_06B_B2_EVIDENCE.md` — NEW exact PR SHA, tests, risks, rejection reasons and no-live gate.

**B2a must not change B1b source, B1a schema/migrations, existing `sessions/**`, `connections/**`, `messaging/repository.mjs`, `outbox.mjs`, `policy/**`, or current HTTP/PG runtime.**

**Necessary transactional write algorithm (contract; not source yet):**
1. Before connection, independently require `disposable-bridge_test-only` acknowledgment and a pool DSN exactly matching local `bridge_test`. Verify DB name/user/host after connection. Never accept runtime `BRIDGE_DATABASE_URL` as fallback.
2. Accept `conversationId,actorId,clientMessageId,syntheticPlaintext` only in fixture tests; input IDs are not a trusted real authenticated identity. Begin one PostgreSQL transaction and take established advisory mutex **714411 before any room/connection locks**.
3. Lock the room, direct relation/segment or random match slots in a **documented consistent order**, verify immutable V2 marker `policy_version=bridge-v2`, `legacy_qa=false`, real two participant rows, both eligible, two-way no-block, appropriate open session, and current match slots/direct relationship. Deny all NULL/old QA/foreign/guessed IDs.
4. Re-sample **database wall time after any lock wait**. Convert to canonical **whole epoch milliseconds once**, use the same value for DB accepted_at and B1b AAD. Verify active session deadline strictly `now < idle_expires_at`. Avoid using PostgreSQL transaction `now()` or an untrusted client timestamp.
5. Check duplicate by unique (room,sender,clientMessageId) **after authorization and locks**. If prior, decrypt the existing currently accessible live blob using the permitted injected key and **compare canonical content**; if same, return same id/sequence and do not update clock, outbox, envelope or counters. If different or ciphertext/KEK missing, fail closed with conflict/resource unavailable. Do NOT persist unkeyed plaintext hashes. After window/session closed, do not reveal old plaintext or receipt.
6. For new unique acceptance, allocate message ID and room sequence atomically; encrypt LIVE copy with B1b; create `bridge_v2_secure_messages` and `bridge_v2_secure_live` only; if a valid direct relation, also encrypt a **separate** UNREAD copy for the *other currently eligible participant* with purpose-bound AAD and immutable acceptedAt. Random messages have **no unread envelope**.
7. Insert one **body-free** `conversation.message.accepted` outbox hint with unique event key; only opaque message ID/sequence as agreed. No plaintext, ciphertext, auth token, recipient details or sensitive text in the event. Update session next sequence and last_accepted_at/idle_expires_at **only for newly accepted unique messages**. Commit all or none.
8. Inject failures after message/live/unread/outbox/clock and verify complete rollback; force races among accepted send, duplicate, expiry, Keep, Block and End; demonstrate lock-wait expiry denies. No real decryption transport to clients and no hosted event publish.

**Known limitations:** synthetic owner DB privileges and synthetic key provider prevent production/least-privileged readiness claims. B2a tests can prove transactional encrypted storage in isolated PG16; they cannot prove V2 HTTP safety, real runtime identity, durable keys, adult verification, real device delivery or live encryption.

### B2b — DISCONNECTED scoped LIVE/UNREAD reading and ack recovery

**Status:** PLANNED; requires B2a merged and **new separate founder approval**. Exact proposed 6-path allowlist:

1. `apps/api/src/messaging/private_delivery_repository.mjs` — NEW isolated authenticated-read *shape* against synthetic actor/room/recipient, using B2a transaction patterns and B1b decrypt only after authorization.
2. `apps/api/tests/v2/private_messaging/b2_delivery.test.mjs` — NEW LIVE scope/current-only, UNREAD per recipient, ack and 15m recovery tests.
3. `apps/api/tests/v2/private_messaging/b2_delivery_races.test.mjs` — NEW Block/End/expiry/ack/2-device concurrency tests.
4. `apps/api/package.json` — ADD named `test:v2:private-delivery:db`, preserve B2a runner.
5. `.github/workflows/foundation.yml` — ADD test-only disposable PG16 step, preserve previous jobs.
6. `docs/engineering/V2_06B_B2_EVIDENCE.md` — UPDATE separate PR SHA, exact test evidence, future keys/HTTP blockers.

**B2b contract:**
- LIVE only for *currently active* authorized random/direct room, with scoped cursor bound to actor+scope+room; never previous room D1 after D2 starts.
- UNREAD direct peer only, independently authorized by current mutual relation even if the source direct session is now closed; no source-room history API or generic pagination.
- Ack occurs only after simulated client presentation, first-ack timestamp immutable; recovery credential stored as digest only, actor/envelope bound, valid at most **min(firstAck+15m,accepted+7d)**. **This exact tie-breaker remains proposed pending explicit founder review**, although the 7d and 15m windows are approved.
- Block/revoke/eligibility change always wins over ordinary unread and recovery; fail closed if injected key missing or AEAD tag incorrect. Metadata tombstone advances only a **currently active** scoped cursor, never a previous-session free timeline.
- No real Android notification, offline queue, local cache or SSE client changes; physical QA is a later stage.

### B3 / G1 — NOT B2

- B3: versioned HTTP endpoint and Android protocol, verified bearer subject mapping, old-route version gating and rollback design, safe error semantics, monitoring and DB-role/KMS implementation selection.
- G1/V2-11: founder-approved live schema expansion and role audit + safe old-client cutover after Android V2-10 preview/hardware acceptance. **After cutover, rollback must safe-deny; never restore generic old V1 history reads.**
- Safety evidence V2-07 and prospective history V2-09 have separate legacy-FK redesign gates before public rollout; B2 cannot declare them implemented.
- R0 physical phone+tablet acceptance remains OPEN, and final V2-16 full 138-case What If? is still last.

## 4. Detailed B2a acceptance matrix (PROPOSED; ZERO EXECUTED HERE)

| Test IDs | Mandatory negative and positive proof |
|---|---|
| A02-01–04 | strict loopback/ACK and actual principal check; 0008 schema only after existing migrations; no writes to V1 body; SHA of four legacy messages/room/slots identical |
| A02-05–08 | current random allowed; direct active allowed; wrong actor/peer or forged relation denied; old/null/legacy QA room never eligible |
| A02-09–12 | unique send increments seq and 30m clock exactly once; exact idle boundary denies; duplicate identical is idempotent without clock bump; conflicting duplicate or missing ciphertext denies |
| A02-13–16 | persist actual B1b synthetic AES-GCM ciphertext/DEK wrap, inspect no plaintext; random never creates unread; direct creates **one recipient** envelope with independent DEK; correct canonical DB-ms AAD/accepted_at |
| A02-17–20 | body-free outbox hint once; forced failure after any write/clock rolls back; two concurrent sends ordered/unique; lock wait crossing boundary denies |
| A02-21–24 | Block vs send; mutual revocation vs send; Keep/expiry vs send; simulated key provider outage/rotation/nonce reuse fail closed without partial commit |
| A02-25–28 | malformed/oversized/noncanonical UTF-8 and stale client timestamp rejected; wrong authorization context never creates event; preserved RLS default deny and app principal remains intentionally unverified; existing V1..B1 suites all green |
| A02-29–32 | no import into hosted server; no SQL/migration changes; seven-path diff exact; final PR-head and matching+PG16 CI then postmerge main CI all verified |

**Caution:** These are numbered acceptance *requirements*, not test counts or test results; do not label any "32/32 PASS" until code, test mapping and named logs exist.

## 5. Detailed B2b acceptance matrix (PROPOSED)

| Test IDs | Mandatory proof |
|---|---|
| D02-01–04 | current-only random/direct metadata & protected read; expired/end denied; signed cursor scope/user/room bound; no D1 -> D2 transcript |
| D02-05–08 | recipient-only direct UNREAD; source direct close allowed for unconsumed envelope; random never produces unread; sender/stranger denied |
| D02-09–12 | first acknowledgment immutable; 15m/7d intersection; wrong replay/recipient token denied; no infinite ack refresh |
| D02-13–16 | block/relationship revoke/eligibility immediately deny; tag/KEK missing fail closed; ack vs two-device crash/idempotency; no client-local previous history or SSE body |
| D02-17–20 | RLS and DB-role scope explicitly unverified for hosted; old V1 route bypass not reopened; 6-path diff; exact CI + postmerge docs and evidence |

## 6. Dependency, cost, security and rollback decision

**Preferred sequence:** B2a synthetic write adapter `->` standalone CI and review `->` B2b synthetic delivery `->` B3 contract/identity/keys/role design `->` V2-07 report evidence and other planned package gates `->` Android V2-10 `->` controlled G1/V2-11 approval. Do not consider any B2 code a hosted rollout authorization.

**Keys and costs:** Remain on existing free test infrastructure; use B1b's ephemeral test KEKs in B2 test context only. A real service needs a durable access-controlled KEK provider, rotation/compromise and backup/restore procedures; whether to use hosting secrets or KMS, its operational risk and any new spending are a **separate founder business/security decision**. No new paid subscription, cloud provider, real key material or external crypto libraries are approved.

**Security-critical architecture gap:** If the server service is started with a privileged DB owner or no scoped runtime RLS policies, app-level checks can fail open on an SQL bug. B2 synthetic tests don't grant a runtime role. Production role isolation is G1; do not preemptively inspect live credentials or change Neon.

**Rollback for isolated B2a/B2b:** revert test-only code and discard disposable PG16 instance; no persisted real user data or cloud migration exists. **Rollback after future privacy cutover cannot restore generic V1 message replay.**

**Stop conditions:** any real body written to `bridge_messages`, old client V2 read path, real secret in fixture, non-loopback test runner destination, mismatched DB acceptance timestamp/AAD, duplicate extending deadline, mismatched pair recipient, unread after block, body in outbox, unexpected modified path, failed historical fixture hash or CI jobs.

**Founder decision next:** approve the **exact seven B2a paths** for a disconnected encrypted-write adapter with synthetic test KEKs and disposable PG16 tests only. **B2b requires later distinct approval.** No live Neon/Render/Android/retention/monetization or public release.
