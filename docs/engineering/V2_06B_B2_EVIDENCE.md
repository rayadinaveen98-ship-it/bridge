# Bridge V2-06B/B2a — Disconnected Atomic Encrypted Acceptance Evidence

**Status: IMPLEMENTED ON ISOLATED BRANCH / CODE-HEAD CI VERIFIED / FINAL EVIDENCE-HEAD + POST-MERGE CI PENDING.**
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
