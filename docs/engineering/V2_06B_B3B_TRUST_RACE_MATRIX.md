# Bridge B3b — Identity, Transaction Race and Acceptance Matrix

**Status:** PROPOSED NEGATIVE TESTS — NOTHING IMPLEMENTED, TESTED OR DEPLOYED BY THIS DOCUMENT.  
**Source:** `main@ba24e82fa8c4477dc3fab757a0df2f607191d50a`.  
**Companion:** [exact B3b-1 eight-file implementation brief](V2_06B_B3B_IMPLEMENTATION_BRIEF.md), [B3 security release gates](V2_06B_B3_SECURITY_RELEASE_GATES.md), [B3a evidence](V2_06B_B3_EVIDENCE.md).

## A. Boundary/attacker model

| Threat actor or failure | Attempt and user harm | B3b-1 testable mitigation | Later live gate |
|---|---|---|---|
| Modified Android/HTTP caller | Submits another `actorId`, eligibility flag, premium or account UUID | Ignore/reject untrusted IDs; only signed JWT `sub` resolves DB-owned identity | B3b-2 operation dispatcher; G1 actual HTTP trust |
| Forged bearer/JWT | `alg=none/HS256`, wrong signature or issuer/audience/exp | Reuse `verifyBearer` with synthetic public key and strict signed claims | Real signer key custody/rotation |
| Stale but once-valid token | Account suspended/deleted or auth_subject changed after token minted | Re-read `bridge_accounts` under lock after JWT validation; deny | Actual token invalidation/revocation policy and account status handling |
| Token expires while waiting | User begins a call before exp, lock wait passes exp | Second JWT `exp` evaluation after lock wait and before callback | Network retry policy; exact last-valid-second semantics |
| Swapped subject accounts | Valid token for A tricked into using B account UUID | Unique `auth_subject` lookup; return only resolved UUID; no body override | Same transaction as B2 operation, account/peer locks |
| Unrelated V1 writer | Account restrictions or unblock update during V2 operation | A locked account row prevents conflicting account UPDATE until callback transaction ends; cannot certify every V1 path | B3b-2/G1 comprehensive writer lock-order and endpoint races |
| Cloud/private key loss | Missing or wrong JWT key | Fail closed without falling back to caller `actorId` | Production key selection and incident runbook |
| Database URL drift | Synthetic test points at real Neon/Render or wrong user | Reject constructor before connection, verify actual `current_database/current_user` after connect | Actual hosted least privilege separately inspected |
| Callback exception or crash | Half-completed identity operation, stale read or outbox | Roll back disposable transaction atomically; callback never receives connection outside lock | B3b-2 combined B2 encrypted message rollback |
| Logs and error oracle | Expose whether guessed account or token is valid | Uniform account unavailability and redacted logs; no JWT or DB rows in response | HTTP response mapping + telemetry review |
| Historical QA corruption | Synthetic fixture/real tester messages modified by identity tests | Read-only original 4-message disposable snapshot, never real Neon | Physical R0 and G1 non-destructive QA proof |

## B. Proposed B3b-1 negative tests (case IDs are not test/pass counts)

| Case | Setup / injected fault | Required result |
|---|---|---|
| ID03-01 | Ephemeral RSA 3072 key signs correct RS256 header and complete short-lived JWT | Existing verifier returns subject; adapter resolves exactly one active account |
| ID03-02 | No bearer, malformed Base64/JWT header, empty/invalid signature | Uniform denial before SQL and before callback |
| ID03-03 | Forged RSA signature, altered payload/header after sign | No DB action, no actor UUID returned |
| ID03-04 | `alg=none`, HMAC confusion `HS256`, critical header or wrong `typ` | Fail closed, never negotiate algorithm |
| ID03-05 | Wrong `iss`, wrong `aud`, missing/blank/long `sub` | Deny, no account oracle |
| ID03-06 | `exp` expired, `nbf` future, `iat` future or lifetime over one hour | Deny; no server callback invoked |
| ID03-07 | `exp` crosses while waiting on advisory mutex 714411 | Recheck exp after wait; deny without callback |
| ID03-08 | Signed subject A, caller JSON says `actorId=B` or `premium=true` | Caller fields unused or rejected; A is only resolvable account |
| ID03-09 | Signed subject A, DB subject maps to B after token signed | Deny if no current mapping; never infer prior A account |
| ID03-10 | Two synthetic accounts A/B, valid tokens for each | No cross-account UUID confusion or query-based principal swap |
| ID03-11 | `auth_subject` NULL/missing account, wrong case or whitespace | No fallback, uniform deny |
| ID03-12 | `status=restricted/suspended/deleted`, `deleted_at` present | Deny, regardless of signed token |
| ID03-13 | `age_verified_at` NULL or `safety_eligible=false` | Deny (lab fixture flag is *not* real adult assurance) |
| ID03-14 | Account restricted via committed update **while adapter waits** on 714411 | Adapter sees restricted state after lock and denies |
| ID03-15 | Account subject changed via committed UPDATE while adapter waits | Old token no longer maps; deny |
| ID03-16 | Concurrent UPDATE attempts after account `FOR UPDATE` held | UPDATE cannot commit until test callback completes; no stale accepted operation |
| ID03-17 | Callback throws after test-only write inside transaction | Entire disposable transaction rolled back; no leak/side effect |
| ID03-18 | Client attempts to pass callback/object that overrides trusted actor identity | Only test-owned callback receives immutable verified actor ID; no external callback API contract |
| ID03-19 | Missing `BRIDGE_TEST_MIGRATION_ACK`, hostname `.neon.tech`, wrong database/user, extra DSN parameters | Constructor rejects before opening pool connection |
| ID03-20 | Real connection points to unexpected `current_database/current_user` or 0008 receipt missing | Reject before identity query, no writes |
| ID03-21 | No subject, account, key details, token, JWT signature or private key in error/string/log | Generic redacted failure only |
| ID03-22 | Original 4-message *disposable* legacy QA fixture created by tests | Body/count/sequence SHA same before and after all tests |
| ID03-23 | Backend `http.mjs`, `postgres.mjs`, `start.mjs`, `live.mjs`, `outbox.mjs` import graph | None imports new B3b-1 adapter or test RSA key |
| ID03-24 | B1a/B1b/B2a/B2b + 25 B3a pure checks after B3b-1 changes | All existing named jobs remain green |
| ID03-25 | Exact 8-file PR/head audit | Final matching and disposable PG16 jobs green; postmerge main also verified |
| ID03-26 | Hostile replay across subject remap / same JWT to wrong account | No stale-actor reuse, no old room body or recipient unread |

**Specific additional race note:** A second `verifyBearer` exp evaluation must be demonstrably after advisory acquisition, not merely a duplicate call using stale `nowSeconds`. Tests should hold 714411 until the JWT expires and assert the internal callback never executes. This is a time-boundary requirement, not a claim that test-only code provides production token revocation.

## C. B3b-2 test dependencies before any server B2 integration (separate approval)

| Case | Future atomicity requirement |
|---|---|
| LINK03-01 | Single PostgreSQL transaction includes signed subject mapping and exact B2 send authorization; no nested transaction or independently committed preflight |
| LINK03-02 | Same transaction includes signed subject mapping and B2 current-room LIVE read |
| LINK03-03 | UNREAD list, ACK and recovery have exact sender/recipient and relationship scoped under trusted actor after revocation |
| LINK03-04 | Account updates, pair block, unmatch/End/Keep and source expiry lock ordering yields deterministic denial or ordered completion |
| LINK03-05 | Real old V1 block commits just before V2 lock release / account status changes immediately after preflight | 
| LINK03-06 | Old client V1 GET and POST /messages cannot read, write plaintext or produce replay hints for any V2 room ID |
| LINK03-07 | Live actor mapping and action commit share one current authority, not UI claims, expired JWT, route version or test flag |
| LINK03-08 | Server token invalidation, key rotation, RLS and audit fail closed under restart/network latency |

This next set **cannot be proven by B3b-1 alone** because B2a/b currently own separate `withV2ConnectionTx` transactions. Therefore no hosted V2 endpoint, producer, Android or client integration may be approved solely from B3b-1 CI.

## D. Evidence quality and release impact

- **Measurement standard:** GitHub CI actual TAP counts with exact final PR SHA; stop on any failed negative case, skipped test, changed file beyond eight allowlisted paths, accidental hosted DB access or preserved-fixture mismatch.
- **Source safety:** No edits to original V1, crypto/key provider, SQL migration, Flutter, QA Render/Neon, 0008 hosted schema/roles, secrets, billing, retention or permissions.
- **No premium/history shortcut:** Free has no previous-message timeline; mutual Keep remains free; unread hard max 7 days, first-ack recovery max 15 minutes. Future premium history is prospective, bilateral and separate.
- **No false authorization:** 0008 RLS disabled access to nonowner by default is NOT proof about actual Render runtime grants/owner. Synthetic lab `age_verified_at` is NOT adult verification for real users.
- **Physical gate:** R0 two-device acceptance still OPEN. **Full 138-case What If? remains LAST at V2-16.**
