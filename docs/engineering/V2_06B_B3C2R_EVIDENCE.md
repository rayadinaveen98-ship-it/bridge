# Bridge B3c-2R — Disposable PG16/PG18 evidence ledger

**Status: TESTED on disposable PG16 and PG18 / final exact-head PR and postmerge CI pending / NOT HOSTED.**  
Founder-approved scope: design/docs + disposable 16/18 tests only; no Neon/Render/Android/tester data changes.  
Pinned baseline: `main@ad01d815ef1cd407ba50cb0b15df68412abf6b8e`.

## Change manifest (exactly seven paths)
1. NEW `apps/api/tests/v2/privileges/b3c2r_guard.mjs`: fail-closed GitHub Actions-only independent cluster attestation, generated roles/synthetic schemas and teardown.
2. NEW `apps/api/tests/v2/privileges/b3c2r_matrix.test.mjs`: negative role tests and canary-only positive RLS check.
3. MOD `apps/api/package.json`: one named test script.
4. NEW `.github/workflows/bridge-role-isolation.yml`: separate disposable PG16 and PG18 CI matrix; no hosting secrets.
5. NEW `docs/engineering/V2_06B_B3C2R_ROLE_DESIGN.md`: this proposal, risk matrix, rollback and acceptance.
6. NEW `docs/engineering/V2_06B_B3C2R_EVIDENCE.md`: this exact scope and CI ledger.
7. APPEND `docs/ROADMAP.md`: reconcile verified B3c-2 and next stage.

## Verification checklist — not a claim of passing tests

- [x] Exact seven-path change manifest checked at implementation SHA `e10a5ad3fe229bb8b97b13e3be158a54baaaefb5`; no app runtime, original SQL migrations or hosted providers modified.
- [x] PostgreSQL 16 isolated CI job PASS, **11/11 TAP passed**, 0 failed/skipped ([matrix run #43937238128](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937238128)).
- [x] PostgreSQL 18 isolated CI job PASS, **11/11 TAP passed**, 0 failed/skipped (same matrix run #43937238128).
- [x] Existing Foundation `matching` and `postgres-integration` CI PASS on the same code head ([run #43937238009](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937238009)).
- [x] Strict loopback, DB/user/password, CI/GitHub Actions and role ACK guarded before DDL; independent Docker service cluster ID and PostgreSQL major 16/18 attested; no hosted connection.
- [x] Five independently authenticated synthetic roles tested for permission denial, default-deny RLS, canary scoped row, invoker view, arbitrary actor GUC, SET ROLE/DDL denial and FORCE RLS.
- [x] Teardown drops the generated role/schema and checks no generated role/schema remains; both disposable containers terminated on success. Only synthetic rows were created.
- [ ] Final code SHA/review and main CI independently verified before marking certified.

No B3c-2R hosted deployment is authorized. This cannot prove the real Neon API runtime role was remediated: **HOLD V2 remains in effect**. B3c-3, V2-07..V2-16, R0 phone/tablet QA remain open.

## Test failure and repair record — transparent evidence

- [Initial matrix run #43937063679](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937063679) failed in both disposable jobs because a cleanup-state variable was declared `const` before being set to true after schema creation. The `finally` block correctly refused to certify incomplete cleanup. The containers were disposable and destroyed; no hosted database or existing QA fixture was touched.
- A **one-file** guarded fixture repair at `e10a5ad3fe229bb8b97b13e3be158a54baaaefb5` changed the cleanup tracking to mutable. The subsequent separate [PG16/18 matrix #43937238128](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937238128) passed both jobs with **11/11 TAP each**. The [Foundation regression #43937238009](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937238009) passed both jobs.
- These PASS results certify the narrow **synthetic canary permission model**; they DO NOT certify the real 0008 SQL against PG18, user-specific RLS or actual hosted Neon privilege remediation. Actual Render V2 privileges remain **HOLD_V2**.
- **Final paperwork pending:** verify the exact amended docs SHA on both PR jobs and branch jobs, then mark ready for review; merge only on independently verified CI. Postmerge main CI requires its own verification; never infer that from a PR run.
