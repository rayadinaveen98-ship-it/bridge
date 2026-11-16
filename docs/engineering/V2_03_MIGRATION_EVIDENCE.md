# Bridge V2-03 — Migration evidence and safety certification

**Status:** IMPLEMENTED / DISPOSABLE CI VERIFIED — NOT APPLIED TO NEON. Final commit and merge validation recorded separately.  
**Source brief:** [Founder-approved V2-03 implementation scope](V2_03_IMPLEMENTATION_BRIEF.md), documentation [PR #19](https://github.com/rayadinaveen98-ship-it/bridge/pull/19).  
**Base:** `main@81c4c9373e3b088f908edd20ea7f697b8c5106eb` (documentation-only PR #19 merged).  
**User authorization:** Four expand-only SQL migrations, guarded disposable `bridge_test` runner, synthetic preservation/integrity tests, CI and documentation; **no live Neon SQL or reads, no Render deployment, no billing, no app changes**.

## 1. Exact change inventory

| Source | Purpose | Restriction |
|---|---|---|
| `database/migrations/0004_v2_metadata.sql` | Migration receipt ledger + nullable V2 clocks, direct context and policy metadata | No legacy backfill or triggers |
| `database/migrations/0005_v2_delivery.sql` | New direct-session exclusivity, scoped payload and seven-day unread envelopes | No message copy, keys or runtime writer |
| `database/migrations/0006_v2_history.sql` | Bilateral consent, separately scoped prospective history, server-granted QA-only entitlement structure | No TEST grants, charges or real receipts |
| `database/migrations/0007_v2_evidence_retention.sql` | Restricted report tokens/evidence and case access, retention jobs, deletion/policy ledgers | No reports copied, worker scheduled or messages deleted |
| `apps/api/tests/v2/migrations/runner.mjs` | SHA-256/checksum-managed, transactionally safe apply and recovery | Requires `BRIDGE_TEST_DATABASE_URL` with local `bridge_test` AND exact disposable acknowledgment |
| `apps/api/tests/v2/migrations/rehearsal.test.mjs` | M03-01–15 synthetic source-data preservation, rollback/fault, constraints and grant posture | No real account or live DB records |
| `apps/api/package.json` | Named test-only runner | No startup/dependency change |
| `.github/workflows/foundation.yml` | Disposable PostgreSQL rehearsal plus `pg_dump` / isolated restore and original API regression | Same container PostgreSQL 16 test service; no new cloud resources |

**Four migration layers create exactly 14 new tables.** Existing twenty original tables, data, enums and original `bridge_messages.body text NOT NULL` remain intact. New columns on old tables are nullable; there are no default values that would classify old records as new sessions. Original `bridge_connections.source_conversation_id` remains untouched.

## 2. Required verification mapping

| Requirement | Evidence method |
|---|---|
| M03-01 source migrations 0004–0007 | Runner receipt and four checksum ledger rows |
| M03-02 original 20 tables/body NOT NULL | Disposable pre-migration catalog check |
| M03-03 fixture of 2 accounts / 1 random / 4 messages / 2 match slots | Seed before expand, hash-sensitive original content |
| M03-04 original source/chat/member/message/slot unchanged | Snapshot equality after apply |
| M03-05 legacy `legacy_qa`, `idle_expires_at`, `last_accepted_at` null | No implicit expiry/backfill |
| M03-06 exclusive open direct session and closed segments | PostgreSQL unique index and two closed/fresh rows |
| M03-07 unread envelope FKs/unique/7d check | Duplicate/invalid actor/8d writes rejected |
| M03-08 consent uniqueness, 90d max, QA-only grants | Invalid writes rejected; no grant auto-issued |
| M03-09 report/evidence FK `RESTRICT`, case data not dropped | Invalid report/delete fails |
| M03-10 RLS on all 14 new tables, no public policies or grants | PostgreSQL catalogs `pg_class`, `pg_policies` |
| M03-11 all prior Node/HTTP/PostgreSQL tests and V2-01/V2-02 suite | Existing Foundation CI and API suite after schema expansion |
| M03-12 rerun no-op / hash mismatch refuses | Same-checksum skip and mismatch unit assertion |
| M03-13 dump and restore into second disposable DB | `pg_dump` + `pg_restore` and row/table/count verification in CI |
| M03-14 fail-injected migration `0005` rolls back | Receipt remains 0004 only; 0005 objects absent; old-data snapshot exact |
| M03-15 no automatic new data, entitlements, expiry or retention | New tables empty immediately after apply, legacy clock null |

## 3. Important design limitations, not release gaps silently closed

- **No V2 runtime service queries or writes the new tables yet.** The existing old `connections()` API still requires an OPEN original random room. V2-05/V2-11 must introduce the compatible relationship/read path before any new direct rows are used.
- `bridge_messages.body NOT NULL` is intentionally preserved. Metadata-only messaging requires an independent approval at V2-06/V2-11, after old-history route safe denial.
- Encryption is **not implemented**: the ciphertext/key reference columns are a structural placeholder only. No paid KMS or generated encryption key has been provisioned.
- A foreign key can prove a recipient/connection exists but does not establish that they belong to the **same** relationship without further normalized composite FK, trigger, or transactional authorization. That invariant remains a mandatory backend validation in V2-06; schema existence alone must not be treated as authorization.
- No report tokens, case evidence, retention schedules, TEST entitlements or history retention are activated.
- SQL table RLS protection in disposable CI is **not proof** of Render's runtime PostgreSQL principal or the safety of its permissions. Live role verification is a separate approval.
- Any `pg_dump`/restore exercise is done on synthetic disposable CI data only, not on Neon.
- Existing synthetic QA room and messages have not been accessed or reclassified for this migration. Historical observation of two testers/four messages is not a new production audit.
- R0 physical phone/tablet acceptance remains OPEN, and exhaustive 138-case What If? remains V2-16.

## 4. Planned CI verification entry (fill only after GitHub checks actually finish)

| Check | Current status |
|---|---|
| Source build / migration static review | PASS — all nine paths reviewed at tested code head |
| Migration transactional rollback and source fixture | PASS — 15/15 Node migration tests |
| PostgreSQL constraints, FKs and RLS | PASS — disposable PG16, M03-06 through M03-10 |
| Second disposable database backup/restore | PASS — PostgreSQL 16 matched client tools; 34 tables, four receipts, four original fixture bodies, two active slots |
| Original API compatibility regression | PASS — after all V2 migrations on same disposable PG16 |
| Original V2-01 contract and V2-02 policy tests | PASS — matching 12, backend 34 (+4 skipped), V2-01 20, V2-02 68 |
| PR file scope / main branch SHA | Scope PASS: nine approved paths; pre-merge main `81c4c937` |
| Live Neon, Render, Android, billing touched | **NO — no live writes, reads, deployments or charges** |

A failing CI gate blocks merge. On a successful test-only PR, the honest status is **V2-03 MIGRATIONS IMPLEMENTED / DISPOSABLE CI VERIFIED / LIVE NEON NOT APPLIED**. No V2-04, live-schema grant, backend activation, user data deletion or release follows automatically.

### Verified CI runs (code head `2b8cc1f91b9ea34365dad27ad4c02c270e38e48f`)

- [PR Foundation run 43802991189](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43802991189): **success**; both `matching` and `postgres-integration` jobs succeeded.
- [Push Foundation run 43802986610](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43802986610): **success**; both jobs succeeded.
- PostgreSQL job confirms 15 new disposable migration tests passed, migration receipt/transaction rollback, PG16 `pg_dump`/`pg_restore` verification and existing API regression tests.
- **CI correction:** the initial run failed only in backup restore because a newer runner `pg_restore` emitted unsupported `transaction_timeout` on PostgreSQL 16. The final job uses the PostgreSQL 16 client utilities inside the same disposable database container; all tests passed after that correction.
- A subsequent documentation commit changes the PR head. **Revalidate the final head and post-merge CI before asserting complete certification**.

## 5. Rollback

Before a live migration: revert test/SQL-only PR if a problem is found; dispose of test databases. No live service rollback. After a separately approved future QA DDL, generally leave additive new tables unused and forward-fix; do not run destructive down migrations. Purge/retention and backup restore are different approvals and are NOT part of this V2-03 action.
