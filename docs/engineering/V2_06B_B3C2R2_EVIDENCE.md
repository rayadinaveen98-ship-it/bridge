# Bridge B3c-2R2 — disposable actual-0008 PostgreSQL 18 evidence

**Status: IMPLEMENTED / PG18 ACTUAL-0008 AND PREDECESSOR MATRIX CI VERIFIED / FINAL EVIDENCE-HEAD CI PENDING / NOT HOSTED.**  
Founder approved continuation from B3c-2R for disposable actual 0008 + signed actor/nonowner proof.  
Pinned previous main: `2fd4ec5a0303c260284e38ad6fdfa059cc950508`.

## Exact seven-file implementation scope
1. NEW `apps/api/tests/v2/privileges/b3c2r2_actual_schema_fixture.mjs`
2. NEW `apps/api/tests/v2/privileges/b3c2r2_actual_schema.test.mjs`
3. ADD one test runner in `apps/api/package.json`
4. NEW `.github/workflows/bridge-actual-schema-pg18.yml`
5. NEW `docs/engineering/V2_06B_B3C2R2_DESIGN.md`
6. NEW `docs/engineering/V2_06B_B3C2R2_EVIDENCE.md`
7. APPEND `docs/ROADMAP.md`

## Evidence checklist (PENDING — do not confuse plan with test results)

- [x] Exact seven-path diff at code head `24a650eaa89c4090f87a38819ddf21b9c982872f` and no application/server/Android or migration SQL edits
- [x] Exact CI/ACK, pinned loopback URL/DB/user/password, PG18 version and single Docker service cluster ID attested before any DDL
- [x] Applied actual repository migration SQL 0001–0008 on disposable PostgreSQL 18.7; 37 tables, five SHA-256 ledger receipts, three RLS-enabled 0008 tables
- [x] Independent LOGIN runtime proved NOSUPERUSER, NOBYPASSRLS, NOCREATEROLE, NOCREATEDB and NOINHERIT
- [x] Actual 0008 metadata sender, LIVE owner and UNREAD recipient positive/negative scoping; synthetic sender INSERT observed under rollback
- [x] Cross-user SELECT/INSERT, old plaintext, account, case/history, private key and role/DDL escalation denied
- [x] Tampered JWT, forged/changed GUC, cross-transaction replay, expired valid-HMAC context denied
- [x] Test-only policies/privileges/private signer/schema/roles explicitly torn down and CI fails on teardown residue; database/container disposed
- [x] Code-head [PG18 signed proof #43942617769](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942617769) **16/16 TAP PASS, 0 failed/skipped**; [B3c-2R PG16/18 matrix #43942617909](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942617909) **2/2 jobs PASS**; [Foundation matching+PG16 #43942618087](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942618087) **2/2 jobs PASS**. Final evidence-edit PR-head CI remains to reverify.
- [ ] Separate post-merge CI explicitly checked before certifying independent main; no hosted actions

**Unresolved intentionally:** this is a standalone signed-actor SQL demo, not the B3b-2 encrypted-transaction integration, real persistent key management, age proof, actual user/Block lock races, approved prod RLS or an authenticated hosted API. SQL function is a synthetic trust experiment, NOT a recommended live design without deeper security review. V2 activation blocked pending real hosted nonowner role and broader gates.

## Initial code-head CI and known limitations (2026-11-17)

- Draft [implementation PR #56](https://github.com/rayadinaveen98-ship-it/bridge/pull/56), exact seven-path scope; final SHA and new tests must be reverified after this evidence and volatility amendment.
- Initial [PG18 proof CI #43941926838](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43941926838) failed **before database access** due to local fixture constant `URL` shadowing JavaScript's `URL` constructor; the affected helper was fixed in the same approved test file.
- Repaired code-head [PG18 proof #43942178822](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942178822): **15/15 Node TAP PASS**, 0 failed/skipped (13 nested tests + 2 parent results). Actual checked-in 0001–0008 SQL, 37 Bridge tables, 5 ledgers and all RLS negative/positive tests succeeded on disposable PostgreSQL 18. [Prior PG16/PG18 role matrix #43942179075](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942179075) 2/2 job SUCCESS; [Foundation #43942178967](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942178967) matching + PG16 integration both SUCCESS.
- Review refinement after first green code-head: mark the test verifier **VOLATILE** because it reads transaction context/time; add separately checked **valid-MAC but expired-context** denial. These revisions require **new exact-head CI** before certification; never carry forward old PASS as final.
- The independent test role never read old `bridge_messages.body` or the synthetic signing table. HMAC actor context was scoped to a transaction and denied unauthorized actor changes, replays and unauthenticated SQL. Positive insert transaction was always rolled back; seeded rows are synthetic and discarded with the disposable container. These are not production-safe policies or a live JWT/key service.

## PG18 security proof closeout at code head `24a650e` — 17 November 2026

- **16/16 actual TAP passing**: 14 nested checks and two wrapper tests (IDs R2-01..R2-16 and R2-14a are scenario labels, not separate pass counts). Revisions switched a time/GUC-sensitive synthetic verifier to `VOLATILE` and demonstrated denial of an expired context **despite a valid HMAC**. No actual real-data access.
- The positive DB writer inserts metadata, LIVE blob and recipient UNREAD into the **actual 0008 tables** as a truly separate least-privilege LOGIN in one synthetic transaction; the transaction is rolled back. Other tests establish sender-only metadata/current LIVE and recipient-only UNREAD isolation. Bytea payloads are **deliberately fake test shapes, not ciphertext**.
- The function and RLS policy only demonstrate a signed transaction-scoped claim. They do **not** verify a real runtime user against locked account/Block state inside the production B3b-2 single transaction, so **do not deploy or reuse the proof policies**. Real provider/custody, key rotation, R0 physical QA and safe old-client firewall remain release blockers.
- Prior initial failed [run #43941926838](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43941926838) was a fixture `URL` constant shadowing Node's constructor; failure occurred before any DB connection, fixed without weakening preflight. The next [run #43942178822](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942178822) passed 15/15; final amended code-head #43942617769 passed 16/16.
- **Next gate:** production-suitable actor binding, account/Block/peer revocation races and safe nonowner transaction integration design, separately approved. Hosted Neon/Render remediation requires distinct founder approval and remains **HOLD V2**.
