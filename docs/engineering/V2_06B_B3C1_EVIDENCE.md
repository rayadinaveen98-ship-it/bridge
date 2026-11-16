# Bridge B3c-1 — Independent LOGIN PostgreSQL16 RLS/Privileges Evidence

**Status:** IMPLEMENTED IN ISOLATED BRANCH; CI PENDING / NOT HOSTED.  
**Approved by founder:** B3c-1 exactly as [seven-file implementation brief](V2_06B_B3C1_IMPLEMENTATION_BRIEF.md), PostgreSQL 16 disposable roles and canary only.  
**Baseline:** `main@808f787707396a3f6895d95f6b3ce0a10a72cba2`, [Foundation CI #43907937634](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43907937634) matching and postgres-integration success.  
**Companion:** [24-case adversarial PG16 matrix](V2_06B_B3C1_RLS_ATTACK_MATRIX.md). Matrix case IDs are not actual Node test counts.

## Exact seven-file implementation allowlist

1. **NEW** `apps/api/tests/v2/privileges/fixtures.mjs` — guarded 0008 checksum, PG16/DB/role/host identity, GitHub Actions CI and double-ACK checks before any DDL; real LOGIN owner/actor and NOLOGIN group; generated isolated canary schema; no real token/password logs; role/catalog and synthetic legacy snapshot and teardown.
2. **NEW** `apps/api/tests/v2/privileges/rls_nonowner.test.mjs` — independent authenticated nonowner, V2 RLS default deny even with GRANT and fixture rows, owner/FORCE canary.
3. **NEW** `apps/api/tests/v2/privileges/privilege_inheritance.test.mjs` — NOLOGIN group grant inheritance, PUBLIC effective ACL, denied escalations/legacy table reads, arbitrary custom actor GUC spoof demonstration.
4. **NEW** `apps/api/tests/v2/privileges/view_function_boundary.test.mjs` — owner-view versus PG16 `security_invoker` and same-transaction PUBLIC REVOKE for SECURITY DEFINER, all only synthetic integer canary data.
5. **MODIFY** `apps/api/package.json` — append `test:v2:privileges:db` only, three files sequentially.
6. **MODIFY** `.github/workflows/foundation.yml` — append PG16 integration job step with the extra role DDL ACK.
7. **NEW** `docs/engineering/V2_06B_B3C1_EVIDENCE.md` — this source/evidence/CI ledger.

No existing `apps/api/src/**` code, migrations 0001–0008, existing tests, Android/Flutter, hosted Render/Neon schema/data/roles, private keys/KMS, paid providers, retention, history, case-review or QA tester data are in scope.

## Trust boundary and test protections

- Connections only to explicitly acknowledged GitHub Actions **CI** `bridge_test` PostgreSQL **16** at TCP loopback `127.0.0.1:5432`, with exact test-only account and a second `BRIDGE_B3C1_ROLE_TEST_ACK`. The actual database, session user, current user, host, PG16 version and 0008 source checksum are checked before role DDL. No user-supplied remote DSN, SSL or alternate account.
- Actor/owner tests establish **independent credentialed PostgreSQL LOGIN sessions**, not `SET ROLE` from the privileged fixture owner. All generated role names prefixed `b3c1_` with bounded random suffix and synthetic password material never logged. Test-only role actor cannot become database owner or BYPASSRLS.
- Only temporary **synthetic grants on the 0008 tables**, never application/production RLS policies. Intentional owner/FORCE, owner-view, SECURITY DEFINER and group inheritance probes use a brand-new `b3c1_*` canary schema and one synthetic integer. PUBLIC EXECUTE is revoked within function creation transaction; no public exposure window.
- `finally` closes real LOGIN sessions, revokes synthetic grants/membership, drops only generated canary schema and generated roles and verifies the original effective-privilege/RLS catalog and hashes of disposable legacy messages, active slots, five-ledger receipts and 37 table names. An explicit owner ACL and a NULL ACL can have identical effective privileges; the snapshot normalizes PostgreSQL effective grants rather than confusing their physical representation with an authorization change.
- Tests fail closed if the environment or role-DDL ACK is absent. Running these tests against Neon/Render is not approved and must not be possible by supplied configuration.

## Pending CI and acceptance evidence

- New named runner `test:v2:privileges:db`: **actual TAP pass/fail/skipped counts PENDING**. Do not label P03-01..P03-24 as passed simply because scenario IDs exist.
- Exact seven-path PR diff must be checked. Require final push **AND** PR event Foundation matching+PG16 jobs green on the exact final SHA, existing B1/B2/B3b regressions unchanged, no leaked `b3c1_` role/schema and no original QA checksum change. Recheck main after merge and record its independent CI run.
- On failure: stop; fix within the seven paths only, or seek separate approval. Never weaken RLS/default denial or modify original SQL to make a test pass.
- Even passing this suite **will not prove** actual Render runtime role, Neon RLS grants, a production authorized V2 nonowner path, key/provider custody, real adult eligibility or V1 route privacy. Actual hosted read-only audit B3c-2 and key architecture B3c-3 require separate founder approvals.

**Release gates remain:** R0 physical Android phone/tablet acceptance OPEN; G1/V2-11 old V1 GET/POST/SSE/bootstrap/Keep privacy firewall not wired; V2-10 Android not integrated; final V2-16 138-case What If? LAST. No hosted deployment or E2EE claim.
