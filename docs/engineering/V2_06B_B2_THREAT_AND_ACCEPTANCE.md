# Bridge B2 — Trust Boundaries, Race Adversaries and Acceptance Matrix

**Status: PROPOSED review / no B2 implementation, database query, integration, or new release authority.**  
**Baseline:** main@7ca0865b18abdfd123fb28dc58a4f720d50385f6.  
**Companion:** [B2 Engineering Brief](V2_06B_B2_IMPLEMENTATION_BRIEF.md), [B2 Key and Privilege Decisions](V2_06B_B2_KEYS_AND_PRIVILEGES.md), [V2-06B Threat Model](V2_06B_THREAT_MODEL.md), [Product Invariants](../product/PRODUCT_INVARIANTS_V1.md).

## 1. Threat actors, user harm and release stopping conditions

- **Other random participant:** guesses or reuses previously issued room IDs, reconnects after expiry, reads old current-room cursor, tries to copy initial stranger chat into later Keep/D1. Guard against resurrection, not merely hiding UI.
- **Former mutual or blocked peer:** opens D2 while D1 expired, attempts to recover undelivered envelopes after revocation, sends while block races, or uses stale encrypted tokens. Block must immediately deny future private reads even if ciphertext exists.
- **Modified/stale Android client:** forges actor/recipient/eligibility, sends two different bodies with same clientMessageId, spoofs accepted_at or premium, polls old V1 GET /messages/peer/events route, extracts plaintext from caches/backups. B2 synthetic tests cannot validate device/local hazards.
- **Malicious/compromised DB principal:** reads bytea and associated metadata; with only database access it should not obtain test KEKs, while an app runtime with real keys may decrypt. Need least privilege and row policy at G1; no E2EE claim.
- **Partial outage:** key provider cannot unwrap; server crash after outbox write; duplicate messages or SSE hints appear at-least-once; Postgres lock waits past deadline; backup restore revives invalid grants. Fail closed, preserve original records and do not silently advance 30m window.
- **Incident reporter:** submits a permitted report after expiry where original live ciphertext may have been purged. Report evidence needs a future scoped evidence adapter and V2 secure ID reference, never ordinary free history.

**Absolute release stops:** any old V1 endpoint returns a V2 message plaintext; any new message body is inserted into `bridge_messages.body`; a blocked or third-party actor receives decrypted content; a duplicate extends 30m timeout; expired room is revived; wrong-recipient unread delivered; a real key secret appears in SQL, Git, Android, metrics, logs or backup; RLS/grants judged safe merely because owner passed; or a historical QA fixture is mutated.

## 2. Transaction/lock graph, synthetic B2a

```text
synthetic test caller (NOT JWT identity)
  -> strict disposable bridge_test+ACK guard
  -> BEGIN
  -> pg_advisory_xact_lock(714411)     [existing V2 writers]
  -> lock V2 room / verify V2 policy marker and legacy_qa=false
  -> lock match/slots OR relationship + direct segment
  -> verify both current participants, 2-way block, account/policy eligibility
  -> SELECT clock_timestamp AFTER LOCK WAIT; canonical whole epoch-ms
  -> verify NEW unique acceptance vs duplicate (decrypt old ciphertext if available)
  -> live authenticated AEAD; direct recipient separately encrypted
  -> INSERT bridge_v2_secure_messages; bridge_v2_secure_live; optional bridge_v2_secure_unread
  -> INSERT body-free event outbox hint
  -> UPDATE room next_sequence and last_accepted/idle_expiry ONCE if unique
  -> COMMIT
```

**Lock-order detail:** `withV2ConnectionTx` already takes mutex 714411. Existing V2-06A locks room, checks match and slots, or loads a relation/source/segment under this mutex; V2-05A Keep holds it for conversion. B2 must audit and document exact ordering, and test parallel V2-04A expiry, V2-05A Keep and direct End. Keep operations on *legacy V1* aren't governed by this mutex until an independently approved integration; don't claim protection of old hosted routes.

**No session deadline extension on read/poll/type/recovery/outbox retries.** Duplicate same clientMessageId+same canonical bytes should return the original accepted receipt without any clock or sequence change **only while previously authorized and original live ciphertext readable**. Different content/absent key/corrupt bytes/expired room denies without guessing secret content. The original plaintext should not be persisted or logged merely to detect a duplicate.

**Cross-table read scope:** B2a commit of a V2 secure message and encrypted unread is not proof that it can be read. B2b separately authorizes and decrypts after fresh block/relationship/session gates. Closing direct room withdraws LIVE but not an eligible unread envelope. Closing random room withdraws LIVE **and** never yields an ordinary random unread copy.

## 3. Adversarial checks to implement after B2a approval

| Adversary ID | Reproducible synthetic scenario | Expected result |
|---|---|---|
| A02-01 | Missing ACK, wrong database, Neon hostname, connection-pool URL differs | Refuse before any SQL/side effect |
| A02-02 | Existing original random room has NULL legacy_qa and no V2 marker | Deny V2 send; old four-message snapshot identical |
| A02-03 | V2 random matched and both active participants | Accept exactly one current message, no recipient unread |
| A02-04 | V2 direct mutual active and valid B1b injected purpose keys | Accept metadata, live ciphertext and one recipient unread atomically |
| A02-05 | Outsider UUID, malformed clientMessageId, wrong source/direct marker | Uniform deny, zero new rows |
| A02-06 | Source room converts to mutual while random send waits | Serialized outcome, no new random message after conversion |
| A02-07 | Direct D1 closes while send waits; D2 starts | D1 send denied, no D1 plaintext imported into D2 |
| A02-08 | Two unique simultaneous sends | Unique strictly increasing sequence and timeout only for each accepted unique item |
| A02-09 | Retry exact accepted clientMessageId/content while active | Same message ID+sequence, no extra outbox/envelope, no clock update |
| A02-10 | Retry same clientMessageId with different content | Deny conflict, never disclose stored body |
| A02-11 | Duplicate after live blob missing/key destroyed/session expired | Safe deny or unavailable, never reconstruct old history |
| A02-12 | Lock wait passes exact 30:00 timeout | Reject even if transaction began earlier |
| A02-13 | Block/relationship revoke while transaction waits | Latest authoritative state denies; no recipient delivery |
| A02-14 | Crash after live metadata but before encrypted blob | Full rollback, no orphan metadata |
| A02-15 | Crash after encrypted direct unread but before outbox | Full rollback, no unread ghost |
| A02-16 | Crash after outbox but before session clock | Full rollback, no event/scope mismatch |
| A02-17 | Missing test KEK, nonunique wrap nonce, wrong purpose provider | Fail closed, no sequence advance or half-message |
| A02-18 | Payload injection/oversize/invalid UTF-8/bad time | Deny before commit; redacted logs |
| A02-19 | Database-only row inspection | Ciphertext structurally nonempty and unread copy different; no synthetic plaintext in legacy body/outbox |
| A02-20 | Re-test previous 34-table/four-ledger and new 37-table/five-ledger ordering | Prior CI unchanged and PG16 restore still passes |
| A02-21 | Test fixture RLS nonowner with no policy | Zero visible rows; runtime role not claimed verified |
| A02-22 | Build or API import graph check | No hosted start/http/postgres/outbox source import of new private adapter |

## 4. Adversarial checks to implement after B2b approval

| Adversary ID | Reproducible synthetic scenario | Expected result |
|---|---|---|
| D02-01 | Current live random/direct, valid actor/scope | Only current authorized message content |
| D02-02 | Expired random or closed D1, even if bytea remains | No LIVE plaintext, no historical cursor |
| D02-03 | Guess another room/cursor and switch account/segment | Cryptographic/scope denial |
| D02-04 | Direct unread recipient fetches after source D1 closed | Allowed if relation active, envelope unexpired and recipient eligible |
| D02-05 | Sender or third user guesses unread envelope | Deny without existence oracle |
| D02-06 | Seven days minus 1ms and exactly seven days | Allowed/expired respectively; original accepted clock canonical |
| D02-07 | First presentation ack vs two concurrent clients | One immutable ack time and one bounded recovery basis |
| D02-08 | 15m minus 1ms and exact 15m after ack | Allowed/denied, bounded by initial 7d |
| D02-09 | Ack late near hard 7d expiration | Recovery stops at original hard cap, never extends |
| D02-10 | Replay old token, wrong recipient, wrong envelope ID or token alteration | Deny; no durable old transcript |
| D02-11 | Block/unmatch/eligibility revoked before recovery | Deny even with valid digest and unexpired ciphertext |
| D02-12 | Key retired/lost, corrupted AEAD tag/IV | No partial bytes, uniform fail closed |
| D02-13 | Direct session D2 opened while D1 unread remains | D1 unread eligible independently; D1 timeline still inaccessible |
| D02-14 | Existing V1 `/messages` reader pointed at a V2 ID | No route wiring during B2; old cutover safety still required in G1/V2-11 |
| D02-15 | Source message ciphertext tombstoned but envelope still live | UNREAD remains available only within its own scope and 7d |
| D02-16 | Any B2 read/ack triggers outbox or extends 30m | Must not; only new unique accepted message extends session |
| D02-17 | Transport crash before presentation vs after ack | Simulated replay bounded; Android physical validation later |
| D02-18 | Cross-relation pair mismatch despite valid recipient FK | Reject; FK existence alone is not authorization |

**Test design caveat:** These are **proposed cases**. No count above is claimed PASS. Individual test files must report actual Node TAP counts, synthetic PostgreSQL test coverage and CI on exact implementation head. Any code changes to current V1, SQL 0001–0008, Android or Neon require separate scope and founder approval.

## 5. Required evidence types and stage-signoff matrix

| Evidence | B2a write | B2b delivery | B3/G1 hosted later |
|---|---|---|---|
| Code review with exact allowlist and import graph | Mandatory | Mandatory | Mandatory |
| Disposable PG16 source schema/fixture/hash | Mandatory | Mandatory | Prerequisite, not hosted proof |
| B1b AEAD/tag/nonce/AAD negative vectors | Mandatory | Mandatory | Security review + operational key custody |
| Lock-order + 30m/Keep/Block/End concurrency | Mandatory | Mandatory | Physical/device and hosted tests |
| Recipient-specific 7d unread and first-ack 15m | Designed; not active | Mandatory | Android/server integration |
| No old-V1 bypass through protected V2 | Design assertion only | Design assertion only | **Actual negative network test required G1/V2-11** |
| Nonowner runtime roles and RLS | Synthetic default deny only | Synthetic default deny only | Actual principal and role grant verification |
| Real key custody, restart/recovery, incident response | Not authorized | Not authorized | Requires separate provider + explicit decision |
| Exact SHA CI both jobs after merge | Mandatory | Mandatory | Mandatory |
| Real phone/tablet R0 acceptance and V2 QA | OPEN | OPEN | Operator evidence required |
| Safety evidence / two-party prospective history | Not included | Not included | V2-07/V2-09 plus further schema work |
| Final 138-case What If? | Deferred | Deferred | Mandatory at V2-16 |

## 6. Security and privacy release gates

B2 is an **engineering experiment** using disposable data. Real user encrypted messaging remains **BLOCKED** until:
1. verified signed identity -> trusted server account; genuine adult/policy eligibility; abuse and moderation response,
2. audited Render runtime principal, nonowner RLS policies and separated migration/worker roles,
3. production KEK custody, rotation, recovery, nonce uniqueness under restarts/scale, encryption key loss runbook,
4. old V1 read/SSE/notification/cache/backup paths cannot bypass V2 free history restriction,
5. V2-07 safety evidence redesign for `bridge_v2_secure_messages` and V2-09 prospective history linkage (not old `bridge_messages`),
6. Android V2-10 and R0 physical device evidence, G1/V2-11 private QA cutover and independent founder go/no-go,
7. retention dry run and separate deletion approval, then final V2-16 138-case What If? closure.

**No spending approved** for provider, moderation system, paid infrastructure, payments or KMS. Continue free/synthetic test-only testing until founder explicitly chooses any additional cost.
