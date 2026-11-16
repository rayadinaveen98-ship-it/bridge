# Bridge B3b-1 — Synthetic Signed-Identity Boundary Evidence

**Status:** B3b-1 IMPLEMENTED / 28 NODE TAP RESULTS PASS / FINAL PR CI VERIFIED / MERGED / POST-MERGE MAIN CI VERIFIED; NOT LIVE.  
**Approved:** founder's exact eight-file B3b-1 scope in [implementation brief](V2_06B_B3B_IMPLEMENTATION_BRIEF.md), 2026-11-16.  
**Baseline:** verified `main@4bdfa482cad1f6c61558c47e0a42e7c53b8bfc06`; [main Foundation #43869197431](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43869197431) matching and postgres-integration SUCCESS.  
**Reference:** [B3b trust/race matrix](V2_06B_B3B_TRUST_RACE_MATRIX.md), [B3a final evidence](V2_06B_B3_EVIDENCE.md).

## Exactly eight allowed paths

1. NEW `apps/api/src/v2/private_subject_adapter.mjs` — disconnected verified RS256 subject -> disposable account, row lock and callback within one PostgreSQL transaction; explicit DB identity/0008 ledger/ACK guard.
2. NEW `apps/api/tests/v2/identity/signed_subject.test.mjs` — pure synthetic 3072-bit RSA signed JWT and negative claims, malformed/forged/weak RSA and hosted import fence.
3. NEW `apps/api/tests/v2/identity/postgres_subject.test.mjs` — disposable PG16 verified subject/account eligibility, account switch, callback rollback and legacy QA snapshot.
4. NEW `apps/api/tests/v2/identity/race_subject.test.mjs` — global advisory 714411 and account FOR UPDATE races, stale subject, hard JWT expiry after lock wait.
5. NEW `apps/api/tests/v2/identity/fixtures.mjs` — ephemeral private/public RSA keys, synthetic JWT signer, local-only account utilities.
6. `apps/api/package.json` — add `test:v2:identity` and `test:v2:identity:db` only.
7. `.github/workflows/foundation.yml` — matching-only pure signed token test step, postgres-integration after B2b for named PG16 tests, ACK explicitly set.
8. NEW `docs/engineering/V2_06B_B3B_EVIDENCE.md` — this evidence and gate register.

**No existing source/SQL edits:** `apps/api/src/{auth,http,postgres,start,live,outbox}.mjs`, existing B1/B2 source+test files, original migrations 0001–0008, Flutter/Android, Neon/Render, existing synthetic QA records, security/retention/history, billing, keys, deployments and public signup remain unchanged.

## What this source ACTUALLY does (synthetic only)

- `withVerifiedActor({authorization,work})` receives **only** a signed Bearer token and a developer/test-owned internal callback. Arbitrary `actorId`, account, role, policy or premium claims supplied in the call are rejected. The callback is a trusted test fixture, **NOT a remote/user-provided operation**.
- Reuses existing `verifyBearer` RS256 strict verifier twice: once at admission and once using authoritative PostgreSQL `clock_timestamp()` sampled **after** acquiring the 714411 mutex and the account `FOR UPDATE` lock. Excludes caller-injected `nowSeconds`. Wrong signing key/issuer/audience/exp/nbf/iat/future/expired claims fail closed.
- Requires exact acknowledged `BRIDGE_TEST_DATABASE_URL` loopback `bridge_test` DSN, pool match, actual `current_database()/current_user`, network DB server address and 0008 migration receipt, before reading identity rows. No hosted DB connection is permitted.
- Selects exactly one `bridge_accounts` row by signed `auth_subject`, locks it, requires active/not deleted/age flag/safety eligibility. In B3b-1 synthetic tests alone, subject `b3b-disposable:<uuid>` is **additionally bound** to the same account UUID to defeat reassignment attacks. This is **not** the proposed public identity syntax; future production binding and subject immutability need separate approval.
- Test-owned callback sees an immutable `{actorId}` only, operates on the same transaction connection and returns before commit. Callback failure rolls back test fixture side effects and returns a uniform resource-unavailable error. No message/UNREAD B2 operations are called, no actual hosted token is accepted and no JWT/private key/account row goes into user-facing errors.
- Original B2a/B2b modules still accept synthetic `actorId` and open their *own* transactions; a verified token from B3b-1 is NOT an atomic authorization for them. A separate B3b-2 source review must design single-transaction subject+actor+peer+message authorization; no nested transactions, no "JWT precheck then B2" claim.

## Test intent (pending real CI logs)

| Gate | Requirement |
|---|---|
| ID03-01..07 | Ephemeral 3072 RSA, correct RS256, malformed/tampered/wrong algorithm/signer/claim and expired token after lock wait |
| ID03-08..13 | Only signed matching subject/DB-owned account, no caller actor/role, restricted/deleted/age/safety fail closed |
| ID03-14..16 | Committed restriction, subject swap and row-lock conflict correctly ordered under advisory 714411 |
| ID03-17..20 | Callback exception rollback; cloud/malformed DSN and unexpected actual DB principal/0008 ledger denied before account lookup |
| ID03-21..26 | No secrets, tokens or SQL in denial; synthetic four-message fixture unchanged; hosted import fences, original matching+B1/B2 regression; same-subject reassignment cannot alias another synthetic UUID |

**No TAP counts or PASS claim here yet.** After PR-head CI completes, inspect exact named Node results with 0 FAIL/SKIP, both Foundation jobs and approved eight paths. Evidence edits require rerun on final SHA and independent main CI after merge.

## Critical unverified live security gates

- No hosted `/v2/*` routes, actual Render runtime principal/RLS/role audit, real database migration 0008, production KEK/HMAC/secrets, signed public token provider, device APK or age-proof implementation. Test-only `age_verified_at` is **not real adult assurance**.
- B3a proposed V1 GET/POST/SSE/bootstrap/peer/Keep/connections safe-deny is **not wired**; actual old-client plaintext route cutover is still G1/V2-11. R0 phone/tablet device acceptance **OPEN**; full V1/B2 account/Block writer concurrency remains unproven.
- Free user never receives prior-session transcript; mutual Keep free; 30m from unique accepted message; recipient unread <=7d, ACK first+15m recovery. B3b-1 must not mutate any of these.
- No commercial/KMS spending or hosted retention/delete permissions granted. Future B3b-2 requires separate founder approval; final **138-case What If? remains LAST at V2-16**.

**Rollback:** revert exactly the B3b-1 isolated eight-file PR and discard disposable synthetic PG16 rows. Real Render/Neon/Android data remain untouched.


## 2026-11-16 actual B3b-1 code-head CI and findings

- **Tested code head:** `0d28aace196f5024eb4799ef564e7222a5460e25`, [draft implementation PR #44](https://github.com/rayadinaveen98-ship-it/bridge/pull/44), changed files **exactly eight** (the approved allowlist above).
- **First complete Foundation push #43871038402:** [workflow link](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43871038402). **matching SUCCESS, postgres-integration SUCCESS.** The PR event run #43871132431 was still executing at the first evidence inspection; final PR-head verification is a separate merge gate.
- **Actual named Node TAP results (disposable/synthetic only):** `test:v2:identity` (pure JWT tests) **10/10 PASS, 0 FAILED, 0 SKIPPED**. `test:v2:identity:db` executes `postgres_subject.test.mjs` **10/10 PASS** (9 child cases + 1 parent suite) followed by `race_subject.test.mjs` **8/8 PASS** (7 child cases + 1 parent suite). All 18 PostgreSQL TAP results **0 FAILED, 0 SKIPPED**. Total **28 passing TAP results / 26 distinct test cases**. Earlier matching, B3a 25 pure checks and B1/B2 PostgreSQL regressions ran inside the unchanged Foundation jobs.
- **Specific verified negative outcomes:** forged/malformed/HS256/none/expired/early/wrong-signer/audience/issuer JWT denied; exact signed synthetic `sub` to DB `auth_subject` mapping; untrusted actor/role/premium fields rejected; restricted/suspended/deleted/age/safety-ineligible account denied; same-transaction callback throws and rolls back; actual DB principal and 0008 receipt guards deny; account restriction and subject change committed while waiting for 714411 mutex win; account row FOR UPDATE blocks concurrent status UPDATE; stale synthetic token cannot alias B after A's subject reassignment; JWT `exp` crossed while lock held denies before callback; original disposable four-message legacy QA checksum unchanged; no hosted route imports or secret/SQL subject disclosures.
- **Synthetic-specific caveat:** The test-only identity format requires `b3b-disposable:<accountUUID>` matching the locked account UUID, preventing reassignment in test fixtures. **This is NOT a proposed general production subject format**; production will need issuer-controlled immutable binding, lifecycle/rotation and stable account-subject identity design before B3b-2/G1.
- **Atomicity caveat remains CRITICAL:** B3b-1 runs only a test-owned internal callback in the same locked transaction. Existing B2a/B2b encrypted write/read, unread, ACK and recovery modules still open their **own** independent transactions with synthetic `actorId`. Do NOT compose a prior B3b-1 preflight with a separate B2a/b call and claim authorization linearizability. B3b-2 exact new scope and founder approval remain necessary.
- **All hosted gates still OPEN:** actual V1 old-client read/write firewall (B3a is pure/disconnected), actual Render runtime PostgreSQL principal/RLS, key custody, real adult/policy assurance, full Block/unblock/account writer races, Android V2-10, G1/V2-11 private cutover, R0 two-device physical acceptance and final V2-16 138-case What If?. No Neon/Render/Flutter or original four-message hosted QA operation was run.

**Evidence update changes Git head:** rerun final PR/push matching and postgres-integration and inspect eight-file scope at that new SHA before merge. Only then verify independently on merged main.


## B3b-1 exact final implementation and main certification — 2026-11-16

- **Implementation [PR #44](https://github.com/rayadinaveen98-ship-it/bridge/pull/44):** exactly the eight approved paths, final head `03471efbf852189aca8564cefbaa4ae2dcaf5efe`. [Final PR CI #43871374512](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43871374512) and [final branch push CI #43871366645](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43871366645): BOTH matching **SUCCESS** and postgres-integration **SUCCESS**.
- **Merged implementation main:** `59b341a9c3a4250f5464b74a07c9ba893dd47cb7`. [Exact post-merge main Foundation #43871602728](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43871602728): matching **SUCCESS**, postgres-integration **SUCCESS**.
- **Actual new named test results:** pure `signed_subject.test.mjs` **10/10 PASS**; disposable PostgreSQL `postgres_subject.test.mjs` **10/10 PASS** (9 nested + 1 wrapper); `race_subject.test.mjs` **8/8 PASS** (7 nested + 1 wrapper). **28/28 Node TAP results, 26 nested/independent test cases, zero failures/skips**. Full existing V1, B1a/B1b, B2a/B2b, B3a, migration rehearsal and PG16 backup/restore ran in original CI jobs and remained green. The named B3a pure suite previously proved 25/25 and is preserved.
- **Negative evidence:** real ephemeral 3072-bit RSA RS256 JWT signature, issuer/audience/claims and token expiry checks; DB-locked `auth_subject` -> synthetic UUID mapping; fake actor/role/paid spoof rejection; restricted/age/safety/deleted account denial; verified actual database principal + 0008 receipt; one callback transaction rollback; fresh expiry recheck AFTER a 714411 wait; row FOR UPDATE blocks conflicting account status mutation; concurrent status/subject change wins; subject transfer A->B denied under the B3b-1 synthetic `b3b-disposable:<UUID>` invariant; redacted uniform denial; original four-message **synthetic local fixture** SHA unchanged; no hosted imports.
- **Scope confirmed:** only `private_subject_adapter.mjs`, four new identity tests/fixture, additive named package scripts, additive two Foundation steps, and `V2_06B_B3B_EVIDENCE.md`. Absolutely no modifications to existing auth/V1 HTTP/PG/start/live/outbox, B1/B2 engines, SQL 0001–0008, Android, Neon/Render schema/data/roles, real encryption/JWT keys, report/evidence, history, retention or billing.
- **Major unresolved security gates:** B3b-1 does **NOT** invoke B2a/b in the same transaction; trusted identity cannot yet authorize actual encrypted write/read/unread/ACK/recovery. **B3b-2 remains a separate founder scope decision**, including possible B2 refactor and joint account/peer locks. B3a V1 read/write and SSE firewall is still pure/disconnected, production keys and runtime RLS unverified; no public identity/age assurance, Android R0 device acceptance OPEN, G1/V2-11 cutover gated. Test-only synthetic UUID subject format is NOT a general external provider binding policy. No E2EE or live user security certification claimed.
- **Final document-only certification:** this follow-up changes only this existing B3b-1 evidence file, records previously verified PR and post-merge main facts, and does not start B3b-2 or any hosted action. The follow-up's own final head and main CI must also pass before documentation is closed.

**R0 physical device acceptance remains OPEN. Complete 138-case What If? remains FINAL at V2-16.**
