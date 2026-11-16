# Bridge V2-06B / B3c-1 — Disposable PostgreSQL 16 Role/RLS Proof Implementation Brief

**STATUS: PROPOSED EXACT IMPLEMENTATION SCOPE — FOUNDER SOURCE APPROVAL REQUIRED. No B3c-1 source changes authorized by this document.**  
**Prepared:** 16 November 2026.  
**Verified baseline:** `main@fbbea78bca3ce8ca5f2c48152bc4008f723e089d`; [Foundation #43903076373](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43903076373) both matching and PG16 success.  
**Predecessor:** [B3c security readiness](V2_06B_B3C_SECURITY_READINESS_BRIEF.md), [role/key/cost matrix](V2_06B_B3C_ROLE_KEY_COST_MATRIX.md); B3b-2 [implementation #47](https://github.com/rayadinaveen98-ship-it/bridge/pull/47) and [certificate #48](https://github.com/rayadinaveen98-ship-it/bridge/pull/48) merged, 29/29 synthetic Node TAP, disconnected and NOT LIVE.  
**Companion:** [B3c-1 role/RLS attack matrix](V2_06B_B3C1_RLS_ATTACK_MATRIX.md).

## 1. Verified repository baseline and the security question

- `database/migrations/0008_v2_secure_messaging.sql` enables RLS on `bridge_v2_secure_messages`, `bridge_v2_secure_live` and `bridge_v2_secure_unread` **without any policy**. Owner/superuser privilege used by existing disposable CI is not a real least-privilege runtime proof.
- Foundation CI PostgreSQL 16 service uses disposable `POSTGRES_USER=bridge_test`, `POSTGRES_DB=bridge_test` and fixed test-only Docker credential. `BRIDGE_TEST_DATABASE_URL` is loopback-only, `BRIDGE_TEST_MIGRATION_ACK=disposable-bridge_test-only` required by original migration code. Its `postgres-integration` job runs original migration rehearsal, schema+backup/restore, B2 and B3b-2 tests sequentially.
- `apps/api/tests/v2/private_messaging/migration_0008_runner.mjs` checks actual database, username, loopback and migration ledger before its controlled 0008 rehearsal. **Do not edit or bypass it.**
- `apps/api/src/start.mjs` creates the *hosted legacy V1* pool from `BRIDGE_DATABASE_URL`; actual Render runtime database role/grants, ownership and RLS bypass are **UNVERIFIED** and outside this stage.
- PostgreSQL 16 RLS documentation: table owner is normally exempt, superusers/`BYPASSRLS` always exempt, no policies gives default deny for nonowners **after table privileges allow an operation**. Normal views use *view-owner* permissions unless `security_invoker=true`; `SECURITY DEFINER` functions run as owner and function EXECUTE defaults to `PUBLIC` unless revoked. These are reasons to test **real login identities**, not just catalog flags or `SET ROLE` from a superuser.

**B3c-1 goal:** prove that independently logged-in nonowner roles cannot use basic table privileges, inherited grants, accidental views or functions to read/write V2 data outside an explicitly authorized policy; demonstrate owner/view/function failure modes **only with disposable canary objects**, never hosted user content. Test-only role creation and SQL GRANTs are restricted to the CI PostgreSQL16 container.

**Not the goal:** implement production V2 RLS policies, functions or API access. This suite should expose what would fail or leak, not solve hosted authorization without a separate reviewed design. Zero changes to Neon/Render.

## 2. EXACT proposed implementation allowlist — SEVEN files

| # | Path | Proposed change (strict) |
|---|---|---|
| 1 | `apps/api/tests/v2/privileges/fixtures.mjs` | **NEW** disposable-only PG16 privilege harness. Validate exact loopback DSN+ACK, actual `current_user/session_user=bridge_test`, database `bridge_test`, PG16 version, TCP loopback server address and 0008 receipt. Generate random bounded `b3c1_` role/schema identifiers and unique test-only passwords in memory. Create real nonowner **LOGIN** roles, a non-superuser table-owner role, and an isolated canary schema/table; open distinct authenticated PostgreSQL sessions, never reuse elevated `SET ROLE` as login proof. Full teardown and no plaintext/key/password logs. |
| 2 | `apps/api/tests/v2/privileges/rls_nonowner.test.mjs` | **NEW** actual three 0008 tables RLS/no policy catalog checks, real nonowner with explicit lab-only `SELECT` grant still sees no rows; independent nonowner privileges denied or filtered correctly. Demonstrate owner bypass and `FORCE ROW LEVEL SECURITY` **only** on a separate canary table owned by a **non-superuser owner role**; never alter FORCE on the existing 0008 tables. Prove no mutation to existing synthetic legacy QA. |
| 3 | `apps/api/tests/v2/privileges/privilege_inheritance.test.mjs` | **NEW** real LOGIN actor/NOLOGIN group inheritance, `PUBLIC`/schema privileges and effective GRANTs; role cannot acquire owner, BYPASSRLS, DDL, migration, cross-purpose case/reviewer, or unintended V1 legacy message table access. Test that a GRANT can allow reaching RLS but never overrule its default denial. Teardown transient GRANTs. |
| 4 | `apps/api/tests/v2/privileges/view_function_boundary.test.mjs` | **NEW** disposable **canary only** view/function attack tests: default-owner view can unintentionally expose aggregate data through an owner bypass; PostgreSQL16 `security_invoker=true` correctly enforces invoker privilege/RLS; `SECURITY DEFINER` function and default `PUBLIC EXECUTE` risks are reproduced only with a synthetic canary aggregate, with immediate transactional REVOKE and locked `search_path`. Explicit safe-denial after REVOKE; no actual V2 app function/policy created or modified. |
| 5 | `apps/api/package.json` | **MODIFY ONLY:** append `test:v2:privileges:db` to run three Node test files **sequentially** using `node --test` with no new runtime dependencies or changes to other scripts. |
| 6 | `.github/workflows/foundation.yml` | **MODIFY ONLY:** append one **postgres-integration** job step after B3b-2 named `B3c-1 disposable PG16 independent-login privilege and RLS denial tests (NOT HOSTED)`, with existing `BRIDGE_TEST_DATABASE_URL` and explicit `BRIDGE_TEST_MIGRATION_ACK=disposable-bridge_test-only`. Do not change GitHub job permissions, secrets, container, other steps or deploy behavior. |
| 7 | `docs/engineering/V2_06B_B3C1_EVIDENCE.md` | **NEW:** actual test case results/counts, hashed canary snapshots and role cleanup, catalog checks, exact final PR SHA, separate push + PR + postmerge CI, vulnerabilities reproduced, scope/hosted blockers. Never copy credentials or user data. |

**No other code/migrations/docs paths** in B3c-1 implementation. In particular **do not modify** `apps/api/src/**` (B3b-2, auth, V1 HTTP/PG, start, crypto, keys), original V1/B1/B2/B3 tests, `database/migrations/0001..0008`, Android, Neon/Render resources, live roles/SQL, provider secrets, payments, data retention or historical QA. Do not add dependency packages or GitHub secrets.

If any proven acceptance requirement needs an eighth file or modification of original migrations/privileged code, **STOP, report which case is blocked and ask for a scoped change**.

## 3. Exact test environment and destructive-operation fence

**Use dedicated disposable PostgreSQL 16 service from Foundation CI ONLY**, never a developer's existing database, even when named `bridge_test`. The guard must ensure all conditions before performing `CREATE ROLE`, `GRANT`, `DROP ROLE`, `CREATE SCHEMA` or `DROP SCHEMA`:
- Existing test ack string exactly `disposable-bridge_test-only`; URL protocol `postgresql:` or `postgres:`; hostname exactly `127.0.0.1` or `localhost`; port 5432 or omitted; pathname exactly `/bridge_test`; username `bridge_test`; expected test-only password present, no URL search/fragment.
- Connected actual `current_database()='bridge_test'`, `current_user=session_user='bridge_test'`, PostgreSQL **major version 16**, non-null loopback TCP `inet_server_addr()` matching loopback address, current catalog role is elevated only inside ephemeral CI, and verified `0008` schema migration receipt with source checksum and three V2 tables. This does **not** validate Render/Neon.
- Include an additional **ephemeral CI-only authority marker** set by the workflow such as `BRIDGE_B3C1_ROLE_TEST_ACK=disposable-pg16-service-role-ddl`. Guard before any role DDL; do not run if missing. Never accept a remote host, SSL DSN or generic production URL. Do not call the hosted `BRIDGE_DATABASE_URL`.
- Names must be unique generated `b3c1_[a-z0-9_]` identifiers and validated before SQL string interpolation. Role passwords are fresh random in-memory values, passed only to local PG16 connection objects and never reported. Open a **real separate authenticated LOGIN connection** to test role properties; avoid `SET ROLE` performed by the superuser as proof of least privilege.
- Test roles: a **non-superuser owner** for canary owner-vs-FORCE RLS; one independent nonowner runtime; one `NOLOGIN` group role for membership/inheritance. All created with `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION` and no broad grants.
- Keep role/GRANT demonstrations limited to the random canary schema and at most **temporary synthetic grants on the three 0008 tables**. Never insert/update/delete actual V2 tables via a nonowner (except expected denied operations that cannot commit). No role grants to existing `bridge_test` superuser, no public permissions on existing V1/V2 tables or functions.
- **Cleanup:** use `try/finally`, close role-specific pools BEFORE dropping roles, revoke direct/inherited grants, `DROP SCHEMA b3c1_* CASCADE` only on the uniquely generated test schema, `DROP OWNED BY` ephemeral roles only if proven to reference allowed test schema/grants, `DROP ROLE` names in an exact allowlist; fail if cleanup does not restore original RLS/grants/catalog/hash baseline. CI container destruction after job is a last-resort recovery, not a substitute for test teardown. Never `DROP` a shared/hosted schema.
- Tests must not silently skip when PG16 is missing in the CI step; treat missing ACK/DB or wrong principal as a hard failure. Do not print full DSN, passwords, JWT, ciphertext, sensitive account rows or extended SQL errors to CI output.

**Operational nuance:** PostgreSQL default function EXECUTE to PUBLIC and owner-rights views can bypass a table's intended protection. Demonstrate these risks only on isolated canary objects, and where a test needs intentionally risky permission, create+revoke in one transaction so nothing is exposed transiently to unrelated roles.

## 4. Acceptance and negative test cases

The companion matrix has **P03-01..P03-24 proposed case identifiers**. They are **not test/TAP counts or passed cases yet**.

- Three V2 0008 tables: `relrowsecurity=true`, no policy unless separately approved, expected current table owner; no existing source migration rewrite.
- Independent nonowner LOGIN with explicit SELECT grant on V2 secure tables still sees **zero** rows, not readable ciphertext. Without SELECT or USAGE, receives permission denial; INSERT/UPDATE/DELETE are similarly prevented by RLS/privilege scope, verified without modifying real old or secure messages.
- A non-superuser canary table owner bypasses RLS by default, then `FORCE ROW LEVEL SECURITY` changes owner behavior; note a superuser always bypasses, so do not use `bridge_test` as the owner in this specific test.
- Real group inheritance and `PUBLIC`/schema USAGE outcomes checked in catalogs and on independently logged-in clients. No unintended owner elevation, `SET ROLE` to schema owner, arbitrary DDL/CREATE ROLE, BYPASSRLS or `bridge_messages.body` access.
- Owner-defined default view and SECURITY DEFINER function canary exposure reproduced safely; compare invoker view and revoked EXECUTE. **No user/production plaintext** used in test objects.
- Attempting to spoof `SET LOCAL bridge.actor_id` can be done by a real role; do not equate an attacker-modifiable session setting to trusted actor authentication.
- Snapshots prove 0008 source/ledger hashes, all original 37 table names, existing four-message **disposable** QA fixture and RLS/policy catalogs unchanged. Clean up role/schema/GRANT; no real QA/Neon data touched.
- Existing `test:v2:private-schema`, B1/B2, B3a/B3b-1/B3b-2 and Foundation matching suites must remain green.

## 5. Quality gates and merge stop rules

**Before merge:** exact seven-file diff, final evidence-head push and pull-request Foundation `matching` **and** `postgres-integration` both SUCCESS, actual new TAP counts and zero failed/skipped cases, no role leakage, ledger/canary snapshot safe, existing suites unchanged. Require final SHA match, then merge and verify independent `main` CI both jobs.

**Hard stop:** any remote DB connection possibility; unexpected global role persistence; any `CREATE POLICY` or `FORCE RLS` on existing V2/V1 tables; test access to genuine QA records; any actual API/Android code imported/wired; production secret/vendor cost or live DDL; surprising view/function leak outside canary; skipped new security negative tests; previously passing regression failure. Do NOT weaken RLS/default denial to obtain an "authorized" success path.

**What B3c-1 success would NOT mean:** actual hosted runtime role is safe, a nonowner V2 API can execute authorized operations, Render/Neon roles are partitioned, G1 old V1 routes are firewalled, key/provider is production-ready, public adult eligibility is verified, or Android physical acceptance is complete.

**Later gates stay separate:** B3c-2 read-only actual Render runtime principal + Neon grants audit, B3c-3 founder-approved production keys/provider/cost, V2-07 reporting, V2-10 Android, G1/V2-11 private cutover, retention and billing. **R0 physical phone/tablet acceptance OPEN. V2-16 138-case What If? review FINAL.**

## 6. Founder implementation authorization wording (not granted by docs merge)

> Approve Bridge B3c-1 implementation exactly within the seven-file scope in `docs/engineering/V2_06B_B3C1_IMPLEMENTATION_BRIEF.md`, using **only** the acknowledged disposable PostgreSQL 16 CI database. Test real independent nonowner/owner LOGIN roles, RLS default denial, inherited grants and isolated canary view/function bypasses; restore all disposable privileges and roles. Preserve existing V1/B1/B2/B3 code, migrations, Android, historical QA and hosted Neon/Render. Require final push, PR and post-merge CI with zero security test failures before merging. B3c-2/B3c-3 remain separately gated.

**No B3c-1 source file has been implemented by this specification.** Approval is needed for role DDL even in disposable CI.

## PostgreSQL 16 primary references

- [Row Security Policies](https://www.postgresql.org/docs/16/ddl-rowsecurity.html) (owner exemptions, default deny, BYPASSRLS/FORCE).
- [CREATE VIEW](https://www.postgresql.org/docs/16/sql-createview.html) (security_invoker and view-owner semantics).
- [Privileges](https://www.postgresql.org/docs/16/ddl-priv.html) (default PUBLIC EXECUTE on functions; same-transaction REVOKE).
- [CREATE ROLE](https://www.postgresql.org/docs/16/sql-createrole.html) (NOBYPASSRLS and role scope).
