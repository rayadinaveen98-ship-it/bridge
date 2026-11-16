# Bridge V2-06B/B2a — Disconnected Atomic Encrypted Acceptance Evidence

**Status: B2a IMPLEMENTED / DISPOSABLE PG16 TESTED / CI VERIFIED / MERGED, NOT DEPLOYED.**
**Approved continuation scope:** B2a seven exact file paths only from [B2 Implementation Brief](V2_06B_B2_IMPLEMENTATION_BRIEF.md); not B2b delivery, HTTP, Android, production KMS, Neon or Render.
**Verified branch base:** main@2fe98eb52db49fa24fa365f36d95cd83630e6598, [Foundation main #43844706891](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43844706891) both matching and PostgreSQL-integration SUCCESS.

## Exact seven allowed files

1. `apps/api/src/messaging/private_repository.mjs` — NEW disconnected encrypted WRITE repository, guarded to synthetic `bridge_test` loopback URL, ack, actual principal check and 0008 ledger.
2. `apps/api/tests/v2/private_messaging/b2_accept.test.mjs` — NEW current random/direct ciphertext, nonce/DEK, duplicate, 30m, 7d unread, legacy hash, rollback and security tests.
3. `apps/api/tests/v2/private_messaging/b2_races.test.mjs` — NEW advisory-lock wait past expiry, Block/Keep/End races, two concurrent sends, synthetic key outage, test guard and import-fence tests.
4. `apps/api/tests/v2/private_messaging/b2_fixtures.mjs` — NEW synthetic keyring/fixture builders and four-message QA preservation; no live dataset.
5. `apps/api/package.json` — ADD only `test:v2:private-accept:db` sequential test script, retain existing scripts.
6. `.github/workflows/foundation.yml` — ADD only B2a disposable PG16 test step *after* existing V2-03/04A/05A/06A/B1a suites and migration/restore; preserve 34-table/four-ledger historical regression.
7. `docs/engineering/V2_06B_B2_EVIDENCE.md` — THIS test/evidence and stop register.

NO other source, SQL migration 0001–0008, old V1 HTTP/PG/start/auth/outbox, V2-04A/05A/06A/B1a/B1b modules/tests, Android, cloud Neon schema/data/roles, Render deploy, billing, case evidence, optional history, retention, physical QA or public release change.

## What is implemented but NOT production

- The new adapter accepts **synthetic actor IDs and synthetic plaintext** only with separate injected ephemeral B1b key provider, no JWT or hosted service integration.
- A global advisory transaction mutex 714411 precedes row locks; only V2-marked active random rooms (two slots) or valid mutual direct room+segment accepted after both party eligibility and two-way blocks. Samples DB clock after locks; normalizes to *one* millisecond Date for immutable message AAD, DB accepted_at, 30m idle, and recipient unread 7d TTL.
- Checks idempotency (conversation + sender + clientMessageId) after authorization: same canonical content/available LIVE AEAD returns existing receipt without clock/outbox increase, but different text, unavailable DEK or corrupt ciphertext fails closed. Does NOT persist a plaintext content hash.
- On new acceptance encrypts LIVE with fresh per-item DEK and key-purpose AAD, writes V2 metadata + LIVE. For direct only, separately encrypts one recipient-only unread copy. Writes one body-free `conversation.message.accepted` outbox event and advances sequence/last_accepted_at/idle_expires_at **only in one transaction**. Any injected error rolls back all rows, sequence, outbox and clock.
- Never inserts into `bridge_messages.body`, `bridge_message_payloads`, old `bridge_unread_deliveries`, history/case evidence; no endpoint decrypt or user-visible previous transcript.

**Important security caveat:** The synthetic test fixture DB owner can bypass RLS; the live Render principal and production role grants have NOT been checked. Ephemeral KEKs, same-process nonce registry and disposable PostgreSQL do NOT constitute production key custody, E2EE, secure public chat or durable multi-node storage. Production subject-to-account validation and policy acceptance are not wired; real adult eligibility must be independently verified before any public usage.

## Proposed test coverage — must be verified against CI

| Acceptance | Isolated test intent |
|---|---|
| A02-01–04 | loopback guard and actual disposable DB; preserve legacy four-message QA; valid random accept (no unread); valid direct accept (one independently encrypted unread) |
| A02-05–08 | forged actor/old QA deny; Keep conversion closes original random; D1->D2 isolation; concurrent two unique sends get distinct sequences |
| A02-09–12 | same retry unchanged counters/clock; duplicate conflict denied; missing/corrupt prior payload denied; post-lock-expiry denied |
| A02-13–16 | both-way Block/unmatch deny; actual B1b ciphertext/recipient DEK and canonical accepted_at; no V1 row/old plaintext; body-free outbox |
| A02-17–20 | injected failure at five write stages fully rolls back; malformed/invalid/large messages denied; concurrent race constraints; B1a schema and historic fixture preserved |
| A02-21–24 | key loss or wrap-nonce outage fails closed, no partial commit; explicit import/host/role blockers |
| A02-25–32 | authorizer still synthetic; no hosted integrations; strict exact seven-file diff; full original test suite + final head and postmerge matching/PG16 checks |

**No "32/32 PASS" claim is permitted without explicit mapped test results.** New test results must report actual TAP counts, zero skipped/failures and exact Git SHA; rerun at final head after evidence updates. No live data contacted.

## Rollback & stop rules

Revert B2a implementation PR and discard disposable PG16 database, with no real ciphertext or live schema rollback needed. Stop/hold merge for any changed paths beyond seven, test or CI fail, V1 message body write, incorrect idempotency/clock, wrong recipient, random unread, plaintext outbox, no synthetic-only DB guard, legacy fixture SHA mismatch, unwarranted history/case access or false live-encryption claim.

**Awaiting separately authorized next stages:** B2b current LIVE and unread read/ack/recovery (7d/15m tie-breaker still review), B3 authenticated HTTP and runtime role/KMS/old-reader planning, V2-07/09 new secure-message references, Android V2-10 and G1/V2-11 privacy-safe cutover, R0 two-device physical acceptance OPEN, V2-16 final 138-case What If?.


## 2026-11-16 first code-head CI and security findings

- **Tested source head:** `a8fd57dc576c0e2ca32e17165786e6e1b2f67b35`. [Pull-request Foundation #43849528260](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849528260) and [same-head branch push #43849464062](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849464062): **matching SUCCESS**, **postgres-integration SUCCESS** on both. Existing V1 and V2-01–06A, B1a 0008 schema/PG16 restore, and B1b synthetic crypto checks still execute in their original jobs.
- **Actual new Node TAP results from the PG16 job log:** `b2_accept.test.mjs` **14 passed, 0 failed/skipped** (13 nested test cases + one suite wrapper), `b2_races.test.mjs` **12 passed, 0 failed/skipped** (11 nested cases + one suite wrapper). **26 TAP results total, 24 nested test cases**; counts are NOT 32 fully distinct A02 acceptance IDs. All tests ran with synthetic fixture data in the disposable PostgreSQL 16 `bridge_test` CI service.
- **Actual encrypted storage proof:** B1b encrypt/decrypt succeeds on new 0008 LIVE and independent per-recipient UNREAD `bytea` rows, distinct IV/DEK wrapping and canonical server-accepted timestamp authenticated AAD. No `bridge_messages.body` row was inserted for the new V2 rooms; original four-message legacy SHA tests survived. Outbox event JSON contains exactly `messageId` and `sequenceNumber`, no body or ciphertext.
- **Transaction proof:** unique send updates room sequence and last_accepted/deadline; same-content duplicate returns prior ID/seq without clock/event/unread increment; different-content duplicate fails closed; five forced error stages roll back metadata, LIVE, UNREAD, event and clock. Concurrent unique and duplicate sends, lock wait past idle deadline, block committed before lock release, direct End -> fresh D2 and Keep-converted random denial were exercised.
- **Security limitation (important):** The B2a mutex is shared with previously disconnected V2 session/Keep code. The **existing hosted V1 HTTP block and account eligibility operations are not integrated under this B2a mutex**; therefore B2a's tests of a block committed *before* a queued send resumes **do NOT prove full linearizable Block-vs-send revocation under all live V1 update races**. That is a B2/B3/G1 runtime-authority and transaction-lock-order design blocker. Any claim that live Block safety is fully certified is false.
- **Another limitation:** The acceptance adapter uses an **owner** on synthetic PG16 with RLS enabled, and ephemeral test KEKs; it has **no verified least-privilege Render principal, production key custody, real policy acknowledgment/adult assurance or trusted token-to-actor mapping**. New 0008 SQL is still not applied on Neon. B2a writes no real-user ciphertext and does not expose HTTP read, unread recovery or push delivery.
- **Scope verified:** exact seven B2a approved files, no hosted imports into start/http/postgres/outbox, no SQL 0001–0008 or previous B1a/B1b source modifications, no Android, Neon, Render, billing, retention or public beta.
- **Evidence update means new head:** Re-run final PR-head matching+PG16 checks on evidence-updated SHA; verify all seven allowed paths before merge. Post-merge main matching and postgres-integration need independent certification before declaring B2a complete.


## Final B2a implementation certification — 2026-11-16

- **Final implementation PR #36**: [review](https://github.com/rayadinaveen98-ship-it/bridge/pull/36); exact approved seven changed paths, final PR head `4495239a03d889bf25d1f84f7a1950600bc57a48`. [Foundation PR #43849838361](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849838361) and [branch push #43849829195](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849829195): **both matching and postgres-integration SUCCESS**.
- **Merged main:** `e2cae7af30d51cb5111c8f31d4566d8b3af935d5`. [Exact post-merge main Foundation #43850018131](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43850018131) **SUCCESS** (matching and postgres-integration both SUCCESS).
- **Actual named new TAP evidence**: `b2_accept.test.mjs` **14/14 PASS**, 0 failed/skipped (13 nested cases + wrapper); `b2_races.test.mjs` **12/12 PASS**, 0 failed/skipped (11 nested cases + wrapper). **26 Node TAP results / 24 nested test cases**, with additional internal assertions. Earlier V1, V2-01–06A, B1a 0008/disposable PostgreSQL backup-restore and B1b AES-256-GCM tests remained green.
- **Verified isolation:** no edits to SQL migrations 0001–0008, original four synthetic QA messages, the live legacy HTTP/start/postgres/outbox service, Android or hosted Neon/Render. The new code uses **ephemeral synthetic test KEKs**, explicit local disposable `bridge_test` acknowledgment, actual DB identity check and 0008 receipt. The V2 secure write and independent recipient unread rows persist only in disposable PG16 tests; legacy `bridge_messages.body` remains untouched.
- **Verified behavior within test boundary:** current V2 random and mutual direct acceptance, 30m last-accepted-message idle reset on unique sends only, canonical DB-ms AAD and separate LIVE/UNREAD AEAD copies, 7d unread envelope shape, idempotent same-content retry, conflicting/invalid retry denial, deterministic lock-wait expiry, Block insertion before queued transaction, End + fresh D2 and Keep conversion, five-stage transaction rollback, body-free outbox and original synthetic legacy SHA preservation.
- **Known unclosed threats:** B2a is **not** a trusted hosted API actor adapter and does not certify races where an unintegrated V1 block/account update commits *during/after* the B2a read. There is no production KMS, per-user RLS principal, real adult verification/policy acknowledgment, live V2 HTTP/SSE, unread read/ack recovery, consent history or safety evidence linkage. Future G1 old client /messages safe-deny and role audits remain mandatory.
- **Release classification:** source implementation and isolated PG16 CI certification, **NOT LIVE, NOT E2EE, NOT real-user encrypted messaging**. This is not an Android release or physical test; R0 phone/tablet acceptance OPEN. Separate B2b approval required for read/ack/recovery; B3/G1/Android V2-10 further gated; final V2-16 138-case What If? remains LAST.


---

## B2b implemented on isolated branch — delivery, ack and recovery (2026-11-16)

**Status: B2b CODE-HEAD PG16/CI VERIFIED / EVIDENCE-HEAD AND MERGE GATES PENDING. NOT LIVE.**

**Approved scope:** [B2 Implementation Brief](V2_06B_B2_IMPLEMENTATION_BRIEF.md), **exactly six allowed files**:
1. `apps/api/src/messaging/private_delivery_repository.mjs` — NEW disconnected synthetic-only, scope-checked encrypted LIVE/UNREAD reader, ACK/recover.
2. `apps/api/tests/v2/private_messaging/b2_delivery.test.mjs` — NEW test-only current LIVE, D1/D2 isolation, recipient inbox, first acknowledgment and tamper checks.
3. `apps/api/tests/v2/private_messaging/b2_delivery_races.test.mjs` — NEW test-only concurrent ACK, 15m/7d recovery, Block/End/expiry, tombstone and import-guard scenarios.
4. `apps/api/package.json` — ADD `test:v2:private-delivery:db` only, preserve all previous commands/dependencies.
5. `.github/workflows/foundation.yml` — ADD test-only PostgreSQL 16 B2b step after existing B2a suite.
6. `docs/engineering/V2_06B_B2_EVIDENCE.md` — append this certification ledger and subsequent exact CI evidence.

**Guarded design, no live feature:**
- Requires acknowledged `BRIDGE_TEST_DATABASE_URL` loopback `bridge_test` principal, same pool DSN, actual DB `current_user` and migration 0008 ledger check. Inherits V2 synthetic advisory transaction mutex **714411** and samples authoritative DB clock after locks. No Render/Neon connection, API route, Android, SQL migration, old code or real key custody changes.
- **LIVE:** decrypts only authorized currently OPEN/unexpired V2-marked room (two approved current participants, matched random slots or active direct relation, no two-way block). Signed HMAC-SHA256 actor+room+scope+sequence cursor rejects foreign, tampered or expired room tokens. Tombstone advances *only current* message sequence without prior body exposure. Closed D1 never appears in D2 timeline.
- **UNREAD:** per-recipient direct-only envelope, independently eligible mutual relation even if the source D1 closed. Does not create random unread or expose a previous-session source transcript. Validates V2 source/direct link, relation membership, both account flags, no Block, original accepted timestamp vs metadata, hard `expires_at <= accepted_at + 7 days` and protected payload-AAD prior to decrypt.
- **ACK:** Requires a test-only, HMAC-signed recipient/envelope/accepted-time **presentation proof** issued during unread retrieval, bounded to five minutes as an *internal synthetic transport proof*, not an approved public product TTL. On first acknowledgment stores a single immutable `first_acknowledged_at` and SHA-256 digest of a 256-bit HMAC recovery capability, not raw token. Concurrent/repeated acknowledgments cannot extend original first-ack time or regenerate a new capability.
- **RECOVER:** requires the same eligible actor and still-valid mutual relation, exact capability and stored digest, authenticated unread decrypt; expires at the **earlier of** `firstAck + 15 minutes` and `original acceptedAt + 7 days`. Denies Block, revoke, tag/KEK loss, forged/other-recipient token and terminal/expired envelope. No user-available previous-session timeline is returned.
- Caller `actorId` remains **synthetic fixture-only, not a trusted real bearer principal**. Key provider and HMAC keys are random ephemeral buffers injected only in PG16 test flow. HMAC presentation/recovery protocol, key persistence and client UI must be separately approved in B3/G1; no production key/version/rotation protocol or actual Android presentation handshake is claimed.

**Acceptance intents (D02-01..20) pending test evidence:** current LIVE/expired room/old D1, signed cursor and guest denial; direct unread after source End, sender/stranger denial; first ACK once, recipient-only 15-minute recovery and immutable first ACK, original 7-day hard cap; concurrent two-device ACK, queued Block/End, malicious ciphertext/key failure; body-free no clock reset, active-only tombstone, no hosted import and unchanged V1/B2a/0008 schema.

**Security limitations to preserve:** B2b's demonstration of a Block committed *before* a queued read resumes does not prove serializability against unrelated existing hosted V1 Block/account update operations that do not take the V2 mutex. Hosted Render runtime role and nonowner RLS policies are still unverified. A disconnected synthetic repository is neither live encrypted delivery nor end-to-end encryption. Real recovery key custody and cross-device restart behavior are untested. No real user or existing Neon QA records touched, no deletion or billing.

**Evidence/merge requirements:** inspect actual new TAP counts, PR exact changed file list, final push and PR-head CI on the final evidence commit, both matching and postgres-integration green, no unexpected omissions or false claims. Merge only then; record separate exact main merge SHA and postmerge Foundation CI. **R0 physical device acceptance OPEN; final 138-case What If? V2-16 LAST.**


### B2b exact code-head CI evidence — 2026-11-16

- **Tested final *code* head before this evidence update:** `147b3fbde953e932e735e2de24b4a5bb198e58fc`. [PR Foundation #43853637585](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43853637585) and [same-commit push Foundation #43853629848](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43853629848) **SUCCESS**, both matching and postgres-integration SUCCESS on each. Earlier initial code head `98f70aee29622bd9e1712252466a65fac5b1aa44` had separately passed both [PR #43853320880](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43853320880) and [push #43853245278](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43853245278); security review expanded tests afterward.
- **Actual named PostgreSQL 16 Node TAP reports at code head:** `b2_delivery.test.mjs` **12/12 passed**, 0 failed/skipped (**11 nested test cases + 1 suite wrapper**). `b2_delivery_races.test.mjs` **9/9 passed**, 0 failed/skipped (**8 nested cases + 1 suite wrapper**). Total **21 passing TAP results / 19 distinct nested test cases**, with additional test assertions. These are NOT a claim that all D02-01..20 criteria are individually certified outside test-only scope.
- Covered: valid current random/direct AES-GCM read; cursor tampering and cross-user reuse; Ended D1 -> fresh D2 history isolation; expired random/legacy fixture safe deny; recipient-only UNREAD after direct End; required signed presentation proof before first ACK; one immutable first-ack timestamp; SHA-256 stored digest only; deterministic 256-bit recovery capability; correct recovery token, recipient and envelope; simultaneous two-device ACK returning same fixed token; recovery allowed 14m into original first-ack window but denied at 15m+; original accepted+7d hard cap and expired synthetic envelope; queued Block before LIVE/unread recovery read denied; role/relation revocation; ciphertext AEAD tag failure; separate LIVE and UNREAD KEK retirement fail closed; invalid relationship foreign key (valid other relation ID) never authorizes recipient; active-room tombstone cursor; no 30m clock update on reads; no new live hosted API import; synthetic original four-message QA SHA unchanged.
- **Scope:** [draft PR #38](https://github.com/rayadinaveen98-ship-it/bridge/pull/38) has **exactly six** B2b paths as above. No changes to 0001–0008 migrations, B2a source, prior V1/V2 suites, Android, Neon schema/data/users/roles, Render, billing, hosted secrets, retention or release.
- **Critical remaining limits:** Actor IDs remain *caller-supplied synthetic fixtures*, not signed live bearer identities. PostgreSQL test owner bypasses production RLS; actual Render runtime DB role unverified. V2 advisory mutex does not integrate existing V1 Block/account update operations, so a real Block-versus-read linearizability guarantee is **not proven**. Ephemeral HMAC and AES keyring is not operational secret custody/restart recovery. Five-minute presentation-proof TTL is a test-only protocol choice needing B3 client review, **not** a founder-approved public product policy. No production encrypted delivery, end-to-end encryption, Android/device test or safe old-V1-reader cutover.
- **Merge gate still OPEN:** This evidence edit changes the PR HEAD. Confirm both matching + PG16 jobs SUCCESS at the new exact head and diff still six files; only then merge and verify post-merge main CI separately. Do not declare B2b complete on prior code-head proof alone.

