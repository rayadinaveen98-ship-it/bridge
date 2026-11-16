# Bridge V2-04A — Disconnected Random Lifecycle Evidence

**Status:** V2-04A ENGINE IMPLEMENTED / ISOLATED CI VERIFIED; LIVE EXPIRY NOT ACTIVE. Post-merge CI evidence must be checked separately.  
**Approval:** Founder approved exactly V2-04A scoped in [V2-04 Implementation Brief](V2_04_IMPLEMENTATION_BRIEF.md) / docs PR #21.  
**Base:** `main@301336957761df168ca84b24306681f31926e3a8` after docs PR #21 merged.  
**Source ownership:** `apps/api/src/sessions/**` only; **NO existing route/service/policy/Flutter/SQL migration modification**.  
**Infrastructure:** No Neon calls, Render deployments, billing, application data cleanup, new paid service or retention activation. Existing R0 Android physical acceptance is OPEN. No V2-05 begun.

## Implemented modules and trust boundaries

- `src/sessions/clock.mjs`: no system/client-clock reliance; an explicitly supplied server clock and exact deadline predicates; an explicit **V2 policy marker and `legacy_qa === false`** are mandatory.
- `src/sessions/random_lifecycle.mjs`: pure current-room, Keep gating, new unique message clock and irreversible terminal outcome. Neither casts Keep votes nor creates mutual connections.
- `src/sessions/random_repository.mjs`: standalone injected PostgreSQL connection pool; all room operations take the matching advisory lock before row locks and call `SELECT clock_timestamp()` **after locks**. Activation, current access, Keep eligibility, new unique message acceptance, atomic End and expiry, and safety closure are modeled here. **No V1 service imports this module.**
- `tests/v2/sessions/clock.test.mjs`: deterministic micro-boundary and malformed-clock tests, including 29:59.999 vs exactly 30:00.
- `tests/v2/sessions/postgres.test.mjs`: loopback-only `bridge_test` database, tested with synthetic users, legacy 4-message fixture, V2 activated rooms and concurrent PostgreSQL locks; no network app process.
- Named test runners `test:v2:sessions` and `test:v2:sessions:db`. The latter requires the explicit disposable migration acknowledgment.
- Foundation CI adds a pure-clock step and a PostgreSQL-16 session step **after the existing V2-03 migration and backup/restore**. Existing API regressions remain.

## R04-01 through R04-24 acceptance matrix

| Test ID | New V2-04A evidence | Status before CI |
|---|---|---|
| R04-01 | Atomically insert V2-only random and match activation with identical server-owned clocks | Test written |
| R04-02 | 29:59.999 true, server expiry exact 30:00 false (pure); current-room recovery (SQL) | Test written |
| R04-03 | Expired LIVE/Keep/send denied without sweeper | Test written |
| R04-04 | Unique accepted message extends clock and sequence atomically | Test written |
| R04-05 | Duplicate accepted client ID no second body/outbox or reset | Test written |
| R04-06 | Different-body retry denies without clock mutation | Test written |
| R04-07 | Pure passive action set + SQL current/Keep does not reset | Test written |
| R04-08 | Same authorized current room ID on repeated recovery; actual Android app restore pending | Partial, physical gate OPEN |
| R04-09 | 35min expired state in pure; no SQL Resume; login renewal is later stage | Test written / auth integration OPEN |
| R04-10 | End atomically closes room/match and removes slots/queues | Test written |
| R04-11 | Idempotent repeated close, terminal reason cannot change | Test written |
| R04-12 | PostgreSQL advisory lock held beyond expiry; pre-deadline request denied after lock | Test written |
| R04-13 | Keep eligibility denies expired room; vote/connection race belongs V2-05 | Partial: V2-05 OPEN |
| R04-14 | Block prevents current read; safety-closed terminal reason stays final | Test written, cross-route race OPEN |
| R04-15 | Concurrent End/Expire closes once, frees slots | Test written |
| R04-16 | Ending match A cancels only match A queues; unrelated waiting remains | Test written |
| R04-17 | Two accounts, 4 message bodies, one open legacy room/two active slots hash unchanged | Test written |
| R04-18 | Missing V2 marker/time => DENY, not legacy auto-fallback | Test written |
| R04-19 | Outsider membership/guessed ID denied | Test written |
| R04-20 | Block and peer ineligibility deny reads; actual SSE/client reauth remains later | Partial: SSE OPEN |
| R04-21 | No sweeper exists or runs; deadline still enforced on every new V2 adapter operation | Test written |
| R04-22 | Four injected transactional failures roll back room/match/slots/queues | Test written |
| R04-23 | Full legacy API/PostgreSQL suite + V2-01–03 pass alongside new tests | PASS — PR/push CI |
| R04-24 | Only approved `src/sessions`, tests, runner, CI, doc; no live connection | PASS on reviewed PR diff; repeat before merge |

**These tests are for a disconnected adapter and disposable database, not for already-running HTTP endpoints.** Even a complete green R04 suite cannot satisfy the future V2-05 Keep transaction, the old V1 replay API cutover (V2-11), or R0 physical-device acceptance.

## Architecture details and caveats for next authorization

1. PostgreSQL `now()` is transaction-start; `clock_timestamp()` after advisory + row locks is used for accept/revoke decisions. Future integration must formally reason about a long pause **after message acceptance but before COMMIT**; acceptance timestamp and replay consistency must be explicit.
2. `MATCH_MUTEX_ID=714411` is shared with old matching/block logic. **Current V1 participants() locks room rows before some callers acquire other locks**. Live integration requires a cross-version lock-order review; this isolated module does not prove safety against every legacy caller.
3. The current authorization checks active, adult-marked, safety-eligible participants and bilateral blocks from the disposable DB. Production adult verification and policy gate integration remain future stages.
4. Original `bridge_messages.body NOT NULL` is unchanged; this module stores synthetic test-only text to exercise idempotency. Actual scoped payload encryption and no-history APIs belong later.
5. `legacy_qa` is never auto-backfilled. Unknown/non-V2 room markers deny in this adapter; V1 private QA continues on its separately isolated existing service until approved migration/cutover.
6. Expiry cleanup deletes **only match slots**, not private message bodies or original conversations. Queues are scoped by `match_session_id`, so unrelated matches are untouched.
7. A cleanup sweeper is not scheduled, called, deployed or exposed. The first implementation is **disconnected and inactive**.

## CI acceptance and rollback gate

- Pure session clock runner and disposable PG16 integration runner succeed at **exact committed PR head**.
- V2-01 contract / V2-02 policy / V2-03 migration and restore / existing V1 API regressions all remain green.
- Changed files are limited to `apps/api/src/sessions/**`, `apps/api/tests/v2/sessions/**`, `apps/api/package.json`, `.github/workflows/foundation.yml`, and this document.
- No release/deployment, Neon read or write, test-account changes, public access, real database migration, paid service or payments.
- On any failed check **do not merge**. Rollback before activation: revert the isolated PR. No live DB rollback needed.
- After green CI, report **V2-04A ENGINE IMPLEMENTED / DISPOSABLE CI VERIFIED / LIVE EXPIRY NOT ACTIVE** only.
- R0 physical Android acceptance remains OPEN; V2-16 full 138-case What If? review stays at end. No V2-05 work authorized.

## Verified build and test evidence — 2026-11-16

**Passing branch code head prior to this documentation update:** `52784f0c687a7cca5dfe8ccfe22210866fd75274`.

- [Pull-request CI run 43810644516](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43810644516) — **both matching and disposable postgres-integration jobs SUCCESS**.
- [Push CI run 43810638741](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43810638741) — **both jobs SUCCESS**.
- Matching job: 12 matching tests PASS; existing API 34 PASS/4 SKIP; V2-01 contract 20 PASS; V2-02 pure policy 68 PASS; **6 V2-04A deterministic-clock tests PASS**; design tokens validated.
- Disposable PostgreSQL job: 15 V2-03 migrations tests PASS; V2-03 PostgreSQL 16 dump/restore PASS; 38 existing API/PostgreSQL tests PASS; **V2-04A repository suite 12 child tests PASS**, with parent test also PASS (13 reported by Node test runner). The fixture confirms original two synthetic legacy actors, four message bodies, open conversation and two match slots remained unchanged.
- Transaction and security evidence includes a locked request that waited beyond deadline and was denied, four injected terminal-closure failures fully rolled back, idempotent duplicate message, match-specific slot/queue closure, and two competing End/Expire operations.
- **Two controlled CI fixes:** (1) explicit `::timestamptz` casts for SQL interval arithmetic; (2) run original API integration before the new synthetic outbox-generating test, preserving existing test assumptions. The first failing runs are not falsely reported as successes. No pre-existing production code was edited.
- **Known tests remaining for downstream stages:** Live SSE/HTTP enforcement, old history endpoint cutover, actual V2 Keep conversion, production adult verification, cross-version deadlock review, real Android process kill/resume and post-commit clock risk under live traffic. R0 remains OPEN.

**This document update changes the PR head.** Run/review CI for the exact final head and, if merged, verify main-branch CI separately before treating V2-04A as fully integrated source. No live Neon schema or Render deployment is permitted by this stage.
