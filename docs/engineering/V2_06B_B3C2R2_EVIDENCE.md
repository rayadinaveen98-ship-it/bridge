# Bridge B3c-2R2 — disposable actual-0008 PostgreSQL 18 evidence

**Status: CANDIDATE / NOT VERIFIED UNTIL FINAL CI. NOT HOSTED.**  
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
