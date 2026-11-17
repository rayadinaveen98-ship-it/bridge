# Bridge B3c-2R3B-2 — production trust-boundary architecture review

**State: PROPOSED / DESIGN REVIEW ONLY / FOUNDER APPROVAL REQUIRED FOR IMPLEMENTATION.**
**Reviewed baseline:** `main@5b9e437422f946cb668affd9048e1d0ff07ce2ce` (PR #61 repository-only Gate L merge, 53/53 PG18 postmerge TAP and five workflow families PASS).
**Date:** 2026-11-17.
**Boundaries:** No source changes, SQL migrations, live Neon roles/grants/data, Render deployment/environment, actual keys, payments, Android, or QA records authorized by this design. **Gate H = HOLD_V2**; R0 physical acceptance OPEN; 138-case V2-16 What If? LAST. PR #63 is an older, still-draft review whose "PR #61 pending" statements became stale after #61 merged; do not merge it without reconciliation.

## 1. Code-backed current state; not speculation about a breach

1. `apps/api/src/start.mjs` creates one ordinary `pg.Pool` from `BRIDGE_DATABASE_URL`, initializes `createPostgresService`, `createLiveHub`, `createOutboxDispatcher`, and only wires `createHandler` V1 HTTP routes. No V2-only runtime pool, gateway import or V2 launch switch exists there.
2. The opt-in `apps/api/src/v2/runtime_role_probe.mjs` sampled the *real* hosted QA pool in an earlier separately authorized read-only diagnostic. Its recorded outcome was **HOLD_V2**: Bridge table owner/BYPASSRLS and elevated CREATEROLE/CREATEDB attributes. The diagnostic is now disabled, and hosted V2 secure schema has not been activated. This is not a claim of exposed real data.
3. `apps/api/src/postgres.mjs` still serves legacy V1 plaintext `bridge_messages` and route-level membership/Block rules. It is a distinct security/data path from the disconnected V2 PG18 proof. Its V1 Block transaction takes advisory mutex 714411; several V1 readers/writers do not. In particular `unblock()` executes a direct `pool.query("DELETE FROM bridge_blocks...")` without the mutex.
4. The Gate L experiment `apps/api/src/v2/security/disposable_atomic_guard.mjs` and `apps/api/tests/v2/security/atomic_pg18_fixture.mjs` are **NOT production dependencies**. The fixture temporarily transfers owner rights over 12 enumerated secure/context/match/outbox tables to a synthetic function owner in disposable PG18. This is a deliberate RLS bypass in the laboratory, not an approved hosted strategy. All five workflow families passed after merge.
5. V2 marked room/connection lifecycle, synthetic signed actor, 30-minute random inactivity, direct Keep, recipient UNREAD up to 7 days and 15-minute first-ACK recovery have offline tests. No real-user V2 encryption key custody, cross-worker secrets, provider purchase, storage retention, or Android V2 feature is certified.
6. `0008_v2_secure_messaging.sql` is additive, checked in, **not executed in hosted QA**, and enables RLS on three V2 tables without hosted policies. Existing V1 messages and records must not be rewritten, imported into V2, deleted or exposed via a migration.

## 2. Security invariants and threat model

| Threat / adversary | Must be denied or constrained | Discriminating test |
|---|---|---|
| Old V1 client guesses a V2 room/envelope ID | V1 GET/POST/SSE/bootstrap/peer/Keep cannot expose or mutate any V2 secure content | Both read AND write routes deny before SELECT/INSERT and persist no event |
| Compromised `bridge_v2_runtime` database connection | Cannot choose another actor, `SET ROLE`, access private tables/history, run DDL, call arbitrary privileged routine or spoof grants | Independent LOGIN, direct SQL, forged GUC, function/procedure/view/search_path attack cases |
| Invalid or replayed signed request capability | Cannot extend an authorization to a new transaction, operation, target, participant, session or time | Wrong issuer/audience, stale nonce, altered op, recipient, payload digest, tx, role, expiry |
| Block/revocation happens while SEND/LIVE/ACK is waiting | State committed first denies request; operation first commits but subsequent reads deny; no stale third outcome | Both race orderings + rollback of metadata/LIVE/UNREAD/outbox |
| Synthetic test command copied into app | No production HTTP import/EXECUTE, key reuse or owner-rights RLS bypass | Static import fence, CI policy, unique test namespace and release audit |
| Misconfigured/privileged runtime role or policy | No owner/BYPASSRLS/SUPERUSER, no uncontrolled `USING(true)` or PUBLIC EXECUTE, no hidden policy/function inheritance | Independent runtime LOGIN role/grant/catalog/RLS/privilege matrix |
| Hosted migration/operator mistake | Historic V1 QA rows, roles, accounts and data remain intact; cutover reversible without reverting privacy restrictions | Read-only baseline, restore proof, dry-run, staged grants and before/after counts |
| Safety report vs private history conflict | Evidence access requires distinct audited purpose; cannot become general/free message history | Reviewer/retention role negative tests and purpose-scoped grant |
| Compromised application-side signer or signing service | No ability to mint arbitrary actor grants silently; mandatory split of duties, rotation, logging and response | Independent signer threat model, signing authority minimization, tamper/replay cases |
| Live SSE subscriber retained after Block, expiry or JWT change | Never delivers message-availability hint for unauthorized V2 room | Authorize before open, before publish and periodic recheck, close on revocation |

The privacy product invariants remain **30 minutes of inactivity for random chat**, mutual Keep yielding a separate free direct room, **no free previous-message timeline**, bounded UNREAD delivery and independent safety evidence. No retroactive transcript resurrection.

## 3. Role separation — target model, NOT provisioned

| Role (illustrative names) | Proposed positive authority | Must NOT possess |
|---|---|---|
| `bridge_schema_migrator` | Time-limited reviewed additive DDL/ownership outside request serving | Normal request execution or shared API pool secret |
| `bridge_v1_runtime` | Existing V1 QA data path only, with V2 marker firewall and compatibility locks | V2 secure LIVE/UNREAD SELECT or WRITES, migrator rights |
| `bridge_v2_runtime` | Fixed command interface for authenticated, approved V2 operations | Table ownership, direct secure SELECT/INSERT, BYPASSRLS, CREATEROLE, CREATEDB, broad `SET ROLE`, key table read |
| `bridge_v2_command_executor` (NOLOGIN) | Minimal, reviewed table/column rights and compatible RLS *inside* a command gateway only | Table ownership, BYPASSRLS, unrestricted data views, unsafe dynamic SQL, PUBLIC EXECUTE |
| `bridge_case_reviewer` | Later, report/case-scoped evidence with logged reason and expiry | User-current LIVE, V1 plaintext full history, unrestricted evidence export |
| `bridge_retention_worker` | Later, approved retention manifest and safety-hold gating | General user reads, schema administration, unbounded DELETE |

**PostgreSQL reality:** A table owner normally bypasses RLS; FORCE RLS can subject an owner to policies, while superuser/BYPASSRLS are still bypass paths. `GRANT` alone does not grant RLS authorization. Neither `USING(true)` nor changing `current_user` to a shared API account proves an end-user identity. A security-definer function can run with its owner's rights and has a dangerous `search_path` boundary; publicly executable functions can launder privileges. See official PostgreSQL 18 row-security and CREATE FUNCTION guidance:
- https://www.postgresql.org/docs/18/ddl-rowsecurity.html
- https://www.postgresql.org/docs/18/sql-createfunction.html
- https://www.postgresql.org/docs/18/perm-functions.html

**Reference candidate, not architecture approval:** Separate runtime LOGIN(s) with only EXECUTE on narrowly audited commands. The command owner is a separate NOLOGIN **non-table-owner, NOBYPASSRLS** principal, has minimal explicit grants and subject/operation-scoped RLS policy enforcement. Its functions use fixed SQL, fully qualified identifiers, a trusted `search_path` with unsafe schemas/temp excluded, restricted EXECUTE grants, no dynamic identifiers, no exposed key tables and no generic subject parameter as authority. Check that chosen policy predicates *actually execute under this function's privilege context* and do not open a broad read surface.

**Identity proof unresolved:** The production command must independently verify a request capability bound to signed JWT subject, immutable account binding, exact command, target room or envelope, intended recipient/payload digest, database transaction, runtime role, expiry and anti-replay. Caller-controlled `SET LOCAL bridge.actor_id`, any user-argument `actor_id`, permissive RLS, or synthetic HMAC from the test lab is **insufficient**. A public-key verified one-operation capability from an **independent and limited signing authority** or equivalent independently reviewed trusted authorization service is a candidate, not a chosen vendor/design. The app runtime DB credential must not be sufficient by itself to mint capabilities for any actor.

If safe DB-side claims, executor RLS, independent issuer and command grants cannot be proven on the real checked-in schema with an independent nonowner LOGIN, **STOP**. Do not deploy the owner-rights test gateway to get around policy visibility. Compare:
- **A: executor-only command service + verified capability + invoker/enforced RLS** (preferred candidate for threat-model tests; not yet selected for production).
- **B: invoker-only RLS with verifiable per-transaction identity** (requires equally strong protection against GUC spoof and information leakage).
- **C: restricted external authorization service backed by nonowner DB credentials** (extra operational trust boundary/cost and correctness challenge).

No production identity algorithm, KMS vendor, paid provider, owner/definer SQL or new hosted credential is selected in this stage.

## 4. Single-transaction authorization, revocation and concurrency contract

For SEND/current LIVE/recipient UNREAD/first ACK/15-minute recovery:
1. HTTP validates token/issuer/audience/expiry and chooses a fixed operation; no actor, role, tenant, key or SQL override accepted from an arbitrary request.
2. Trusted issuer capability must be checked *again in the protected DB operation* with domain/operation/target/transaction binding. Pool checkout and DB session role are attested; claims expire before commit; user-controlled GUCs are ignored.
3. Reconcile with every V1 writer *before rollout*. Proposed initial compatibility path can use existing mutex `714411` as a conservative bridge, but it cannot be considered a production performance solution. All Block/unblock/account suspension/Keep/room/participant changes must be serialized or conservatively denied with a robust replacement.
4. Establish canonical lock order across mutable actors/peers, connection, room, match/slots, participant and delivery; avoid a mixed V1 room-first vs V2 account-first deadlock. Verify `FOR UPDATE` and predicate absence-of-Block under the chosen isolation strategy and under independent credentials.
5. Under same DB transaction check current actor **and peer** active/age/safety/deleted status, two joined active members, both Block directions, correct source/match slots for random rooms, or unended Keep/direct segment, expiry and policy marker.
6. Execute minimal command with plaintext never written into `bridge_messages`. SEND writes metadata/LIVE/UNREAD (direct only), payload-free outbox event and clocks/sequence as one atomic unit. All other commands return only permitted bounded fields.
7. Re-check JWT capability expiry using DB time **after** potential waiting; deny and rollback on any mismatch, including errors midway through operation.
8. For replay or failover, lock/permission failure **fails closed**. Define explicit production deadlock detection, bounded retry, jitter/SLO and idempotency policy before multiple workers; do not promote test lab's one global mutex and zero retries as scalable.

The V1 active-read/write paths do not all take the mutex, and `unblock` is explicitly a direct pool-level DELETE. The absence of a Block row is **not locked by a positive account-row SELECT**. A negative test that only covers cooperative synthetic writers cannot certify this property in real QA.

## 5. Safe non-destructive deployment sequence (each production gate independently approved)

**H0 — Design and nonowner offline proof:** Approve a separate exact-file scope and disposable PG18 proof of the selected trust boundary; independent LOGIN, original migrations and adverse role/authorization tests. No hosted operations. If no safe option passes, redesign.

**H1 — V1 compatible firewall first:** Review network, SQL and SSE denial for V2-marked data across V1 GET/POST/bootstrap/peer/Keep/vote/direct/Block/report routes, while preserving original V1 QA. Align revocation writers under a race-safe lock protocol. Keep old clients functional for legacy data; unknown V2 reads/writes fail uniformly.

**H2 — Hosted read-only preservation baseline:** Only after new founder approval, collect redacted role/schema/grant/migration/count evidence and recoverability verification. No secrets or real messages in public docs.

**H3 — Staged additive role/policy/credential transition:** A distinct founder-approved non-destructive migration, controlled operator rollback and test-only private canary. V1 still available; no automatic Render deploy. Revoke unnecessary rights only with proven safe V1 routing. No application user traffic to V2 until H1+H2+H3 are demonstrated.

**H4 — Durable crypto and safety:** B3c-3 real wrap/unwrap KEK custody, nonce uniqueness, recovery/rotation cost approval, V2-07 safety case retention, V2-08 expiry, V2-09 history policy, V2-10 Android, V2-11 old-client firewall final cutover and V2-12+ operational readiness.

**H5 — Release:** Independent R0 physical phone/tablet acceptance; security/abuse/accessibility/ops validations; founder release approval; final V2-16 *138-case What If?* exercise remains **LAST**.

**Rollback caveat:** Before any V2 ID is exposed, revert application routing to verified V1 QA if safe. After a privacy boundary is activated, never restore broad old-client access to V2 data as a rollback; use fail-closed mode or forward-fix. No table drop, historic QA overwrite or ad hoc data erasure.

## 6. Design acceptance before choosing a production API/DB implementation

- Independent design review compares at least A/B with runnable disposable PG18 evidence and identifies any elevated function/policy bypass.
- Full role catalog and grant-inheritance matrix, object ownership, PUBLIC EXECUTE, `search_path`, views, extension functions, prepared statements, temp objects and per-connection state reset are tested.
- An authenticated, arbitrary SQL holder of the V2 runtime credential cannot SELECT another member's metadata/ciphertext, forge actor or install privileged functions, even with guessed UUIDs.
- Concurrent V1 Block/unblock/vote/close/GET/POST/SSE and V2 SEND/LIVE/ACK must not produce stale-authorization or out-of-order privacy results; initial tests are independent same-time races, then multi-worker stress.
- Failure injection at each data write/outbox stage and at privilege/crypto/clock boundaries rolls back all state. Uniform errors reveal neither target existence nor reason.
- Measure latency/lock-wait tails, deadlocks, pool starvation, idempotent retries, reconnect/stream reauth and high-concurrency cost; define explicit SLO and abort thresholds before hosted canary.
- No simulated provider, session actor or temp role becomes a production credential. No provider bill/subscription without founder approval.
- PR #63 remains unmerged draft and describes older "PR #61 pending" status: reconcile it in a later separately approved documentation closeout; do not auto-merge stale text.

**Recommended design outcome:** `PROPOSED_REFERENCE_ARCHITECTURE`, not `APPROVED`, `IMPLEMENTED` or `HOSTED_CERTIFIED`. Gate H stays HOLD.

