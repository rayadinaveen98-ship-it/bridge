# Bridge B3c-2R3B-1 — disconnected atomic authorization evidence ledger

**STATUS: OFFLINE 40/40 TAP GREEN ON IMPLEMENTATION SHA 4763e07c; 46-CASE ACCEPTANCE AUDITED, NOT FULLY CERTIFIED; DRAFT PR UNMERGED / NOT HOSTED / NOT PRODUCTION-SAFE.**  
Founder approved **exactly eight files** for synthetic identity and strictly disposable PostgreSQL 18 testing.  
Pinned baseline main: e3aa65517a5aae2c593170cf1d334b43599897f8.

## Exact eight paths
1. NEW apps/api/src/v2/security/disposable_atomic_guard.mjs
2. NEW apps/api/tests/v2/security/atomic_pg18_fixture.mjs
3. NEW apps/api/tests/v2/security/atomic_revocation.test.mjs
4. NEW apps/api/tests/v2/security/atomic_races.test.mjs
5. NEW apps/api/tests/v2/security/atomic_privileges.test.mjs
6. MOD apps/api/package.json (one additive test:v2:atomic-authz:pg18 runner)
7. NEW .github/workflows/bridge-atomic-authz-pg18.yml
8. NEW docs/engineering/V2_06B_B3C2R3B1_EVIDENCE.md

## Intent and security trust limitations

- Only PostgreSQL 18 disposable GitHub Actions container attested against exact loopback URI, DB identity, CI/ACK and independent Docker system ID **before any schema/role DDL**. Reuse real checked-in migrations 0001–0008 and synthetic RS256 test JWTs. No hosted Neon/Render/Android credentials, QA data or production encryption keys.
- The test runtime remains NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/NOINHERIT and has **EXECUTE-only** access to a synthetic, narrow command gateway; previous R2 sender-only RLS policies/table grants are REMOVED from this disposable experiment. Unauthorized direct SELECT, user history, evidence and key access must be denied.
- The separate non-superuser, non-BYPASSRLS **test command owner temporarily owns the three V2 secure tables AND six RLS-default-deny context tables**, so its SECURITY DEFINER function can perform narrowly checked operations while the runtime cannot. This *table-owner bypass* is an explicit dangerous prototype feature and **NOT a production role design**; no owner-rights function or synthetic HMAC from here is authorized for hosted reuse.
- The command proof binds synthetic JWT-derived actor, exact operation, target, client message ID or token digest, transaction ID, expiry and session_user using a synthetic ephemeral HMAC; no caller-provided arbitrary actor or policy flags. Role-session SQL alone cannot sign a new operation. The database rechecks both participants' eligibility, Block, relationship, room and envelope using a shared synthetic mutex 714411. Missing/expired claims default deny.
- Positive SEND, current LIVE, recipient UNREAD, first ACK and bounded recovery use **fake ciphertext-shaped bytes**: these are not real AES encryption or E2EE. Role privileges and the new transaction belong entirely to test code. Random session positive path, cross-worker provider keys, R0 physical QA, G1 firewall and real hosted revocation writers are **not certified** by this test.
- ALL synthetic writer tests cooperatively use the same mutex. The existing V1 HTTP Block/Keep/GET/POST/SSE writers do not; **HOLD_V2** until a separately approved and verified non-destructive cutover. A globally serialized mutex is only a conservative offline proof, not a scalability solution.

## Security 46-case matrix — classification

- R3B 01..09: negative identity/role, forged claim, no unrestricted SQL/key/account access, pooled-session/transaction cleanup checks where implemented. Token expiry after a delayed operation is explicitly a separate requirement; a green suite with no delayed-expiry test must not claim this case certified.
- R3B 10..19: direct LIVE access, two distinct valid members, no cross-relationship history and denial of account restrictions, Block both ways, participant departure, room/segment/connection closure. **Random-session positive and D1->D2 history are separate remaining checks.**
- R3B 20..29: synthetic SEND/LIVE/UNREAD, 7-day expiry, recipient-only first ACK and <=15m recovery and all adverse blocking cases. No production key provider; no genuine network/Android ACK.
- R3B 30..40: same-mutex synthetic Block/READ/WRITE races, partial-write rollback and negative branch; **legacy writers not using mutex remain known BLOCKER**, no claim of hosted race protection. Independent runtime role privilege audit.
- R3B 41..46: exact Docker attestation, checked-in migration ledger, new suite plus R3A known-unsafe negative control, all previous Foundation/PG16 and PG16/18 role/PG18 proof and PG18 red-team workflow results. Hosted and Android release gates explicitly remain OPEN.

## Verified implementation-head CI (2026-11-17)

- [B3c-2R3B-1 new restricted-role PG18 run #44006054843](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054843): **40/40 Node TAP PASS, 0 fail/skipped** at `4763e07c26c949e65a83033e76a162ddc9fd652f`. Includes a delayed ~26.5-second synthetic signed-proof expiry test, a peer restriction/ACK race, EXECUTE-grant revocation, D1 to D2 and subject revocation.
- [Foundation #44006054891](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054891): matching and disposable PG16 PostgreSQL integration both SUCCESS.
- [B3c-2R PG16/18 matrix #44006054854](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054854): both versions SUCCESS. [R2 actual 0008 PG18 #44006054902](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054902): SUCCESS. [R3A red-team #44006054853](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054853): SUCCESS; that red-team PASS means UNSAFE OLD prototype behavior was reproduced, NOT promoted.
- The 40/40 SHA precedes this documentation revision and replacement of the dummy hosted-case TAP with a diagnostic. **The final PR-head CI must be rerun and separately verified before any merge decision.**

## 46-case audit — final scope distinction (2026-11-17)

**This is an evidence review, not 46 passed tests.** `PROVEN` means demonstrated in the disposable proof or independently successful regression; `PARTIAL` means one required variant is missing; `OPEN` means the required standalone positive case is not implemented; `BLOCKED` requires a separately approved hosted/integration stage. Test identifiers R3B-01..46 are acceptance areas, not a claim of 46 distinct Node TAP tests.

| Matrix ID | State | Actual evidence / outstanding requirement |
|---|---|---|
| R3B-01 | PARTIAL | Malformed/tampered/unauthenticated JWT denied; expired/wrong-issuer/audience individually not proven here |
| R3B-02 | PROVEN | Caller actor, role, account selectors rejected; derived JWT actor only |
| R3B-03 | PARTIAL | Reassigned subject and deleted account denied; concurrent reassignment *during* preflight not proven |
| R3B-04 | PARTIAL | Bad MAC, actor context and time-bound proof denied; captured same-transaction signer compromise not simulated |
| R3B-05 | PROVEN | Independent runtime SET ROLE and schema DDL denied |
| R3B-06 | PROVEN | V1 plaintext message table/history direct read denied |
| R3B-07 | PROVEN | Case evidence and synthetic signing key direct read denied |
| R3B-08 | PROVEN | After COMMIT/ROLLBACK runtime session identity unchanged and no custom actor context leaked |
| R3B-09 | PARTIAL | Caller-controlled SQL/role/metadata keys denied; broad search_path/function audit remains |
| R3B-10 | OPEN | Positive active random-session LIVE path not implemented in this direct-only gateway |
| R3B-11 | PARTIAL | Direct-room current LIVE and cross-room deny proven; actual random-to-Keep transcript migration not simulated |
| R3B-12 | PROVEN | Closed D1 inaccessible, new D2 empty for both; no old direct transcript revival |
| R3B-13 | PROVEN | Suspended, deleted and reassigned actor account denied |
| R3B-14 | PARTIAL | Peer safety ineligible denies both; peer suspension/age individually not exercised |
| R3B-15 | PROVEN | Actor missing age or lost safety eligibility denied |
| R3B-16 | PROVEN | Either Block direction denies LIVE, UNREAD and SEND |
| R3B-17 | PROVEN | Participant departure, closed room and segment deny current LIVE |
| R3B-18 | PROVEN | Ended relationship denies LIVE/UNREAD/ACK |
| R3B-19 | PROVEN | Unknown or foreign room/envelope uniformly resource_unavailable |
| R3B-20 | PROVEN | Active synthetic SEND writes metadata, LIVE, UNREAD and advances sequence atomically |
| R3B-21 | PROVEN | Blocked synthetic SEND denies; sequence and stored rows unchanged |
| R3B-22 | PARTIAL | Direct-session 30-minute idle deny tested; random-session timer not exercised |
| R3B-23 | PROVEN | Caller cannot inject sender or out-of-relationship recipient |
| R3B-24 | PROVEN | Eligible direct recipient can read only current UNREAD with 7-day bound |
| R3B-25 | PARTIAL | Block, Keep-end, participant revocation tested; every status during ACK/recovery not exhaustively covered |
| R3B-26 | PROVEN | Revoked, expired, acknowledged and misbound unread accesses denied |
| R3B-27 | PROVEN | First ACK only, repeated ACK cannot reissue recovery token |
| R3B-28 | PROVEN | Recipient recovery valid inside 15-minute bound and envelope deadline |
| R3B-29 | PROVEN | Wrong recovery token/actor and >15-minute recovery denied |
| R3B-30 | PROVEN | Block writer wins 714411 mutex before SEND; no write commits |
| R3B-31 | PROVEN | SEND first; Block writer waits then commits; subsequent LIVE denied |
| R3B-32 | PROVEN | Peer account restriction before queued LIVE denies stale read |
| R3B-33 | PROVEN | Peer safety restriction before pending ACK denies; envelope remains unread |
| R3B-34 | PROVEN | Participant exit commits before queued LIVE, denies |
| R3B-35 | PROVEN | Keep relationship ends before recovery, denies despite valid token |
| R3B-36 | PARTIAL | Short signed DB transaction proof expires after deliberate 26.5s hold; actual JWT token expiry under same delay not proven |
| R3B-37 | PARTIAL | Failure after full synthetic artifact write before COMMIT rolls back; each intermediate phase/outbox not individually injected |
| R3B-38 | PARTIAL | Independent writer/runtime serialized in tested race order; multiclient stress/deadlock and bounded retries not certified |
| R3B-39 | BLOCKED | Hosted legacy V1 Block/Keep/GET/POST/SSE writers do NOT share mutex |
| R3B-40 | PROVEN | Revoking runtime gateway EXECUTE denies; no fallback to privileged owner |
| R3B-41 | PROVEN | Exact CI/ACK/localhost/PG18 Docker system ID attested before DDL |
| R3B-42 | PARTIAL | Original migrations, checksums/37 tables and only synthetic disposable records verified; hosted QA untouched but not independently migrated |
| R3B-43 | PROVEN | New corrected gateway denies; R3A known-unsafe SQL proof still separately reproduces historical gaps |
| R3B-44 | PROVEN | Prior PG16/18 roles, R2 actual 0008 PG18, R3A red-team and Foundation workflows succeeded |
| R3B-45 | PROVEN | Exactly eight-path diff, existing app HTTP/start/auth unmodified and no guard import |
| R3B-46 | BLOCKED | Hosted role/keys, G1 old-client firewall, R0 Android and final V2-16 need separate approval |

**Audit totals:** PROVEN 31; PARTIAL 12; OPEN 1; BLOCKED 2. R3B-39/46 are intentionally not counted as test passes. **Full 46-case acceptance remains OPEN.**

## Verification checklist (no premature pass claims)

- [x] Exact approved eight-path PR diff verified; no production HTTP/start/SQL migrations or Android source edited
- [x] CI-only Docker-cluster PG18 guard, checked-in 0001–0008 and 37 Bridge tables verified
- [x] Independent restricted runtime LOGIN, no direct secure table or legacy/history/key access verified
- [x] Test-only atomic command denies each R3A suspension/Block/leave/close case exercised by new suite; broader variants recorded PARTIAL
- [x] Positive synthetic direct-session LIVE/SEND/UNREAD/ACK/recovery verified (random-session positive remains OPEN)
- [x] Selected Block/account/participant/Keep races and full-command pre-COMMIT rollback verified (multi-client stress and intermediate-artifact injection PARTIAL)
- [x] Disposable test-only attestation, teardown and generated function/schema/role cleanup verified; no QA connection
- [ ] All five workflows GREEN on exact latest PR HEAD **pending** this evidence and anti-dummy-test revision; prior implementation SHA green
- [ ] Independently verify PR merge and any postmerge main CI when available
- [ ] Outstanding 46-case matrix gaps UNRESOLVED; **DO NOT CLAIM FULL CERTIFICATION**.

**STOP/GO:** Passing this test-only prototype is not production authorization or permission to merge a production role/policy. All hosted Neon, Render, Android, QA account, billing and key service changes require separate founder approval. V2 HOLD. R0 physical acceptance OPEN; final 138-case V2-16 LAST.

### Permission modeling caveat found in initial CI

- Synthetic nonowner command executor received SELECT on six existing RLS-default-deny context tables but still could not read them; PostgreSQL correctly hid rows under RLS. Initial authorized operation was denied (P0001). The disposable proof fixture now temporarily transfers **only the nine enumerated synthetic tables** to a separate non-superuser command owner, and restores ownership before its teardown. This guarantees read checks can inspect actual eligibility for this one-time test; it deliberately does **not** claim a least-privilege production policy.
- Production implementation requires a redesigned role/policy architecture with audited access to account/block context without table-owner bypass. Do NOT promote this test-only owner-rights gateway to Neon or Render. No hosted roles, grants, data or Android changed.
