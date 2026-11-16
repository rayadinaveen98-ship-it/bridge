# Bridge B3b-1 — Synthetic Signed-Identity Boundary Evidence

**Status:** SOURCE IMPLEMENTED ON ISOLATED BRANCH; CI NOT YET VERIFIED; NOT LIVE.  
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
