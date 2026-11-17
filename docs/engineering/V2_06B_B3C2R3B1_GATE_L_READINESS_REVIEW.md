# Bridge B3c-2R3B-1 — Gate L PR #61 merge-readiness review

**Status: REVIEW COMPLETE / CONDITIONAL GO FOR ISOLATED LAB REPOSITORY MERGE / PR #61 MERGE NOT APPROVED.**
**Date:** 2026-11-17
**Audit targets:** [approved Gate L/H decision](V2_06B_B3C2R3B1_GATE_SPLIT_DECISION.md) on `main@50b9223b679b37f59a513530c5b844616b28ec9f`; [draft PR #61](https://github.com/rayadinaveen98-ship-it/bridge/pull/61) at exact `5692082a2444eaa1b0373df5a2b67e4d91c5789a`.
**Decision authority:** Founder must give a fresh, explicit PR #61-specific authorization before readiness transition, merge or deployment. A generic "continue"/"go ahead" authorized only this review.

## Executive disposition

**RECOMMEND CONDITIONAL GATE L GO** for a *code-repository-only inclusion of synthetic security tests*, NOT for activation of the V2 application, hosted role or encrypted messaging. All applicable offline Gate L verification items below were checked using PR #61's exact head; no changes to its code, branch, CI configuration or eight-file allowlist were made. The PR remains **DRAFT and UNMERGED**. Even after an explicit approval, recheck PR head/base, diff and CI, and refuse to merge if anything changed.

**GATE H: ABSOLUTE HOLD.** The laboratory command owner temporarily owns 12 synthetic DB tables and uses a privileged test-only `SECURITY DEFINER` function and synthetic HMAC. This cannot be copied into a hosted migration, app route or Neon/Render role. The previously diagnosed hosted owner/BYPASSRLS principal remains an unresolved release blocker; no new hosted inspection or data modification is authorized by this review.

## 1. Exact diff and source inventory

| Required boundary | Evidence | Result |
|---|---|---|
| Exact approved eight-file scope | [PR #61 diff](https://github.com/rayadinaveen98-ship-it/bridge/pull/61/files) and all paginated changed filenames | PASS |
| New internal synthetic adapter only | `apps/api/src/v2/security/disposable_atomic_guard.mjs`; does not alter existing routes | PASS |
| Four security test components | `atomic_pg18_fixture.mjs`, `atomic_revocation.test.mjs`, `atomic_privileges.test.mjs`, `atomic_races.test.mjs` | PASS |
| Named offline runner | One additive `test:v2:atomic-authz:pg18` command in `apps/api/package.json` | PASS |
| Independent PG18 workflow | `.github/workflows/bridge-atomic-authz-pg18.yml` uses postgres:18 and literal disposable localhost credentials | PASS |
| Traceable evidence | `docs/engineering/V2_06B_B3C2R3B1_EVIDENCE.md` classifies 46 areas and includes CI | PASS |
| No changed existing migration, Android, HTTP, live outbox or hosted configuration | Checked PR diff and changed-file list | PASS |
| Base is behind latest main | PR #61 initially based on `e3aa655`, main advanced to `50b9223` in a documentation-only PR #62 | NOTE: GitHub currently reports mergeable; re-evaluate on final merge attempt |

**Source import fence review:** Enumerated the complete PR-head Git tree (not truncated), then examined **all 33 other `apps/api/src/**/*.mjs` files**, including `start.mjs`, `http.mjs`, `postgres.mjs`, `auth.mjs`, `live.mjs`, direct/random sessions, outbox, V2 facade and runtime probes. No references to `disposable_atomic_guard.mjs`, `createDisposableAtomicGuard` or the new test fixture from those existing source files. Also reviewed the six other workflow files: none invokes the new atomic-authz command. New guard is imported by the new tests only. This is a **static import/reference review**, not a formal proof against future dynamic imports.

**Deployment-trigger review:** `cloud-qa-android.yml` and `android-internal.yml` auto-trigger on changes under `apps/mobile/**` (or their own workflow paths), not the eight PR #61 files. `foundation.yml` and the new synthetic PG18 workflow can run on code merge; they are test jobs, not hosted V2 activation. Render `bridge-private-qa` currently has `autoDeploy="no"`. No deployment triggered or authorized.

## 2. Exact PR-head CI provenance

**All five workflow families succeeded at exact head `5692082a2444eaa1b0373df5a2b67e4d91c5789a`:**

| Workflow | GitHub Actions run | Verified jobs |
|---|---|---|
| B3c-2R3B-1 attested disposable PG18 atomic authorization | [#44014878831](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44014878831) | 53/53 Node TAP PASS; 0 fail, 0 skipped, 0 cancelled |
| B3c-2R PG16/PG18 runtime role isolation | [#44014878835](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44014878835) | PG16 and PG18 SUCCESS |
| Actual checked-in 0008 PG18 signed-role proof | [#44014878839](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44014878839) | SUCCESS |
| B3c-2R3A red-team proof of unsafe predecessor policies | [#44014878954](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44014878954) | SUCCESS: proves OLD policy gap, not safety |
| Foundation checks | [#44014879020](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44014879020) | matching and synthetic PostgreSQL 16 SUCCESS |

Inspected the actual new PG18 job log: 53 PASS, zero failures/skips, and no literal private-key material or hosted Neon connection string found. Passing negative-control tests is not evidence of an already-remediated production vulnerability.

## 3. Isolation, permission and cleanup assessment

- The new guard requires exact disposable `CI`, `GITHUB_ACTIONS`, ACKs, PG18 version marker, and literal `127.0.0.1:5432/bridge_privproof` URI before checkout. The predecessor fixture independently checks PostgreSQL18 cluster identity against the Docker service using `pg_control_system()`, an independent `docker exec` query, and exact database/login. These are **test safeguards**, not a security model for live runtime.
- Real, checked-in `0001..0008` schema is applied inside the disposable cluster. The independent test runtime LOGIN is neither superuser nor owner, has `NOBYPASSRLS` and no broad secure-table SELECT, while the separate **test command owner holds owner privileges on 12 enumerated tables** during the experiment. This bypass is **dangerous outside disposable CI**.
- New PG18 tests cover signed synthetic actor, current account/peer/Block/participant and match eligibility, random idle timeout, current LIVE, direct UNREAD, first ACK and bounded recovery, concurrent writes, rollback through outbox, and expired claims. Ciphertext shapes are **not real encryption**; no production KEKs, provider signing or E2EE are demonstrated.
- Cleanup logic restores temporary ownership and drops generated roles/function/key schema in the normal passing path; the test job uses an ephemeral PostgreSQL service. **Caveat:** if fixture setup fails partway through ownership transfer (before its `transferred=true` marker), teardown may not restore every transfer; the disposable cluster is destroyed after CI, but failure-path cleanup is not comprehensively proven. This is a **minor test-harness hardening follow-up**, not permission to reuse the fixture on persistent databases.
- The guard sits inside the ordinary `apps/api/src/v2/security` tree and its environment/ACK checks are operator-settable. A future source import into production would be a meaningful risk. Keep the **test-only import fence** in every follow-up PR; consider a separately approved future test-directory relocation or compile-time production ban without expanding PR #61's eight-file allowlist silently.
- Synthetic table-owner `SECURITY DEFINER` does NOT satisfy Gate H least privilege. A production account↔actor claim, DB function authorization, key custody, race protocol and legacy writer cutover must be redesigned independently.

## 4. PR description correction completed during review

The draft PR's opening description previously said the disposable command owner owned only the three 0008 secure tables. The reviewed fixture actually transfers ownership of **three secure tables plus nine context/outbox/match tables = 12**. Updated the PR #61 **body only** to the accurate count, the 53/53 evidence and the Gate L/Gate H approval boundary. Verified its code head `5692082a`, eight-file diff, `draft=true`, and `merged=false` did NOT change. No source, test or workflow was modified in this review.

## 5. 46 acceptance areas — no false certification

**42 PROVEN within synthetic test model / 2 PARTIAL / 2 BLOCKED / 0 OPEN.** This is a 46-*area* audit, not 46 separate successful unit tests.

| ID | Status | Assigned next acceptance owner |
|---|---|---|
| R3B-38 | PARTIAL | Production throughput envelope, controlled deadlock injection, tail latency and bounded retry/no-fail-open policy; separate performance/security design |
| R3B-42 | PARTIAL | Non-destructive live-Neon migration/rollback, preservation of original QA records, read-only baseline and after-proof; independent hosted data gate |
| R3B-39 | BLOCKED | Compatibility firewall and compatible writes for legacy V1 Block/Keep/account/participant/GET/POST/SSE; G1/V2-11 and new production transactional design |
| R3B-46 | BLOCKED | Production nonowner actor-to-DB authz, durable KEKs, encryption, moderation/retention, Android integration, R0 physical certification, V2-16 final 138-case What If? |

**No impact to existing V1 QA is inferred from a PostgreSQL18 disposable test.** Hosted QA service was read-only checked by the connector: `bridge-private-qa` live on pre-existing commit `ad01d815ef1cd407ba50cb0b15df68412abf6b8e`, autoDeploy `no`. No Neon read or hosted migration was performed as part of this review.

## 6. Release safety and next approved action

**Gate L technical recommendation:** `CONDITIONAL_GO_FOR_OFFLINE_REPOSITORY_MERGE_REVIEW`. Exact eight paths, source import fence and five CI families passed. This classification does not mean the code can be run with real users or that all 46 business/security requirements pass.

**Gate L founder authority:** `PR61_MERGE_APPROVAL=NO`. Do not mark ready, merge, squash, rebase, alter its source, use production keys, or deploy. A separately issued, explicit **PR #61-specific merge authorization** is mandatory. Before any such merge: recheck exact PR SHA and base/mergeability, file allowlist, fresh CI statuses, no new source imports, synthetic credential restrictions and Render autoDeploy. If any drift is detected, STOP for review.

**Gate H:** `HOLD_V2`. No Neon schema/role/grant/data changes, Render env/deploy, Android APK, billing, real key service, or retention activation. R0 physical acceptance OPEN; V2-16 What If? LAST.

**Recommended next founder decision (not taken by this review):** authorize a **repository-only, test-only merge of PR #61 under Gate L** with explicit acceptance that R3B-38/42/39/46 remain deferred **without approving their production behavior**. If founder declines this exception, maintain the draft and return to the separately scoped hosted architecture.
