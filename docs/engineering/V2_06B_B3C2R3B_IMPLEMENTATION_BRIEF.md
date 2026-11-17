# Bridge B3c-2R3B — controlled offline implementation brief

**Status:** PROPOSED, needs separate exact-scope founder approval before production-facing security source changes. Planning documentation alone is currently approved.  
**Baseline:** `main@0b3e4998697907033d7307ba95b0bb1326484cef`.  
**Predecessor:** B3c-2R3A [PR #58](https://github.com/rayadinaveen98-ship-it/bridge/pull/58) reproduced 15/15 unsafe prototype scenarios; [PR #59](https://github.com/rayadinaveen98-ship-it/bridge/pull/59) recorded final CI.  
**Authorization:** disposable PostgreSQL 18 security and synthetic identity tests only; no live Neon/Render/Android/API HTTP route, QA data or real credentials.

## Stage structure — separate review gates

**B3c-2R3B-0 (this PR, documentation ONLY):**
- Architecture decision record, exact implementation allowlist, adversarial test matrix, append-only roadmap. No source or workflow modifications.
- Validate existing PG16 B3b-2 safety tests and PG18 R2/R3A asymmetry; explicit statement that the B3c-2R2 test-only policy remains unsafe.

**B3c-2R3B-1 (NEXT separate founder approval; disconnected test-only implementation):**
- Add a minimal internally invoked *test-only* authorization gateway on the actual checked-in `0001..0008` PostgreSQL 18 schema under independent NO-BYPASSRLS nonowner credentials.
- A single trusted signed-actor transaction must validate current account, both participants, Block absence, room/connection/segment and operation before restricted read/write; prove that each formerly unsafe R3A read/write is **DENIED** instead of silently repeating the unsafe test.
- Attested disposable PG18, synthetic keys/actors/data, no automatic rollout or API imports. Prefer *deny-first/negative tests*; do not silently select final production HMAC or SECDEF design without security review.
- Integrate synthetic Block/revoke/Keep/account/participant writer races with a documented shared mutex/lock protocol. **Explicitly mark any legacy writer not following that protocol as an unresolved hosted blocker**, not a passing race.
- Run predecessor PG16/PG18 role matrix, actual PG18 proof, PG18 red-team, Foundation matching and PG16 PostgreSQL regression. Reproducing existing R3A unsafe behavior must remain a PASS **as a control**, while new R3B tests must PASS for corrected deny behavior.

### Exact B3c-2R3B-1 proposed EIGHT-file allowlist

1. **NEW** `apps/api/src/v2/security/disposable_atomic_guard.mjs` — disconnected internal-only guard, strictly localhost/CI/ACK, no HTTP imports; one transaction/actor authentication and lock protocol.
2. **NEW** `apps/api/tests/v2/security/atomic_pg18_fixture.mjs` — attested PG18 role/canary/synthetic writer fixture; reuse checked-in migrations; deterministic cleanup.
3. **NEW** `apps/api/tests/v2/security/atomic_revocation.test.mjs` — positive and negative source/participant/account/Block/expiry access and atomic write/read behavior.
4. **NEW** `apps/api/tests/v2/security/atomic_races.test.mjs` — independent LOGIN concurrency tests and rollback/lock order.
5. **NEW** `apps/api/tests/v2/security/atomic_privileges.test.mjs` — no owner/BYPASSRLS, forged actor claim/role/table/view/key access, fresh and pooled sessions.
6. **MODIFY** `apps/api/package.json` — exactly one new named `test:v2:atomic-authz:pg18` script; preserve existing scripts.
7. **NEW** `.github/workflows/bridge-atomic-authz-pg18.yml` — disposable `postgres:18` job, non-secret fake credentials, no production secrets/connection.
8. **NEW** `docs/engineering/V2_06B_B3C2R3B1_EVIDENCE.md` — actual TAP/CI SHA, failures, permissions, limits and non-hosted closeout.

**Any additional source path, old migration, V1 POST/GET/SSE route, SQL migration or hosted change is explicitly OUTSIDE this allowlist** and requires a new scope review. Existing source is not assumed safe or implicitly refactored.

### Minimum acceptance evidence

- Exact eight-file diff at final PR head; disconnected code cannot be imported by `start.mjs`, `http.mjs`, `postgres.mjs`, Render or Android.
- CI guard refuses Neon URL / wrong DB/login/version/ACK/host before connecting or changing roles. Independent Docker cluster-ID attested on PG18; generated roles and keys never logged; complete cleanup.
- Real `0001..0008` checksums, 37 Bridge tables, three 0008 RLS tables retained; no original SQL edited and no V1 user-message data inserted/deleted.
- Independent NO-BYPASSRLS runtime login and actor-proof validation: sender and recipient read current LIVE only when active; UNREAD only for eligible direct recipient; positive authorized SEND + ACK/recovery remain bounded. No general free timeline.
- Previous gap cases (suspension, age/safety ineligibility, both Block directions, participant departure, ended relationship, closed room, blocked INSERT) now all **deny** under the **new** test gateway. Old R3A red-team still demonstrates the legacy synthetic prototype gaps, and remains correctly labeled not production safe.
- Race tests for Block vs SEND/LIVE/UNREAD/ACK, account status vs message accept, participant leave vs read, Keep end vs recovery, token expiry after locks, rollback after each persisted artifact, time sampling after lock acquisition, fresh pooled client without cross-user context.
- Check V1 old-client write path **not covered**; mark HOSTED HOLD. Foundation PG16+matching and all existing PG16/18 role/new PG18 proof/red-team CI must pass; verify final PR head, merge and independent postmerge main CI when available.

**Explicit non-goals:** Do NOT copy the synthetic HMAC/SECURITY DEFINER B3c-2R2 function unchanged; do NOT claim key custody, E2EE, moderation, production nonce registry, physical QA, old-client network firewall or hosted privacy certification.

**B3c-2R3B-2 (future, independently approved after -1 passes):** choose production-safe signed actor verification, review privileges with specialist threat model, implement writer-compatible old-client firewall and migration/rollback strategy, then request explicit Neon/Render role/credential change authority. Hosted V2 canary, Android integration and beta remain separate release gates. Do not conflate code merge with deployment.

### Outcome classification

`B3c-2R3B-0: DOCUMENTED` may be marked only after PR merge + CI.  
`B3c-2R3B-1: PROPOSED` until explicit approval and code/tests exist.  
`B3c-2R3B-2: BLOCKED` until proof, role and legacy-writer trust boundaries are independently certified.  
`HOSTED V2: HOLD` throughout.
