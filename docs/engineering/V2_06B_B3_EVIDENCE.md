# Bridge V2-06B/B3a — Disconnected Pure Compatibility Contract Evidence

**Status:** IMPLEMENTED ON ISOLATED BRANCH / CODE-HEAD CI VERIFIED / FINAL EVIDENCE-HEAD AND POST-MERGE CI PENDING / NOT LIVE.  
**Baseline:** main@ae4d203af1824ece939a75dbfacccd219fa7b84a; prior [main Foundation #43857847847](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43857847847) SUCCESS for matching and disposable PG16.  
**Authorization:** Founder approved B3a **exactly** as scoped in [B3 Integration Brief](V2_06B_B3_INTEGRATION_BRIEF.md) on 2026-11-16. This authorizes the isolated seven-file pure contract and tests only; no V1 route wiring/hosted changes.

## Exact seven-file implementation boundary

1. `apps/api/src/v2/compatibility_contract.mjs` — NEW disconnected pure classification and proposed old-route safe-denial policy based only on trusted, **server-owned** room metadata markers.
2. `apps/api/src/v2/response_contract.mjs` — NEW disconnected pure response shape validators and uniform 404/upgrade-required/no-store policies, tightly scoped current LIVE, recipient UNREAD, first ACK and short recovery.
3. `apps/api/tests/v2/compatibility/route_matrix.test.mjs` — NEW pure tests: V1 GET/POST/SSE/Keep/bootstrap, ambiguous metadata, spoofed versions, identity-shape and V2 routing.
4. `apps/api/tests/v2/compatibility/response_contract.test.mjs` — NEW pure tests: no history, bounded responses, secret-free outbox/SSE, untrusted actor rejection and no hosted imports.
5. `apps/api/package.json` — ADD only `test:v2:compatibility`, keeping all existing scripts and dependencies.
6. `.github/workflows/foundation.yml` — ADD matching-job only pure B3a test step; all existing matching and PostgreSQL checks untouched.
7. `docs/engineering/V2_06B_B3_EVIDENCE.md` — THIS evidence and controls file.

**Explicitly excluded:** existing `apps/api/src/http.mjs`, `postgres.mjs`, `start.mjs`, `auth.mjs`, `live.mjs`, `outbox.mjs`, old/new SQL migrations 0001–0008, B1/B2 code, tests except these new files, Flutter/Android, Neon schema/data/roles, Render configuration/deployment, key provider/keys, real paid service, billing, retention, purge, report/history implementation or public signup.

## Proposed B3a contract and coverage — NOT real enforcement

- **Stored room scope is authoritative:** `legacy_qa=true` plus NULL V2 marker/connection fields is the only explicit grandfathered legacy QA classification in the pure model. Explicit `bridge-v2` random/direct markers classify separately. NULL/contradictory/unknown metadata fails closed; client User-Agent, body `actorId`, paid/version claims have no authority.
- **Old V1 route denial proposal:** V1 GET and POST `/conversations/:id/messages`, `/peer`, `/events`, `/connection-vote`, `/close` reject V2 IDs. Old bootstrap/connections/matches defer to future server-authorized legacy-only ID filtering. Block and report are allowed to reach **future safety authorization**, not automatically granted or blocked by a privacy-screen workaround. No JSON body or historical transcript leakage.
- **Future V2 shape proposals:** 25-item max current-room LIVE page + HMAC-shaped cursor and deletion tombstone; 25-item max recipient-only unread list, with proof field; firstACK status + recovery token; single-token recovery response with no previous-session pagination; body-free SSE hint and server-scoped bootstrap. No unexpected fields accepted. Uniform 404 safe-deny, no-store and conditional 426 only for known own-account upgrade.
- **Identity-shape check:** compares a future verified subject to the exact database account `auth_subject`, eligibility flags and server UUID. This is **not JWT signature verification nor database authorization**; the B3b facade must construct this context after real signed token+DB checks. Future policy must not accept a client-provided `serverAccount` as an authority.
- **Safe change semantics:** All results are pure objects, with no SQL, networking, key usage, filesystem writes, state mutation or runtime exports. A `decision="delegate"` result always means **a future authorized server adapter must separately check actor/session/safety**; it is not a grant.
- **Important B3a proof limit:** `http.mjs`, `postgres.mjs` and the Flutter client are **unchanged**, so old V1 GET/POST plaintext read/write and V1 SSE replay hints are **not fixed** by this stage; do not expose any V2 session IDs on live APIs. The two synthetic hosted QA accounts/old four messages remain intact. Tests that only assert abstract route denial do NOT certify actual network denial.
- **Further unresolved release controls:** B3b RS256 synthetic token->DB actor facade (separate approval); real Render principal and RLS/grants (unknown), durable KEK/provider and restart/nonce management (unselected), full Block/account update races, V2-07 report evidence and V2-09 secure IDs/consent, Android V2-10, G1/V2-11 safe old-client cutover and real phone/tablet R0.
- **Test-only status:** Case intents G03-01..24 in [B3 brief](V2_06B_B3_INTEGRATION_BRIEF.md) are traceability requirements. Record **actual Node TAP results and exact source commit SHA** from CI before claiming pass. More negative cases may be required for hosted releases; do not equate 24 case labels with 24 independently run tests.

## Verification and merge gates

1. Compare exact PR changed filenames to the seven allowed paths; no old V1 handler imports or changed SQL.
2. Named `npm run test:v2:compatibility --prefix apps/api` passes in matching CI; matching and existing disposable PG16 integration checks pass on **final PR head** after updating this evidence.
3. Check actual test total, pass/fail/skipped counts and original V1–B2b regressions. Redact secrets in logs.
4. Merge only after gates 1–3; then verify **post-merge main** exact SHA Foundation matching + PG16 successes. Record separate documentation closure if necessary; no automatic B3b source start.
5. No live migration, Render deployment, real keys, paid service or Android build is authorized. R0 physical two-device acceptance remains OPEN; the full 138-case What If? review stays **FINAL at V2-16**.

**Rollback:** revert this seven-file isolated PR and discard only source/pure tests; no hosted data, schema, old QA messages or secrets were touched.


## 2026-11-16 actual code-head results and security review

- **Tested code head:** `d87ade27c1392fe73cee01a21caadbad2b3799d9`. [PR-head Foundation #43865081250](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43865081250) and [branch push #43865074153](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43865074153) each **matching SUCCESS / postgres-integration SUCCESS**. All previous V1, B1/B2 and PG16 regression suites ran in their original CI jobs. B3a itself is pure Node/matching-job only.
- **Named test evidence:** `npm run test:v2:compatibility --prefix apps/api` produced **25/25 Node TAP tests PASS, 0 FAIL, 0 SKIPPED**; route matrix has **16** test blocks, safe response contract has **12**? Verify count below before certification: the combined runner reports 25 total, so use 25 as authoritative, not the proposed `G03-01..24` design IDs. Individual tests cover old V1 GET and POST, SSE, Keep, peer, close, bootstrap, connection and matches, ambiguous/NULL markers, spoofed UA/actor, uniform denial, bounded LIVE/UNREAD/ACK/recovery, no-history, no-secret notifications and hosted import fences.
- **First-run fixture failure documented:** initial push CI #43864560224 exposed a test helper passing `undefined` into a fixture with a default legacy room, causing a mistaken expectation (`delegate` vs `deny`). Corrected **only the new B3a route test** to pass explicit `null` on missing room. Re-ran at `d87ade2...`: both CI jobs PASS. The pure policy itself continued to fail closed for explicit missing/ambiguous stored room.
- **Boundary limitation:** `decideLegacyCompatibility` returns **delegate**, never an automatic auth grant, for old legacy QA routes, safety/reporting and discovery. No actual old handler calls this new policy. The future facade must supply strictly DB-sourced scope and verified bearer account; tests don't establish server-signed identity or real HTTP safe-denial. No V2 room has been exposed on hosted routes, no legacy QA data touched and no executable SQL/runtime/client change.
- **Security review follow-ups not waived:** safe denial on **old V1 POST and GET** messages before any V2 ID appears; real SSE/bootstrap/connections/Keep/peer path tests; real Render DB nonowner RLS/grants; production KEK and token/capability custody; full block/account update races; actual Android R0 and V2-10; restricted evidence/historical consent FK redesign; founder G1/V2-11. The B2b 5-minute presentation proof is still only a test protocol, not approved public semantics.
- **Next verification gate:** this evidence change creates a *new PR head*; confirm matching and PG16 SUCCESS on the final SHA and exact seven-file allowlist before merge. Record merged main SHA and postmerge main Foundation CI separately. No B3b, live API, Neon, Render, Android, billing, retention or key provider authority here.
