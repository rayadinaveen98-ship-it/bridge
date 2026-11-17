# Bridge B3c-2R3B-1 — disconnected atomic authorization evidence ledger

**STATUS: OFFLINE 50/50 TAP PASS AND FIVE CI FAMILIES GREEN AT `57299958620813b6f43fa9bfe970abdea1cc9358`; 46-CASE MATRIX 41 PROVEN / 3 PARTIAL / 0 OPEN / 2 BLOCKED; PR #61 DRAFT/UNMERGED; V2 HOSTED HOLD.**  
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
- The separate non-superuser, non-BYPASSRLS **test command owner temporarily owns the three V2 secure tables AND seven RLS-default-deny context/outbox tables**, so its SECURITY DEFINER function can perform narrowly checked operations while the runtime cannot. This *table-owner bypass* is an explicit dangerous prototype feature and **NOT a production role design**; no owner-rights function or synthetic HMAC from here is authorized for hosted reuse.
- The command proof binds synthetic JWT-derived actor, exact operation, target, client message ID or token digest, transaction ID, expiry and session_user using a synthetic ephemeral HMAC; no caller-provided arbitrary actor or policy flags. Role-session SQL alone cannot sign a new operation. The database rechecks both participants' eligibility, Block, relationship, room and envelope using a shared synthetic mutex 714411. Missing/expired claims default deny.
- Positive SEND, current LIVE, recipient UNREAD, first ACK and bounded recovery use **fake ciphertext-shaped bytes**: these are not real AES encryption or E2EE. Role privileges and the new transaction belong entirely to test code. Random-session current-only and 30-minute expiry proved synthetically; cross-worker provider keys, R0 physical QA, G1 firewall and real hosted revocation writers are **not certified** by this test.
- ALL synthetic writer tests cooperatively use the same mutex. The existing V1 HTTP Block/Keep/GET/POST/SSE writers do not; **HOLD_V2** until a separately approved and verified non-destructive cutover. A globally serialized mutex is only a conservative offline proof, not a scalability solution; two separately logged-in runtime clients have now been exercised.

## Security 46-case matrix — classification

- R3B 01..09: negative identity/role, forged claim, no unrestricted SQL/key/account access, pooled-session/transaction cleanup checks where implemented. Expired/invalid JWT and >26-second synthetic proof expiry are now verified; production enforcement remains separately gated.
- R3B 10..19: direct LIVE access, two distinct valid members, no cross-relationship history and denial of account restrictions, Block both ways, participant departure, room/segment/connection closure. Synthetic current random-session behavior, former random-to-Keep transcript separation and D1-to-D2 isolation have been verified.
- R3B 20..29: synthetic SEND/LIVE/UNREAD, 7-day expiry, recipient-only first ACK and <=15m recovery and all adverse blocking cases. No production key provider; no genuine network/Android ACK.
- R3B 30..40: same-mutex synthetic Block/READ/WRITE races, partial-write rollback and negative branch; **legacy writers not using mutex remain known BLOCKER**, no claim of hosted race protection. Independent runtime role privilege audit.
- R3B 41..46: exact Docker attestation, checked-in migration ledger, new suite plus R3A known-unsafe negative control, all previous Foundation/PG16 and PG16/18 role/PG18 proof and PG18 red-team workflow results. Hosted and Android release gates explicitly remain OPEN.

## Verified implementation-head CI (2026-11-17)

- [B3c-2R3B-1 new restricted-role PG18 run #44006054843](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054843): **40/40 Node TAP PASS, 0 fail/skipped** at `4763e07c26c949e65a83033e76a162ddc9fd652f`. Includes a delayed ~26.5-second synthetic signed-proof expiry test, a peer restriction/ACK race, EXECUTE-grant revocation, D1 to D2 and subject revocation.
- [Foundation #44006054891](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054891): matching and disposable PG16 PostgreSQL integration both SUCCESS.
- [B3c-2R PG16/18 matrix #44006054854](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054854): both versions SUCCESS. [R2 actual 0008 PG18 #44006054902](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054902): SUCCESS. [R3A red-team #44006054853](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006054853): SUCCESS; that red-team PASS means UNSAFE OLD prototype behavior was reproduced, NOT promoted.
- The 40/40 SHA precedes this documentation revision and replacement of the dummy hosted-case TAP with a diagnostic. **The final PR-head CI must be rerun and separately verified before any merge decision.**

## Final audited PR-head verification (before this documentation update)

- **B3c-2R3B-1 actual nonowner PG18:** [run #44006373255](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006373255), **39/39 TAP PASS**, 0 fails/skips. Removal of the fake R3B-39/46 hosted-case PASS deliberately reduced the test count from 40 to 39 without weakening any tested security checks. The R3B-36 deliberate short authorization-proof expiry test passes after >26-second hold; it does not establish expired-JWT enforcement across every production client path.
- **B3c-2R PostgreSQL 16/18 role matrix:** [run #44006373237](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006373237), both independent jobs SUCCESS.
- **B3c-2R2 actual 0008 PostgreSQL 18:** [run #44006373270](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006373270), SUCCESS.
- **B3c-2R3A intentionally unsafe prototype red-team:** [run #44006373215](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006373215), SUCCESS. This is a RED-TEAM GAP CONTROL and does not imply a valid policy.
- **Foundation matching + disposable PostgreSQL 16 regressions:** [run #44006373269](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44006373269), both SUCCESS.
- Code and audit head tested: `60f82c942684c1eeb4d00b66e11fb730dd1fdb5e`. This recording is a new documentation-only commit; its exact HEAD CI must be rechecked separately. **Do not merge PR #61 yet.** Remaining 12 PARTIAL, 1 OPEN and 2 BLOCKED acceptance areas need individually justified closure or a founder-approved change in the acceptance scope.

## Continued in-scope security closure evidence (2026-11-17)

**Tested implementation SHA:** `57299958620813b6f43fa9bfe970abdea1cc9358`, draft PR #61. The evidence update is documentation-only and must also pass exact-HEAD CI.

- **[New B3c-2R3B-1 PG18 CI #44010667863](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44010667863): 50/50 Node TAP passing, 0 skipped/failures**, attested disposable PostgreSQL 18 with all original `0001..0008` migrations. Runtime has no unrestricted private-table grants. Tests cover synthetic random session 30m expiry, former random-to-Keep and D1-to-D2 history isolation; expired/issuer/audience JWT rejection; subject reassignment while waiting; cross-transaction signed proof replay; nonowner fixed search_path; current account and Block denial for LIVE/UNREAD/ACK/recover; expiring actual JWT after write; 3 staged SQL trigger rollback failures; and two independent restricted LOGINs sending with ordered sequences.
- [PostgreSQL 16/18 role matrix #44010667892](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44010667892): SUCCESS; [R2 PG18 actual schema #44010667847](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44010667847): SUCCESS; [R3A intentionally unsafe predecessor red-team #44010667972](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44010667972): SUCCESS. This last one is a negative-control demonstration that original synthetic policies were unsafe.
- [Foundation checks #44010667857](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44010667857): matching and independent PG16 database regression jobs SUCCESS.
- **Strictly test-only security model:** synthetic verifier signing and non-BYPASSRLS command owner with temporary ownership of ten enumerated context/outbox/secure tables. This is **not** a valid production least-privilege design or hosted authorization certification. No actual message encryption keys, E2EE, billing, Neon, Render or Android changes.
- **Outstanding exact acceptance gaps (and why this remains a DRAFT, unmerged PR):** R3B-37 requires real outbox-stage atomicity; R3B-38 still needs deadlock/stress thresholds and bounded retry proof; R3B-42 requires separate hosted QA preservation evidence before a live migration. R3B-39 needs legacy V1 writers to follow compatible locks or a firewall, and R3B-46 needs new hosted role/KEK/Android/R0/V2-16 approvals. These **3 partial + 2 blocked** requirements cannot be silently certified or merged as complete under existing approval.

## 46-case audit — final scope distinction (2026-11-17)

**This is an evidence review, not 46 passed tests.** `PROVEN` means demonstrated in the disposable proof or independently successful regression; `PARTIAL` means one required variant is missing; `OPEN` means the required standalone positive case is not implemented; `BLOCKED` requires a separately approved hosted/integration stage. Test identifiers R3B-01..46 are acceptance areas, not a claim of 46 distinct Node TAP tests.

| Matrix ID | State | Actual evidence / outstanding requirement |
|---|---|---|
| R3B-01 | PROVEN | Invalid/missing/tampered, expired, wrong issuer/audience, future nbf/iat and excessive lifetime signed JWT denied before trusted operation |
| R3B-02 | PROVEN | Caller actor, role, account selectors rejected; derived JWT actor only |
| R3B-03 | PROVEN | Subject reassignment or deleted actor denied; subject reassigned by synthetic writer after JWT preflight and before mutex acquisition denies |
| R3B-04 | PROVEN | Invalid actor MAC denied; captured HMAC fails on replay in next transaction; short proof expires before COMMIT; synthetic signer is not a production trust boundary |
| R3B-05 | PROVEN | Independent runtime SET ROLE and schema DDL denied |
| R3B-06 | PROVEN | V1 plaintext message table/history direct read denied |
| R3B-07 | PROVEN | Case evidence and synthetic signing key direct read denied |
| R3B-08 | PROVEN | After COMMIT/ROLLBACK runtime session identity unchanged and no custom actor context leaked |
| R3B-09 | PROVEN | Caller-controlled SQL/schema/role/selector denied; runtime search_path changes do not bypass fixed qualified gateway or private-table privileges |
| R3B-10 | PROVEN | Eligible random participants read only current room; third user denied; expires after 30m idle |
| R3B-11 | PROVEN | Synthetic former random room linked as Keep source; random ciphertext never appears in direct D1, which exposes only direct messages |
| R3B-12 | PROVEN | Closed D1 inaccessible, new D2 empty for both; no old direct transcript revival |
| R3B-13 | PROVEN | Suspended, deleted and reassigned actor account denied |
| R3B-14 | PROVEN | Peer suspension, age-unverified and safety-ineligible each deny both ordinary LIVE reads |
| R3B-15 | PROVEN | Actor missing age or lost safety eligibility denied |
| R3B-16 | PROVEN | Either Block direction denies LIVE, UNREAD and SEND |
| R3B-17 | PROVEN | Participant departure, closed room and segment deny current LIVE |
| R3B-18 | PROVEN | Ended relationship denies LIVE/UNREAD/ACK |
| R3B-19 | PROVEN | Unknown or foreign room/envelope uniformly resource_unavailable |
| R3B-20 | PROVEN | Active synthetic SEND writes metadata, LIVE, UNREAD and advances sequence atomically |
| R3B-21 | PROVEN | Blocked synthetic SEND denies; sequence and stored rows unchanged |
| R3B-22 | PROVEN | Random and direct synthetic 30m inactivity deadlines enforced; expired SEND cannot reset timer |
| R3B-23 | PROVEN | Caller cannot inject sender or out-of-relationship recipient |
| R3B-24 | PROVEN | Eligible direct recipient can read only current UNREAD with 7-day bound |
| R3B-25 | PROVEN | Block, suspended/age-ineligible recipient, Keep end, participant departure and post-ACK account restriction deny corresponding UNREAD/ACK/recovery under common transaction authorization |
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
| R3B-36 | PROVEN | Short transaction proof delayed >26s and separate real short-lived JWT delayed after successful synthetic write both force full rollback before COMMIT |
| R3B-37 | PARTIAL | Independent SQL triggers inject failure before metadata, LIVE and UNREAD insertion; all secure rows/counter/outbox snapshot rolls back. Actual outbox write path absent from disconnected gateway |
| R3B-38 | PARTIAL | Two independent restricted LOGIN sessions concurrently SEND without duplicate sequences; synthetic writer/reader lock ordering verified. Multi-client stress, deadlock budget and bounded retry policy remain open |
| R3B-39 | BLOCKED | Hosted legacy V1 Block/Keep/GET/POST/SSE writers do NOT share mutex |
| R3B-40 | PROVEN | Revoking runtime gateway EXECUTE denies; no fallback to privileged owner |
| R3B-41 | PROVEN | Exact CI/ACK/localhost/PG18 Docker system ID attested before DDL |
| R3B-42 | PARTIAL | Checked-in migrations and ledger unchanged, 37-table synthetic fixture attested, Render QA not modified. No live Neon migration or independent hosted QA-row reconciliation performed |
| R3B-43 | PROVEN | New corrected gateway denies; R3A known-unsafe SQL proof still separately reproduces historical gaps |
| R3B-44 | PROVEN | Prior PG16/18 roles, R2 actual 0008 PG18, R3A red-team and Foundation workflows succeeded |
| R3B-45 | PROVEN | Exactly eight-path diff, existing app HTTP/start/auth unmodified and no guard import |
| R3B-46 | BLOCKED | Hosted role/keys, G1 old-client firewall, R0 Android and final V2-16 need separate approval |

**Audit totals:** PROVEN 41; PARTIAL 3; OPEN 0; BLOCKED 2. R3B-39/46 are intentionally not counted as test passes. **Full 46-case acceptance remains OPEN.**

## Verification checklist (no premature pass claims)

- [x] Exact approved eight-path PR diff verified; no production HTTP/start/SQL migrations or Android source edited
- [x] CI-only Docker-cluster PG18 guard, checked-in 0001–0008 and 37 Bridge tables verified
- [x] Independent restricted runtime LOGIN, no direct secure table or legacy/history/key access verified
- [x] Test-only atomic command denies each R3A suspension/Block/leave/close case exercised by new suite; broader variants recorded PARTIAL
- [x] Positive synthetic direct-session LIVE/SEND/UNREAD/ACK/recovery verified (random-session positive remains OPEN)
- [x] Selected Block/account/participant/Keep races and full-command pre-COMMIT rollback verified (multi-client stress and intermediate-artifact injection PARTIAL)
- [x] Disposable test-only attestation, teardown and generated function/schema/role cleanup verified; no QA connection
- [x] Five workflow families all SUCCESS at prior audited code HEAD `60f82c942684c1eeb4d00b66e11fb730dd1fdb5e`; [ ] post-evidence HEAD pending CI verification, merge held for acceptance gaps
- [ ] Independently verify PR merge and any postmerge main CI when available
- [ ] Three partial and two blocked matrix areas UNRESOLVED; **DO NOT CLAIM FULL CERTIFICATION**.

**STOP/GO:** Passing this test-only prototype is not production authorization or permission to merge a production role/policy. All hosted Neon, Render, Android, QA account, billing and key service changes require separate founder approval. V2 HOLD. R0 physical acceptance OPEN; final 138-case V2-16 LAST.

### Permission modeling caveat found in initial CI

- Synthetic nonowner command executor received SELECT on six existing RLS-default-deny context tables but still could not read them; PostgreSQL correctly hid rows under RLS. Initial authorized operation was denied (P0001). The disposable proof fixture now temporarily transfers **only the ten enumerated synthetic tables** to a separate non-superuser command owner, and restores ownership before its teardown. This guarantees read checks can inspect actual eligibility for this one-time test; it deliberately does **not** claim a least-privilege production policy.
- Production implementation requires a redesigned role/policy architecture with audited access to account/block context without table-owner bypass. Do NOT promote this test-only owner-rights gateway to Neon or Render. No hosted roles, grants, data or Android changed.

### R3B-37 follow-up: actual checked-in outbox table (candidate, CI not yet verified)

- The original B2a `apps/api/src/messaging/private_repository.mjs` already inserts into the checked-in `bridge_event_outbox` after metadata/LIVE/UNREAD under the same synthetic PG16 transaction. The disconnected PG18 test gateway initially lacked that step. This change adds a **synthetic-only** event row with the exact M1 event type/key/payload fields, and verifies its contents contain no bodies/ciphertext.
- The same PG18 failure-injection test triggers errors before each of the four inserts: metadata, LIVE, UNREAD, **outbox**. Snapshot comparison includes all four tables, next sequence, and pre-COMMIT failure. An accepted SEND must produce exactly one event with its message ID and sequence. No production outbox worker, hosted V1 event processor, or Android SSE integration is invoked.
- The isolated test command owner temporarily owns **ten** synthetic secure/context/outbox tables to overcome default-deny RLS. This is a deliberately privileged test fixture and *not* an acceptable production role model. Any attempt to migrate this function or grant to Neon requires a new reviewed architecture and separate approval.

### R3B-38 follow-up: synthetic independent-client concurrency and bounded lock-failure (candidate, CI pending)

- The disconnected test guard now sets a **transaction-local 1.5-second lock timeout and 6.5-second statement timeout** before the shared synthetic advisory mutex. A blocked operation must return uniform unavailable, fully roll back all metadata/LIVE/UNREAD/outbox and sequence updates, and leave the runtime client reusable. This is a conservative **zero-retry** synthetic policy; no claim of production scaling or deadlock-retry certification.
- Two extra independently generated restricted LOGINs plus the original nonowner LOGIN submit 18 synthetic SENDs in six simultaneous batches. Assert 18 distinct IDs, contiguous sequences, and exactly 18 outbox events. Each generated role and credential is dropped before fixture cleanup; no hosted credentials or services used.
- The overall R3B-38 category remains PARTIAL until representative throughput, explicitly injected deadlocks, performance SLOs and final production bounded retry behavior are separately designed/tested.
