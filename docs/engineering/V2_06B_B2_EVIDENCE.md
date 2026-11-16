# Bridge V2-06B/B2a — Disconnected Atomic Encrypted Acceptance Evidence

**Status: IMPLEMENTED ON ISOLATED BRANCH / CI NOT YET VERIFIED / DRAFT REVIEW.**
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
