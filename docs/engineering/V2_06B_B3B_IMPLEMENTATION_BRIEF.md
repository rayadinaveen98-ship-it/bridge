# Bridge V2-06B / B3b — Synthetic Signed-Identity Boundary Implementation Brief

**Status:** PROPOSED / FOUNDER APPROVAL REQUIRED FOR SOURCE. Documentation only as of 2026-11-16.  
**Reference:** verified `main@ba24e82fa8c4477dc3fab757a0df2f607191d50a`; [Foundation #43866135238](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43866135238) matching and PostgreSQL-integration both SUCCESS.  
**Predecessor:** B3a [implementation PR #41](https://github.com/rayadinaveen98-ship-it/bridge/pull/41), final [evidence PR #42](https://github.com/rayadinaveen98-ship-it/bridge/pull/42); exactly 25/25 pure contract tests, NOT wired to hosted V1.  
**Companion:** [B3b trust and race matrix](V2_06B_B3B_TRUST_RACE_MATRIX.md), [B3 integration brief](V2_06B_B3_INTEGRATION_BRIEF.md), [B3 security/release gates](V2_06B_B3_SECURITY_RELEASE_GATES.md), [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md).

## 1. Security goal and the architectural blocker

Bridge V1 already verifies an RS256-signed bearer token in `apps/api/src/auth.mjs::verifyBearer` with issuer, audience, `sub`, `iat`, `nbf` and `exp` checks. V1 PostgreSQL resolves `bridge_accounts.auth_subject` to an account ID. Existing B2a `acceptSynthetic({actorId,...})` and B2b `readCurrent/unreadInbox/acknowledge/recover({actorId,...})` are **test-only**, accept a synthetic caller-supplied actor UUID and open their own disposable PG16 transactions. These components are neither a real JWT-to-actor adapter nor safe live HTTP entry points.

**Key finding:** A facade that verifies JWT, performs `SELECT bridge_accounts WHERE auth_subject=$1`, commits, then invokes B2a/B2b in a *separate transaction* risks a time-of-check/time-of-use (TOCTOU) identity or account-status change. In addition, B2 participant eligibility reads do not by themselves guarantee that all external V1 account/policy writers participate in the same lock protocol. Simply putting `actorId` into a JavaScript object or checking age flags early is **not** enough to certify trusted V2 operations.

**Professional split, avoiding a premature security claim:**
- **B3b-1 (next candidate founder approval):** implement a **disconnected signed-subject-to-database actor resolver** with a transaction-scoped *internal callback contract*, synthetic JWTs and disposable PG16 adversarial tests. It proves that verification, immutable subject/account lookup, eligibility and the callback's test-only operation run under one transaction/advisory-lock boundary. It does NOT yet call B2a/B2b write/read APIs, modify their transactions, expose HTTP or claim live session safety.
- **B3b-2 (separate later approval, exact path list to be prepared after B3b-1 evidence):** integrate this trusted actor boundary **inside** B2a/B2b operations' own transaction, not in a prior committed preflight. Requires separate design for small refactors to the existing B2 repositories or a single shared transaction-scoped domain adapter, and coordinated account/Block/peer locking. Must retain the synthetic-only guard and all prior B2a/B2b tests. No automatic implementation or hosted activation.

This division avoids misrepresenting an independently verified JWT lookup as atomic B2 authorization. For engineering progress, B3b-1 is a complete measurable identity gate with a small 8-file scope, not an indefinite redesign.

## 2. EXACT proposed B3b-1 source change allowlist (8 paths)

| # | Path | Change and tight boundary |
|---|---|---|
| 1 | `apps/api/src/v2/private_subject_adapter.mjs` | **NEW:** isolated `createDisposableSubjectAdapter(pool,{authentication})`; explicit loopback `bridge_test` guard, actual database identity, reuse existing `verifyBearer`, server-side `auth_subject` lookup under `withV2ConnectionTx` mutex 714411 with `SELECT ... FOR UPDATE`; validate active/current `age_verified_at` and `safety_eligible`; invoke only internal test-owned transaction callback; uniformly deny missing/restricted identity. No imports by hosted code |
| 2 | `apps/api/tests/v2/identity/signed_subject.test.mjs` | **NEW:** real locally generated synthetic RSA keypair and signed JWTs, wrong/forged/expired/nbf/issuer/audience/algorithm/subject negatives, no client actor trust, no real QA secrets |
| 3 | `apps/api/tests/v2/identity/postgres_subject.test.mjs` | **NEW:** disposable PG16 fixtures and verified subject->single account mapping/eligibility, uniform denial, no message read, callback transaction rollback, original four-message QA snapshot |
| 4 | `apps/api/tests/v2/identity/race_subject.test.mjs` | **NEW:** advisory lock wait, account restriction/deletion/subject-change before callback, concurrent subject swap, transaction isolation/no stale-actor acceptance and no escaping account metadata to user outputs |
| 5 | `apps/api/tests/v2/identity/fixtures.mjs` | **NEW:** generate ephemeral 3072-bit RSA test key pair and synthetic JWT helper; unique `auth_subject`-bound disposable PG16 accounts, local URL guard, fixtures/checksum helpers |
| 6 | `apps/api/package.json` | **ADD ONLY:** `test:v2:identity` (pure token-negative tests) and `test:v2:identity:db` (disposable PG16 mapping and races). Keep all dependencies/scripts unchanged |
| 7 | `.github/workflows/foundation.yml` | **ADD ONLY:** matching-job pure signed-token negatives, plus postgres-integration disposable PG16 identity+race tests after B2b. Explicit `BRIDGE_TEST_MIGRATION_ACK=disposable-bridge_test-only`; no action/deploy permissions change |
| 8 | `docs/engineering/V2_06B_B3B_EVIDENCE.md` | **NEW:** exact source SHA, actual test counts, negative cases and CI evidence; known B3b-2/live blockers, no real secret/service claim |

**NO OTHER SOURCE MODIFICATIONS ALLOWED** under B3b-1. In particular, NO changes to `apps/api/src/{auth,http,postgres,start,live,outbox}.mjs`, `src/messaging/{private_repository,private_delivery_repository}.mjs`, old B2 tests, SQL 0001–0008, Android/Flutter, Render/Neon, GitHub secrets, production keys, account data, report/case evidence, history, retention, billing or public launch. If B3b-1 cannot meet the transaction security contract within these 8 paths, **STOP and return a scope-change proposal; do not quietly edit B2 modules**.

## 3. Detailed adapter contract (proposed, not implemented)

Candidate JavaScript shape:

```js
const synthetic = createDisposableSubjectAdapter(pool, {
  authentication: { publicKeyPem: syntheticPublicKeyPem, issuer, audience }
});
await synthetic.withVerifiedActor({
  authorization: "Bearer <synthetic signed JWT>",
  work: async (transactionClient, trusted) => {
    // Runs within the SAME locked transaction before commit.
    // trusted.actorId comes only from SELECT ... auth_subject=$1.
    // This is an internal test callback, NOT user-provided JavaScript.
    return { allowed: true }; // no decrypted user content in B3b-1.
  }
});
```

**Rules**:
- The caller cannot provide `actorId`, `serverAccountId`, `auth_subject`, age/safety flags, admin/premium role or token subject as a substitute. `authorization` is a synthetically signed JWT verified by the *existing* strict `verifyBearer`; never accept a JSON body or unsigned token as identity.
- Verify configured RSA public key, issuer and audience. Only synthetic keys exist in tests. Keep JWT/private key bytes out of SQL/logs/errors/test snapshots.
- Reject missing/invalid/expired/wrong issuer/audience/algorithm/nbf claims. If server authentication is misconfigured, fail closed with a redacted configuration error; never accept fallback subject or bypass signature checks.
- Require exact `BRIDGE_TEST_DATABASE_URL` URL pointing to `postgresql://bridge_test:<secret>@127.0.0.1:5432/bridge_test` or `localhost` equivalent and `BRIDGE_TEST_MIGRATION_ACK=disposable-bridge_test-only`; pool `options.connectionString` must equal that URL. Check inside the transaction `current_database() = 'bridge_test'`, `current_user = 'bridge_test'`, nonnull loopback server address and expected schema receipt before any identity queries.
- Acquire mutex 714411 once with `withV2ConnectionTx`, then SELECT the account by **exact verified auth_subject** `FOR UPDATE`. At most one row is guaranteed by existing unique schema, but unexpected multiple result must deny. Require `status='active'`, `age_verified_at IS NOT NULL`, `safety_eligible=true`, `deleted_at IS NULL`; no reliance on synthetic QA eligibility for public adult assurance. Validate canonical server account UUID shape. Never return full account/subject, only an immutable internal `actorId` capability to a trusted callback within the same transaction.
- **Timing/locking:** re-read after acquiring the global mutex; SELECT account row FOR UPDATE before invoking the test callback. If an account status/subject change committed while waiting, the new state must win. Account status/subject updates that conflict on the row must wait until operation commits; no lookup in a separate committed preflight. Incoming JWT signature expiry must be checked at admission and **rechecked against authoritative wall clock after lock wait**; otherwise a token could expire before callback.
- Internal callback error throws -> transaction rollback, no durable side effect. No additional SQL writes in B3b-1 beyond synthetic fixture setup; prohibited from adding message writes to `bridge_messages` or secure tables.
- **Identity binding:** signed `sub` MUST equal current DB `auth_subject` at time of locked lookup. A stale token cannot authorise a different account after subject changes; no fallback to supplied actor UUID. Account lock gives a meaningful *single-account* serializable boundary; not proof of both peers' eligibility or of full hosted V1/V2 revocation races.
- Uniform deny to callers for absent, restricted, mismatched or guessed subjects; a future public HTTP facade will own status/header mapping and cache rules. Do not return token claims, identity rows, SQL errors or secret bytes.
- The transport/UI does not supply arbitrary callback code: callbacks in B3b-1 are **test harness chosen**, not remote input. Production code must later restrict to a fixed server-owned operation map (separate B3b-2 and G1 review).

**Important review finding:** The current `verifyBearer` returns `expiresAt` from JWT `exp` and accepts injected `nowSeconds` for test use, and B2a/b each open their own transaction. A helper that only asserts `verifiedSubject` shape or wraps B2a/b with an outer transaction **is not sufficient**; B3b-1 must test lock wait past JWT expiry and B3b-2 must design truly atomic actor+scope enforcement.

## 4. Test setup, CI and synthetic data isolation

- Existing `.github/workflows/foundation.yml` job `postgres-integration` uses disposable PostgreSQL 16 and migration rehearsal/backup. Run B3b-1 after B2b with the SAME guarded loopback `bridge_test` service and synthetic accounts. Never query hosted Render/Neon or copy original real QA identifiers.
- Use `crypto.generateKeyPairSync('rsa',{modulusLength:3072,...})` or equivalent ephemeral test key generation; signs fresh synthetic JWTs with RS256. No real QA private signing material in Git, fixtures, logs or external providers.
- Synthetic auth_subject format e.g. `b3b-disposable:<uuid>`; tests assert a bearer with that exact verified subject resolves the expected account UUID only. Change/suspend/delete/revoke **in disposable DB only**.
- Maintain checksummed snapshot of the original four-message *synthetic disposable* legacy fixture and explicit no-change count/sequence/body digest. Do not treat this as verifying historical Neon data—the hosted original is deliberately never accessed.
- CI must publish actual Node TAP counts, zero failures, zero skips for the new named cases, and exact final PR head plus separate post-merge main Foundation check for matching and PostgreSQL integration.
- Negative tests must show that B3b-1 can be reverted without affecting the deployed V1 service, old migrations, device APK, B2 private reads/writes, or storage.

## 5. Acceptance gates for B3b-1 (require real evidence, not a count promise)

| Gate | Required proof |
|---|---|
| A-B3b-01 JWT signed RS256 only | Valid ephemeral test RSA signs and verifies; none/HS256/forged/wrong key denied |
| A-B3b-02 all claims | Wrong issuer/audience, missing/empty subject, nbf future, expired exp, future iat, long life denied |
| A-B3b-03 exact identity | Subject exactly equals locked DB `auth_subject`; two accounts cannot be swapped; no body actorId |
| A-B3b-04 current account | Suspended/restricted/deleted or missing age/safety eligibility denied uniformly |
| A-B3b-05 locked transaction | 714411 mutex + FOR UPDATE account lock; source/eligibility tested again after lock wait |
| A-B3b-06 JWT expiry after lock wait | Token exp checked again after lock wait; no action after expiry |
| A-B3b-07 transaction failure | Callback error rolls back; no outbox/message/session clock side effect |
| A-B3b-08 exact environment | Neon/Render/wrong database/URL/role, altered ACK, missing migration receipt fail closed |
| A-B3b-09 no response leak | No user-facing JWT claims, account rows, body/secret/key or guessed ID in errors |
| A-B3b-10 original records safe | Test-only legacy four-message snapshot unchanged; no source SQL and no hosted access |
| A-B3b-11 import fence | No new facade imports from hosted start/http/postgres/outbox/live, old B2 runtime paths or Flutter |
| A-B3b-12 regressions | 25/25 B3a pure cases, prior B1/B2 tests, migrations/PG16 restore and original CI jobs pass |
| A-B3b-13 exact PR SHA | Exactly 8 allowed files, final push+PR-head both CI jobs SUCCESS, then post-merge main CI |

**A-B3b labels are criteria, not the eventual Node test count.** No claim of pass until implementation, log inspection and CI verification.

## 6. B3b-2 atomic B2 integration dependency — not approved

B3b-2 must map a signed subject into a V2 operation **inside the same transaction** as authorization and the B2 write/read/ACK/recover state transition. Avoid nested `withV2ConnectionTx` calls, duplicate global advisory locks on separate connections, or preflight-to-B2 TOCTOU. To accomplish this safely, a separately approved exact PR may need B2a and B2b transaction internals factored into callable locked-context operations, plus account/peer locks and a server-owned operation dispatcher.

**Unresolved questions for that PR:** lock ordering with V1 block/unblock, account restriction and subject changes; transactions holding locks during crypto/decryption and potential latency; failure of key provider; token expiration during long waits; no V1 plaintext fallback; signed cursor/proof/recovery purpose keys across process restarts. Full V1/V2 network and Android safety remains G1/V2-10, not B3b-2.

No hosted API route or Neon migration, no Render key/role update, no client/APK and no real-user usage are authorised by either B3b planning or B3b-1 test certification.

## 7. Founder decision and no-drift boundaries

**Recommended next authorization:** Approve **B3b-1 implementation** exactly within the 8 paths above, using synthetic RSA JWTs and acknowledged disposable PostgreSQL 16 only. Implement, run named suites + existing CI, report exact evidence and merge only when both jobs green on final head, then verify main. Do **not** proceed to B3b-2 or any hosted change without a new explicit founder approval.

**R0:** Android phone/tablet physical acceptance still OPEN.  
**V2-16:** exhaustive **138-case What If?** remains LAST.  
**Commercial/ops:** No new subscriptions, KMS provider, payments, retention purges, hosted encryption or public release selected/approved.
