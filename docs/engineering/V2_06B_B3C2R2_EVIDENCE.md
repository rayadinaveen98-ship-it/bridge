# Bridge B3c-2R2 — disposable actual-0008 PostgreSQL 18 evidence

**Status: IMPLEMENTED IN DRAFT PR / INITIAL PG18 PROOF 15/15 PASSED / FINAL HEAD CI PENDING / NOT HOSTED.**  
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

- [ ] Exact seven-path diff; original app/server/Android source and migration SQL untouched
- [ ] CI-only loopback+explicit ACK+fresh disposable PG18 service-ID attested before DDL
- [ ] Original checked-in migration 0001–0008 applied, 37 expected tables, five checksum receipts
- [ ] Independent nonowner LOGIN with NO SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB/INHERIT
- [ ] Actual secure metadata, LIVE and UNREAD sender/recipient scoping; allowed sender INSERT verified
- [ ] Cross-user SELECT/INSERT denied, unauthorized V1 plaintext/case/history/key reads denied
- [ ] Forged/tampered JWT; modified actor context; expired/replayed signed context denied
- [ ] Synthetic test-only policies/privileges/roles/schemas removed or run fails cleanup
- [ ] Final branch and PR head CI including existing Foundation and B3c-2R matrix PASS
- [ ] Separate post-merge CI explicitly checked before certifying independent main; no hosted actions

**Unresolved intentionally:** this is a standalone signed-actor SQL demo, not the B3b-2 encrypted-transaction integration, real persistent key management, age proof, actual user/Block lock races, approved prod RLS or an authenticated hosted API. SQL function is a synthetic trust experiment, NOT a recommended live design without deeper security review. V2 activation blocked pending real hosted nonowner role and broader gates.

## Initial code-head CI and known limitations (2026-11-17)

- Draft [implementation PR #56](https://github.com/rayadinaveen98-ship-it/bridge/pull/56), exact seven-path scope; final SHA and new tests must be reverified after this evidence and volatility amendment.
- Initial [PG18 proof CI #43941926838](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43941926838) failed **before database access** due to local fixture constant `URL` shadowing JavaScript's `URL` constructor; the affected helper was fixed in the same approved test file.
- Repaired code-head [PG18 proof #43942178822](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942178822): **15/15 Node TAP PASS**, 0 failed/skipped (13 nested tests + 2 parent results). Actual checked-in 0001–0008 SQL, 37 Bridge tables, 5 ledgers and all RLS negative/positive tests succeeded on disposable PostgreSQL 18. [Prior PG16/PG18 role matrix #43942179075](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942179075) 2/2 job SUCCESS; [Foundation #43942178967](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942178967) matching + PG16 integration both SUCCESS.
- Review refinement after first green code-head: mark the test verifier **VOLATILE** because it reads transaction context/time; add separately checked **valid-MAC but expired-context** denial. These revisions require **new exact-head CI** before certification; never carry forward old PASS as final.
- The independent test role never read old `bridge_messages.body` or the synthetic signing table. HMAC actor context was scoped to a transaction and denied unauthorized actor changes, replays and unauthenticated SQL. Positive insert transaction was always rolled back; seeded rows are synthetic and discarded with the disposable container. These are not production-safe policies or a live JWT/key service.
