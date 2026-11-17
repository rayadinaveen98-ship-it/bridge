# Bridge B3c-2R3B-1 — disconnected atomic authorization evidence ledger

**STATUS: IMPLEMENTED CANDIDATE / CI NOT VERIFIED / NOT HOSTED / NOT PRODUCTION-SAFE.**  
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
- The separate non-superuser, non-BYPASSRLS **test command owner temporarily owns only the three V2 secure tables**, so its SECURITY DEFINER function can perform narrowly checked operations while the runtime cannot. This *table-owner bypass* is an explicit dangerous prototype feature and **NOT a production role design**; no owner-rights function or synthetic HMAC from here is authorized for hosted reuse.
- The command proof binds synthetic JWT-derived actor, exact operation, target, client message ID or token digest, transaction ID, expiry and session_user using a synthetic ephemeral HMAC; no caller-provided arbitrary actor or policy flags. Role-session SQL alone cannot sign a new operation. The database rechecks both participants' eligibility, Block, relationship, room and envelope using a shared synthetic mutex 714411. Missing/expired claims default deny.
- Positive SEND, current LIVE, recipient UNREAD, first ACK and bounded recovery use **fake ciphertext-shaped bytes**: these are not real AES encryption or E2EE. Role privileges and the new transaction belong entirely to test code. Random session positive path, cross-worker provider keys, R0 physical QA, G1 firewall and real hosted revocation writers are **not certified** by this test.
- ALL synthetic writer tests cooperatively use the same mutex. The existing V1 HTTP Block/Keep/GET/POST/SSE writers do not; **HOLD_V2** until a separately approved and verified non-destructive cutover. A globally serialized mutex is only a conservative offline proof, not a scalability solution.

## Security 46-case matrix — classification

- R3B 01..09: negative identity/role, forged claim, no unrestricted SQL/key/account access, pooled-session/transaction cleanup checks where implemented. Token expiry after a delayed operation is explicitly a separate requirement; a green suite with no delayed-expiry test must not claim this case certified.
- R3B 10..19: direct LIVE access, two distinct valid members, no cross-relationship history and denial of account restrictions, Block both ways, participant departure, room/segment/connection closure. **Random-session positive and D1->D2 history are separate remaining checks.**
- R3B 20..29: synthetic SEND/LIVE/UNREAD, 7-day expiry, recipient-only first ACK and <=15m recovery and all adverse blocking cases. No production key provider; no genuine network/Android ACK.
- R3B 30..40: same-mutex synthetic Block/READ/WRITE races, partial-write rollback and negative branch; **legacy writers not using mutex remain known BLOCKER**, no claim of hosted race protection. Independent runtime role privilege audit.
- R3B 41..46: exact Docker attestation, checked-in migration ledger, new suite plus R3A known-unsafe negative control, all previous Foundation/PG16 and PG16/18 role/PG18 proof and PG18 red-team workflow results. Hosted and Android release gates explicitly remain OPEN.

## Verification checklist (no premature pass claims)

- [ ] Exactly eight changed files, original production source behavior and SQL migrations unchanged
- [ ] Strict CI-only Docker-cluster PG18 guard and real 0001–0008 checked-in SQL
- [ ] Independent restricted LOGIN and no direct secure table SELECT/INSERT or legacy/history/key access
- [ ] New test-only atomic command denied across all previously reproduced R3A revocation cases
- [ ] Positive synthetic current direct-session LIVE/SEND/UNREAD/ACK/recovery
- [ ] Block/account/participant/Keep concurrency ordering and atomic rollback
- [ ] Attestation, function privilege cleanup, generated test schema/roles and no QA-data access
- [ ] New CI plus Foundation matching/PG16, B3c-2R PG16/18, B3c-2R2 PG18, R3A red-team all green on exact PR HEAD
- [ ] Independently verify PR merge and any postmerge main CI when available
- [ ] Close outstanding 46-case matrix gaps before claiming full security certification

**STOP/GO:** Passing this test-only prototype is not production authorization or permission to merge a production role/policy. All hosted Neon, Render, Android, QA account, billing and key service changes require separate founder approval. V2 HOLD. R0 physical acceptance OPEN; final 138-case V2-16 LAST.
