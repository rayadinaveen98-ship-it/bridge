# Bridge V2-05A — Mutual Keep and Free Direct Session Evidence

**Status:** IMPLEMENTED ON ISOLATED BRANCH — CI VERIFICATION PENDING.  
**Founder authority:** Scope approved from [V2-05 brief](V2_05_IMPLEMENTATION_BRIEF.md), docs PR #23, **disconnected source and synthetic PostgreSQL CI only**.  
**Base:** `main@47d938f492c7377bffd7163c8c7920582db5cadc` (documentation-only PR #23 merged).  
**Non-authorizations:** No live Neon queries, migrations, data, role changes; no Render/Android API integration, paid services, billing, message deletion, public beta or V2-06. R0 real Android acceptance remains OPEN. Comprehensive What If? remains at final V2-16.

## 1. Source inventory (approved code boundaries)

| File area | Function and trust boundary |
|---|---|
| `apps/api/src/connections/keep.mjs` | Pure and closed accepted/withdrawn/two-current-vote state gate |
| `apps/api/src/connections/keep_repository.mjs` | DISCONNECTED PostgreSQL adapter for Keep, withdraw, one atomic two-accept conversion to immutable closed source + mutual relation + NEW empty D1 + two-slot/queue cleanup; transaction injection tests |
| `apps/api/src/sessions/direct_lifecycle.mjs` | Pure 30m independent direct segment expiration and mandatory explicit V2/pair markers |
| `apps/api/src/sessions/direct_repository.mjs` | DISCONNECTED transactional direct current/open/end/reopen/free relationship revocation, one OPEN direct segment per relationship; no actual chat body send/read |
| `apps/api/tests/v2/connections/{keep,postgres}.test.mjs`, `fixtures.mjs` | Pure tests, signed-off local-only PG16 runner guard, repeatable synthetic users, original random text checks, late Keep/withdraw/End/block races, failure injection and legacy fixture SHA-256 |
| `apps/api/tests/v2/direct/{lifecycle,postgres}.test.mjs` | Exact direct 30-minute boundary, concurrent D2 creation, expired-but-still-open D1 on-demand closure, unmatch/block, eligibility and cross-relation access |
| `apps/api/package.json`, `.github/workflows/foundation.yml` | Test-only scripts and additive pure plus disposable-PG16 CI steps; existing V2-01..04 and V1 regression suite remains present |
| `docs/engineering/V2_05_EVIDENCE.md` | Current proof, gates, unimplemented integration and safe rollback |

**Forbidden files unchanged:** `apps/api/src/{http,postgres,auth,start,live,outbox}.mjs`, original V2-04A files, `apps/api/src/policy/**`, migrations 0001–0007, `apps/mobile/**`, hosted infrastructure or billing.

## 2. Product contract and exact data separation

- Both eligible participants must independently Keep **the same active V2-marked random room** before any relationship or direct session is created. A withdrawal before second accept reverses consent to connect.
- Inside **one** `BEGIN` -> global match/block advisory mutex -> source/participant/match locks -> fresh `clock_timestamp()` -> vote/connection/source closure/slot cleanup/D1 -> `COMMIT` transaction, the original room is **never changed to kind=connection**. It becomes `kind='random', state='closed', closed_reason='converted'`.
- `bridge_connections.source_conversation_id` refers to the now-closed original stranger room; `bridge_v2_direct_sessions` refers to a different fresh `kind='connection', role='direct'` conversation D1. D1 message sequence begins at 1 and its message table begins empty.
- Existing relationship M persists for **free** after D1 closes/expires; D2 is a new conversation ID under the same M. No offline delivery, previous-session timeline, history, subscription or premium grant is created by this implementation.
- Existing PostgreSQL partial unique indexes enforce one active relation per pair, one OPEN direct segment per relation. Application checks tie all direct members to the correct relation and source.
- A blocked/suspended pair cannot read/resume or initiate a direct segment; one eligible member can end the relationship even if the peer is suspended/blocked. Unblock **does not** restore a revoked mutual.
- All tests are synthetic and explicitly refuse connections other than loopback `bridge_test`, with an exact `disposable-bridge_test-only` acknowledgment.
- Original 2-tester/4-body/one-open-room/two-slot synthetic fixture is hashed before/after; the **real private Neon fixture is never inspected or changed**.

## 3. Traceability of 30 acceptance requirements

| Requirement | Evidence route | Current status |
|---|---|---|
| C05-01/02 | First Keep remains pending and does not advance source clock | Test written |
| C05-03/04 | Withdraw before second Keep; re-Keep requires two current votes | Test written |
| C05-05/06 | Concurrency and idempotent replay produce one relation+D1 | Test written |
| C05-07/08 | Expiry and delayed advisory lock deny second Keep, DB authoritative | Test written |
| C05-09/10 | End/expiry wins, late Keep cannot revive source | Test written |
| C05-11/12/13 | Block, sanction, outsider and missing/legacy marker deny | Test written |
| C05-14/15/16 | Original kind/message bytes/source pointer preserved; direct fresh UUID, sequence 1 | Test written |
| C05-17/18/19 | Own match cleanup, body-free replay metadata, repeated pair uses same relation | Test written |
| C05-20/21 | One OPEN segment, exact direct idle boundary; free relationship survives | Test written |
| C05-22/23 | Direct End doesn't unmatch; new free D2 without previous timeline | Test written |
| C05-24/25/26 | Block/unmatch/eligibility, correct two-member FK mapping | Test written |
| C05-27/28 | Five injected transaction failures roll back fully; original 4-message fixture unchanged | Test written |
| C05-29 | All baseline V1 API, V2-01..04, PostgreSQL migration/restore CI still green | **PENDING CI** |
| C05-30 | Only approved disconnected source/tests/CI/docs, no live server/DB | **PENDING final diff** |

**Limitations:** tests of the direct 30-minute exact millisecond threshold are pure deterministic tests; PG16 tests use explicit past/future time travel and row locks. Real HTTP requests, SSE authorization, encryption, 7-day unread, 90-day bilateral history, physical-device resume and live-user messaging **are not implemented or certified by these tests**.

## 4. Security and concurrent-state review

- `withV2ConnectionTx` uses the same `MATCH_MUTEX_ID=714411` as V1 matching/block and V2-04A. This makes V2-05A fixture transactions serialize with currently reviewed matching/closure. V1 `participants()` has a different lock order in some paths; **cross-version live integration remains a blocker**, not solved by isolated CI.
- Internal methods take an `actorId` trusted by their future adapter; they do **not authenticate an HTTP caller**. Routing cannot pass client-provided identity or fake server-validation markers to the kernel.
- SQL is committed only in the disposable test DB; RLS in a test owner role does not establish actual Neon/Render runtime privilege safety. Live migrations/role checks are separately gated.
- The source random message bodies are **not copied**; their current storage stays in `bridge_messages.body NOT NULL` as the older system requires. V2-06/V2-11 must secure read scopes and the old V1 historical-reader endpoint before any new D1 ID is exposed to a hosted client.
- Current V2-05A deliberately has no DM message-send/replay function, no encrypted payload or history, no unread envelopes, no case evidence, no notifications and no sweeper.
- PostgreSQL `clock_timestamp()` is sampled after lock waits, but commit-time correctness under prolonged transaction stalls remains an integration/load-test gate. No test success is a claim of deployed 30-minute expiry.
- Block/End races are tested under the advisory mutex; only a *future* integrated service should coordinate real V1 and V2 blocks, relationship revocation, and policy authorizer.
- Late withdrawal after mutual conversion does not revert a valid relationship; explicit End Relationship must be a separate authenticated action, not a Keep reversal.

## 5. CI, evidence and rollback

**The following items may be promoted to VERIFIED only with actual GitHub Actions output at exact PR head:**

1. New V2-05A pure Keep/direct tests and PostgreSQL-16 tests pass.
2. Original matching, backend HTTP/auth, V2-01 contracts, V2-02 policy, V2-03 migration+restore, V2-04A clock and PostgreSQL tests all pass.
3. Twelve changed paths (four new source modules, five test/fixture files, npm script, CI workflow and this evidence document) must remain within founder-authorized areas; no existing V1/V2-04A/SQL/Flutter source changes. Confirm the exact paths from the PR diff.
4. Tests create only disposable synthetic rows; no live Neon connection or private real test accounts used.
5. If any test or source-diff gate fails, **DO NOT MERGE**; update branch, rerun CI and record actual evidence.
6. Rollback of the disconnected source is a PR revert. No live data reverse migration or release is needed.

**Exit classification if CI succeeds and PR merges:** `V2-05A IMPLEMENTED / DISPOSABLE CI VERIFIED / HOSTED MUTUAL-DIRECT V2 NOT ACTIVATED`. R0 OPEN; V2-06 not started. Live Neon schema application, trusted policy integration, Android flow, old-message-history endpoint cutover and Render deployment all require distinct founder decisions.
