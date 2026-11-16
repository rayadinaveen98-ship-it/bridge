# Bridge B3c-1 — Disposable PostgreSQL16 Nonowner/RLS Attack and Evidence Matrix

**STATUS: PROPOSED TEST CASES / NO IMPLEMENTATION OR PASSED TEST CLAIM.**  
**Source baseline:** `main@fbbea78bca3ce8ca5f2c48152bc4008f723e089d`; Foundation [#43903076373](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43903076373) SUCCESS (matching + PG16).  
**Companion:** [B3c-1 exact seven-file brief](V2_06B_B3C1_IMPLEMENTATION_BRIEF.md); [B3c security gate](V2_06B_B3C_SECURITY_READINESS_BRIEF.md).  
**Lab:** Fresh `postgres:16` CI service at `127.0.0.1:5432/bridge_test`; three independent generated LOGIN/NOLOGIN roles; isolated random canary schema; no hosted Neon/Render data or queries.

## 1. Attack matrix: 24 requirements, not Node TAP counts

| ID | Test / attacker attempt | Expected observable proof |
|---|---|---|
| P03-01 | Wrong/missing `BRIDGE_TEST_MIGRATION_ACK`, `BRIDGE_B3C1_ROLE_TEST_ACK` | FAIL before role creation or database connection |
| P03-02 | Non-loopback DSN, wrong role/database/port, query/fragment/SSL options | Reject before any role DDL, cannot contact hosted database |
| P03-03 | Actual session is not `bridge_test`, DB not `bridge_test`, version not PG16, remote server address or missing 0008 checksum receipt | Abort before any lab role/schema modification |
| P03-04 | B3c-1 harness creates ephemeral actor/owner LOGIN roles and NOLOGIN group | Authenticated separate sessions show intended `session_user/current_user` and NO SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB |
| P03-05 | Nonowner lacking schema/table privileges SELECTs three V2 tables | Permission denied, no metadata or body leak |
| P03-06 | Grant actor schema USAGE + SELECT on actual 0008 secure tables, but no policy | SQL reaches table, RLS returns **zero rows** even where synthetic rows exist; no unauthorized ciphertext |
| P03-07 | Nonowner with SQL INSERT/UPDATE/DELETE grants and no RLS policy | No unauthorized committed modification; INSERT violates policy, UPDATE/DELETE affect no rows (no false positive) |
| P03-08 | Query `relrowsecurity`, `relforcerowsecurity`, table ownership and policies for 3 V2 tables | RLS on, source/default policies unchanged; explain owner exemption, do not claim hosted role safe |
| P03-09 | Separate **non-superuser canary table owner** reads its own RLS-enabled canary | Owner-bypass demonstration returns the single synthetic row |
| P03-10 | Apply `FORCE ROW LEVEL SECURITY` **only to canary** owned by non-superuser | Owner is now denied by no-policy RLS, distinct from superuser, no change to 0008 |
| P03-11 | Effective SELECT privilege inherited through synthetic NOLOGIN group | Catalog shows effective GRANT, but inherited grant alone does not defeat RLS default deny |
| P03-12 | Actor tries `SET ROLE` to table owner or `bridge_test`; create role, change BYPASSRLS | Fails, no owner elevation or DDL right; actual login remains actor |
| P03-13 | Actor tries CREATE VIEW/TABLE/POLICY/FORCE RLS/GRANT on existing objects | Denied; lab canary schema is only exception for owner fixture |
| P03-14 | Unexpected `PUBLIC` grants on V2 tables/schemas, functions or sequences | Catalog audit flags; explicit test-only grants revoked after test |
| P03-15 | Owner creates **normal view over synthetic canary** and grants SELECT to outsider | Show documented view-owner permission bypass on canary aggregate, without user plaintext |
| P03-16 | Owner creates `security_invoker=true` view over same canary | Outsider without underlying table access is denied/filtered as intended |
| P03-17 | Owner creates `SECURITY DEFINER` function on canary | Show unintended aggregate access if EXECUTE is allowed; deny after explicit REVOCATION; never production function |
| P03-18 | Newly created function's default EXECUTE to `PUBLIC` | Demonstrate effective default in transaction; revoke PUBLIC in SAME creation transaction to prevent exposure window |
| P03-19 | Spoof `SET LOCAL bridge.actor_id` using nonowner LOGIN | Client can change arbitrary custom GUC; never treat it as authenticated actor without server-side binding |
| P03-20 | Actor probes old V1 `bridge_messages.body`, report evidence and history tables | No unauthorized row read; no case-review grant |
| P03-21 | Connection pool reuse after transaction rollback and role disconnect | Role/account context does not leak; verify new session_user and catalogs |
| P03-22 | Test-created GRANTs, lab schema and roles are removed in `finally` | No `b3c1_` roles/schema left and original table privilege/RLS catalog identical |
| P03-23 | Four-message/two-slot **disposable synthetic** QA fixture and 0008 ledger before vs after | Identical hashes/counts and original 37 schema table names; no migration rewrite |
| P03-24 | Full CI/migration/restore, B2/B3a/B3b-1/B3b-2 regressions, exact seven-file diff | Zero test failures or skips, both branch/PR jobs green, independent main verification |

**If implementation finds the "no user V2 rows" precondition is insufficient**, seed only independent synthetic rows in the disposable database with documented cleanup. Never copy any hosted account/message or change old QA rows.

## 2. Test fixture sequencing and cleanup

1. **Preflight (hard fail)**: connection guard and explicit B3c-1 role-DDL ACK; verify actual database, role, loopback address, PG16 major version, migration ledger+checksum and 0008 catalogs before granting anything.
2. **Scoped lab creation**: generate independent role identifiers and owner/actor passwords; create canary schema/table under a non-superuser owner, with precisely controlled schema USAGE/SELECT. Limit every SQL identifier to validated random `b3c1_` prefix; no uncontrolled caller table names or SQL templates.
3. **Separate authentication**: use actual PG16 connection as each LOGIN role with fresh ephemeral password, rather than `SET ROLE` on the `bridge_test` superuser. Verify `session_user`, `current_user`, role flags and effective membership.
4. **Privilege attack exercises**: test current three 0008 tables in read-only / denied transactions; modify lab-only canary objects for owner/FORCE/view/definer demonstrations. Any testing SELECT grant on the real 0008 tables must be removed before test exit.
5. **Canary function hazard**: create any definer function and immediately REVOKE EXECUTE FROM PUBLIC in the **same transaction** before COMMIT; grant only to the test role for the negative demonstration. Use constant or aggregate synthetic output, never ciphertext/plaintext copied from V1/V2.
6. **Cleanup and verify**: close actor/owner sessions; revoke lab grants on actual 0008, drop unique canary schema, remove only generated role/group; assert zero leaked `b3c1_` catalog entries, original RLS and privilege snapshots unchanged, migration receipts and test QA hash identical.
7. **Finish**: actual Node TAP/CI results, final SHA and scope diff recorded in new evidence doc. No source, migration, Android, hosted connection or paid provider tasks.

**Important PG16 accuracy:** owner normally bypasses RLS but **superuser always bypasses even FORCE**; view-owner permission evaluation differs from `security_invoker`; `SECURITY DEFINER` is potentially dangerous, not a blanket requirement; a nonowner SELECT with a GRANT and no policy returns zero instead of a permission error.

## 3. What must stop the merge

- Accidental Neon/Render connection, global test-role leakage, unexpected default public access on a real table, any live data read.
- Policy or FORCE RLS created on **actual** V1/V2 tables; existing 0008 migrations edited.
- Canary view/function probe returns actual message body or key bytes, or tests print role password, API key, SQL user data.
- Inherited privilege/owner status causes an unauthorized V2 row to become visible; stop and investigate rather than weakening a test.
- B3c-1 incorrectly claims a production allow policy, Render runtime least privilege, public adult eligibility or E2EE.
- New security cases skipped on CI or any existing Foundation suites regress.
- PR alters any file beyond the seven founder-approved implementation paths.

**R0 phone/tablet physical acceptance remains OPEN. G1/V2-11 V1 safe-denial remains release-blocking. V2-16 complete 138-case What If? stays LAST.**

## 4. Source references for review only

- PostgreSQL 16 [Row Security Policies](https://www.postgresql.org/docs/16/ddl-rowsecurity.html)
- PostgreSQL 16 [CREATE VIEW](https://www.postgresql.org/docs/16/sql-createview.html)
- PostgreSQL 16 [Privileges](https://www.postgresql.org/docs/16/ddl-priv.html)
- PostgreSQL 16 [CREATE ROLE](https://www.postgresql.org/docs/16/sql-createrole.html)
