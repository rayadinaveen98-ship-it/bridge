# Bridge B3c-2R — Disposable PG16/PG18 evidence ledger

**Status: IMPLEMENTATION CANDIDATE / CI UNVERIFIED UNTIL CHECKED BELOW.**  
Founder-approved scope: design/docs + disposable 16/18 tests only; no Neon/Render/Android/tester data changes.  
Pinned baseline: \`main@ad01d815ef1cd407ba50cb0b15df68412abf6b8e\`.

## Change manifest (exactly seven paths)
1. NEW \`apps/api/tests/v2/privileges/b3c2r_guard.mjs\`: fail-closed GitHub Actions-only independent cluster attestation, generated roles/synthetic schemas and teardown.
2. NEW \`apps/api/tests/v2/privileges/b3c2r_matrix.test.mjs\`: negative role tests and canary-only positive RLS check.
3. MOD \`apps/api/package.json\`: one named test script.
4. NEW \`.github/workflows/bridge-role-isolation.yml\`: separate disposable PG16 and PG18 CI matrix; no hosting secrets.
5. NEW \`docs/engineering/V2_06B_B3C2R_ROLE_DESIGN.md\`: this proposal, risk matrix, rollback and acceptance.
6. NEW \`docs/engineering/V2_06B_B3C2R_EVIDENCE.md\`: this exact scope and CI ledger.
7. APPEND \`docs/ROADMAP.md\`: reconcile verified B3c-2 and next stage.

## Verification checklist — not a claim of passing tests

- [ ] Exact seven-path diff and unchanged legacy runtime/migrations.
- [ ] GitHub Actions PostgreSQL 16 isolated job PASS; Node TAP count documented.
- [ ] GitHub Actions PostgreSQL 18 isolated job PASS; Node TAP count documented.
- [ ] Existing Foundation matching and PostgreSQL 16 regression CI PASS.
- [ ] Loopback, PG major, container cluster ID and dual ACK preflight; no connection to production.
- [ ] Runtime role positive/negative isolation, RLS, views, GUC and escalation proofs.
- [ ] Teardown roles/schema and no application data drift in disposable jobs.
- [ ] Final code SHA/review and main CI independently verified before marking certified.

No B3c-2R hosted deployment is authorized. This cannot prove the real Neon API runtime role was remediated: **HOLD V2 remains in effect**. B3c-3, V2-07..V2-16, R0 phone/tablet QA remain open.
