# Bridge V2-06B / B3b-2 — Atomic Synthetic Messaging Evidence

**Stage:** B3b-2 SOURCE IMPLEMENTED ON ISOLATED BRANCH / FULL CI VERIFICATION PENDING / NOT LIVE.  
**Authorisation:** Founder expressly approved [exact ten-file brief](V2_06B_B3B2_IMPLEMENTATION_BRIEF.md), with synthetic keys and acknowledged disposable PostgreSQL 16 ONLY.  
**Verified base before coding:** `main@eb4ac45aeb84b9b16990b037b0f84662c1b9d95f`, [Foundation #43881867635](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43881867635) matching+PostgreSQL SUCCESS.  
**Security test checklist:** [28-case B3b-2 matrix](V2_06B_B3B2_ATOMIC_TEST_MATRIX.md) — **design case IDs, NOT claims of independent tests or passing results**.

## Exact ten-file scope

1. **NEW** `apps/api/src/v2/private_atomic_facade.mjs` — disconnected synthetic signed-subject dispatcher. Accepts a closed operation name (`send`, `live`, `unread`, `ack`, `recover`) and strict payload fields; actor only from B3b-1 trusted DB-subject callback, no client actor/role override. Final JWT validation uses PostgreSQL clock after B2 work and before callback return/COMMIT.
2. **MODIFY** `apps/api/src/messaging/private_repository.mjs` — reusable already-locked B2a `acceptInExistingTx` worker; standalone `acceptSynthetic` keeps the original transaction/AEAD/sequence/outbox/30-minute-clock behavior. Account eligibility SELECT uses PG row `FOR SHARE`.
3. **MODIFY** `apps/api/src/messaging/private_delivery_repository.mjs` — reusable B2b already-locked `readCurrentInExistingTx`, `unreadInboxInExistingTx`, `acknowledgeInExistingTx`, `recoverInExistingTx` workers. Standalone B2b public methods preserve original behavior and keys. Account eligibility SELECT uses PG `FOR SHARE`; synthetic ACK failure hook enables explicit full-transaction rollback.
4. **NEW** `apps/api/tests/v2/identity/atomic_fixtures.mjs` — isolated RSA/AEAD/HMAC keys, synthetic V2 rooms and signed actor fixtures; instrumented single-pool checkout spy.
5. **NEW** `apps/api/tests/v2/identity/atomic_write.test.mjs` — signed sender, random/direct encrypted accept, duplicate idempotency/clock, Block, body-free outbox, full rollback at metadata/live/unread/outbox/clock.
6. **NEW** `apps/api/tests/v2/identity/atomic_delivery.test.mjs` — current LIVE, D1 End/D2 new empty segment, finite recipient-only unread, ACK, immutable recovery, 15-minute and seven-day denial, Block, AEAD failure, two-device ACK.
7. **NEW** `apps/api/tests/v2/identity/atomic_races.test.mjs` — token expiration after B2 operation but before commit, pending actor Block/account mutation, peer row lock serialization, stale subject transfer, fault-injected ACK rollback, single-transaction spy.
8. **MODIFY** `apps/api/package.json` — named `test:v2:atomic-private:db` script only.
9. **MODIFY** `.github/workflows/foundation.yml` — append synthetic-only `postgres-integration` test step after B3b-1, preserve all old job steps and no runtime/deploy secrets.
10. **NEW** `docs/engineering/V2_06B_B3B2_EVIDENCE.md` — this exact-scope/security/result ledger.

## Explicit non-production boundaries and claims we must not make

- **Disconnected:** `http.mjs`, `postgres.mjs`, `start.mjs`, `auth.mjs`, `live.mjs`, `outbox.mjs`, Flutter/Android and existing SQL migrations 0001–0008 unchanged. B3b-1 signed-subject resolver untouched. Source 0008 still NOT applied to Neon. No Render deploy, DB role/grant mutation, paid KMS, real keys, payments, history changes, case evidence, retention or deletion.
- **No hosted V2 security certification:** B3a's old V1 read/write/Keep/peer/bootstrap/SSE safe-denial remains pure and NOT wired. Existing V1 plaintext route compatibility is a later G1/V2-11 required firewall. Actual Render principal/RLS and production key custody still unverified.
- **Single transaction guarantee in disconnected tests:** signed subject, account row and global mutex 714411 from B3b-1; B2a/b reuse the exact callback PostgreSQL connection for AES-GCM storage/read/ack. No nested connection checkout, no committed identity preflight, no client `actorId`. Standalone B2a/b methods remain for original synthetic regression.
- **Current authorization scope:** both actor and peer statuses, Block, Keep relation, random or direct source and expiry are checked in their existing B2 domain operations; peer eligibility rows additionally locked FOR SHARE. This does NOT prove the entire hosted V1 account writer and Block/unblock lock topology is safe. A concurrent restriction committed *before* authorization must win; a later Block cannot revoke plaintext already seen.
- **Data and time:** original 30-minute clock only on *new unique accepted messages*; free D1/D2 without old history; recipient-only direct UNREAD hard original 7d; first ACK immutable, recovery before min(firstAck+15m, accepted+7d). Test-only presentation-proof five-minute TTL remains **not** a founder-approved public UX guarantee.
- **Safety evidence:** no real QA/Neon case IDs or original four hosted messages ever accessed. Legacy four-message snapshot used in tests is a **fresh synthetic disposable fixture**, not proof of live QA contents.
- **No production E2EE:** AES-256-GCM keys and JWT signing are ephemeral in-memory synthetic test fixtures. Real custody, rotation, incident procedure and adult verification remain B3c/G3 decisions.

## Required CI evidence before merge

- Inspect actual new named TAP reports from `test:v2:atomic-private:db` (all three files) including wrapper counts, failures, skips, duration and redacted test-only output. **No pass/count is claimed yet.**
- Verify existing **B2a+B2b**, B3a 25 test suite, B3b-1 28-result suite, original V1 HTTP/matching, migrations and PostgreSQL restore all PASS without edits to their original paths.
- Inspect PR file list: **EXACT ten approved paths** and no extra runtime, SQL, hosted, Android or unrelated docs. Test concurrency failure traces, peer locks, final JWT expiry and rollback; fix within approved paths or stop and seek new scope authority.
- Final PR head after evidence edits must pass both matching and disposable PG16 CI in **push and PR events**; then merge only with exact head SHA, verify post-merge `main` matching+PG16 again.
- If a race, key or privacy guarantee is not demonstrated, record it openly and do not present B3b-2 as certified; no automatic B3c or G1 source work.

**Stage downstream:** R0 physical phone/tablet acceptance OPEN; B3c key/runtime-role design separate; V2-07/08/09 evidence/retention/consent separate; Android V2-10 and hosted G1/V2-11 separate; full **138-case What If? review remains LAST at V2-16**.
