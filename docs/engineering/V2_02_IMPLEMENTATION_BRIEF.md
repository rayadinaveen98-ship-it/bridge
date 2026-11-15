# Bridge V2-02 — Central Policy and Backend Authorization Implementation Brief

**Stage:** V2-02 — SECURITY AND POLICY FOUNDATION  
**Status:** **PROPOSED FOR SEPARATE FOUNDER APPROVAL; NOT AUTHORIZED FOR SOURCE IMPLEMENTATION**  
**Prepared:** 2026-11-15.  
**Source of truth:** `main@734240369205ed895c2e49824e75d8263ca4baef` after successful V2-01 PR #16 and both main-branch CI jobs.  
**Policy authority:** [Approved Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md) BR-001–BR-029 and D-01–D-07, H-01, M-01; [Architecture V2](ARCHITECTURE_V2.md); [approved delivery package sequence](V2_IMPLEMENTATION_PACKAGES.md).  
**Current device gate:** R0 physical phone/tablet acceptance remains OPEN.  
**Allowed now:** Documentation only. No API source code, database SQL, Neon role/grant, Render deployment, billing, test account or user data changed by this document.

## 1. Executive engineering diagnosis

Bridge's existing backend already uses verified RS256 JWT identity, parameterized PostgreSQL queries and transactional matching. `apps/api/src/postgres.mjs` has account, participants and two-way block helpers. However, its authorization rules are distributed across `http.mjs` and the individual service methods, and each method implements only the portion needed by M1/M2/R0. The approved V2 product requires **central, versioned, negative-testable permission decisions**, not a Flutter hide/show workaround.

**Verified existing capabilities and V2 gaps**

| Existing actual code | Current protections | Missing for approved V2 |
|---|---|---|
| `apps/api/src/auth.mjs` | Verify RS256 bearer, issuer/audience/time, UUID and message inputs | Durable revocable session, production adult assurance (later V2-13); account eligibility must use server state |
| `http.mjs` | Auth before protected routes; no-store JSON; signed JWT rechecked for SSE | Route-by-route explicit scopes; old `GET /v1/.../messages` currently has a generic replay scope |
| `postgres.mjs:account()` | Current `status=active`, lab-only age marker, safety boolean | Policy version, production age provenance/acknowledgment checks, review of all operations |
| `postgres.mjs:participants()` | Two-person membership and bilateral blocks | Formal operation-specific authorization for current RANDOM, DIRECT, UNREAD, HISTORY, REPORT and EVIDENCE |
| `postgres.mjs:authorizeEvents()` | Open conversation + participant/peer eligibility + saved connection checks | V2 30m idle, per-scoped event access, consented payload boundaries |
| `postgres.mjs:messages()` | Open-room member check, ordered paginated replay | Free previous-message timeline denial, separation of current/direct/retained bodies, V2 deadline |
| `postgres.mjs:sendMessage()` | Open-room member, peer eligibility, blocks, saved connection, idempotency/outbox | DB-authoritative expiry; direct session vs relationship; unread and future history scope |
| `postgres.mjs:castVote()` | Two accepted votes under transaction; blocks, eligibility | Old in-place random `kind='connection'` conversion (forbidden under V2); expiry race |
| `postgres.mjs:conversationPeer()` | Signed-in current participant and block checks | Does not independently require conversation to be open; consider restricting stale peer data |
| `postgres.mjs:report()` | Authenticated reporter, target ID, participant check if conversation ID supplied | Post-end 7-day token, case-specific evidence, rate-limits/incident operations; later V2-07 |
| `database/migrations/0001–0003` | 20 Bridge tables with RLS ENABLED in checked-in SQL | Role/grant independence, actual runtime role unknown, direct/unread/history/evidence schema not yet implemented |

**Known gap severity:** P0 privacy breach risk if old generic replay endpoint is retained after V2 cutover; P0 time/consent bypass if client controls expiry or entitlement; P0 case-evidence leak if moderator privilege is conflated with premium; P0 irreversible QA loss if new lifetime policy is applied to seeded legacy room.

**Do not claim the current API violates the NEW V2 release privacy contract in a deployed V2 environment:** it is a private synthetic QA **V1** baseline. It must **never** be exposed to public users, nor allowed to serve as historical-read fallback after the later V2 cutover.

## 2. Implementation strategy — additive, zero live behavior change in this package

**Recommended single future PR:** `V2-02: central typed policy evaluator and negative authorization tests`.

Implement a small **pure policy kernel** plus minimal read-model adapter contracts. The kernel is production-intended code, but remains **disconnected from live routes and persistence in V2-02**. This makes the V2 logic executable without accidentally denying the two synthetic test accounts or exposing new historical routes. **Runtime enforcement and cutover are later approved packages**, not implied by a passing kernel.

### Proposed allowed source and test paths (separate founder approval required)

| Path | Proposed change | Explicit exclusion |
|---|---|---|
| `apps/api/src/policy/operations.mjs` (new) | Closed allowlist of policy operations, kinds and stable decision codes | No client-provided operation names trusted by runtime |
| `apps/api/src/policy/authorize.mjs` (new) | Pure `authorize(context)` -> frozen safe decision; deny by default | No SQL, fetch, filesystem, credential handling, message bodies or network effects |
| `apps/api/src/policy/context.mjs` (new) | Strict normalized server-owned policy read model and completeness checks | No heuristic age inference, no client `premium`, and no hidden fallback |
| `apps/api/tests/policy/*.test.mjs` (new) | Unit/negative/mutation tests against **actual new production policy functions** | No replacement of CT-001–016 by mock-only PASS |
| `apps/api/tests/v2/**` (additive only) | Link V2-01 reference expectations to real pure policy evaluator | Do not rewrite reference tests just to force green |
| `apps/api/package.json` (test script only) | `test:policy` named and correctly included in CI | No startup behavior or dependency installation |
| `.github/workflows/foundation.yml` (new test step only) | Run actual policy tests and preserve old tests/Postgres jobs | No deployment or cloud secrets |
| `docs/engineering/V2_02_SECURITY_REVIEW.md` (new) | Decision mapping, proposed role/grant matrix, read-only inspection runbook and known open gates | No live role change, credential exposure or connection to Neon |

**Prohibited in V2-02:** modifications to `apps/api/src/http.mjs`, `apps/api/src/postgres.mjs`, `apps/api/src/start.mjs`, `apps/api/src/live.mjs`, `apps/mobile/**`, `database/migrations/**`, `Render` / `Neon` configuration, tables, grants, roles, rows, queues or live endpoints; no feature rollout/enablement, message deletion, payment or real-user signup. If a wrapper is needed sooner, it requires a **separate scope amendment and founder approval**.

Reason: source-based APIs cannot fully enforce `idle_expires_at`, unread delivery or entitlement storage until the additive schema and transaction-level lifecycle packages exist. Wiring a partial authorization facade prematurely can be more dangerous than leaving V1 private QA intact with explicit launch blockers.

## 3. Policy operation catalog

No generic `ALL_MESSAGES`, `ADMIN`, `ANY`, or wildcard permission. Define explicit named operations, including:

| Operation | Principal and resource | V2 entitlement and constraints | Owning implementation stage |
|---|---|---|---|
| `DISCOVERY_SEARCH` | Active eligible account and server-moderated shared language | At most one active slot; no peer restrictions | V2-02 contract, V2-04 enforcement |
| `SEARCH_CANCEL` | Authenticated queue owner and matching request | Idempotent cancellation, server race resolution | Existing/R0 + V2-04 |
| `RANDOM_LIVE_READ` | Participant, OPEN unexpired random session | Peer safety, no block; current room only | V2-04 / V2-06 |
| `RANDOM_LIVE_SEND` | Participant and valid active random session | 30m DB-owned deadline; unique newly accepted message only resets | V2-04 / V2-06 |
| `RANDOM_KEEP` | Participant and valid active random room | Single vote not a connection; two valid votes atomic | V2-05 |
| `RANDOM_END` | Current participant | No reopen, idempotent terminal reason; slot cleanup | V2-04 |
| `CONNECTION_LIST` | Current account and active relationship | No old room/message body returned | V2-05 |
| `DIRECT_CREATE` | Active reciprocal mutual relationship | Free; one current direct segment, independent of history | V2-05 / V2-06 |
| `DIRECT_LIVE_READ` and `DIRECT_LIVE_SEND` | Eligible member, active direct segment | 30m segment idle, no blocks; no prior timeline | V2-05 / V2-06 |
| `UNREAD_DELIVER` and `UNREAD_RECOVER` | Recipient of scoped envelope and active mutual relationship | 7 days hard maximum, 15m ack recovery, no pagination | V2-06 |
| `HISTORY_READ` | Eligible viewer of active mutual relationship | Prospectively retained DIRECT message, both ongoing consents, active viewer server grant, 90d | V2-09 / V2-11 |
| `HISTORY_CONSENT` | Each eligible authenticated mutual member | Independent affirmative policy-versioned consent | V2-09 |
| `REPORT_SUBMIT` | Authenticated participant/current room or valid post-end reporter token | 7-day token; no ordinary transcript reopening | V2-07 |
| `EVIDENCE_READ` | Reviewed case-specific safety identity | Required case grant, legitimate purpose, auditable action | V2-07 |
| `BLOCK` / `UNBLOCK` | Authentic user in scope | Block immediately revokes peer access; unblock does not revive relationship | Existing + V2-05/07 |
| `PRIVACY_ACCESS` / `PRIVACY_DELETE` | Verified owner or authorized legal workflow | Free and exceptions disclosed; not history paywall | V2-13 |
| `TEST_GRANT_MANAGE` | Specifically authorized environment-limited QA staff | Audit + no client self-grant; ₹0 test only | V2-09 |

Avoid introducing routes and data models for future operations during this stage. Only the **pure decision matrix** is implemented and testable now.

## 4. Typed server-owned policy context and decision shape

### Proposed context

```js
// Design pseudocode, NOT implemented. Constructed by trusted server adapters.
authorize({
  policyVersion: "bridge-v2",
  operation: "HISTORY_READ",
  principal: {accountId, authenticationValid: true,
    status: "active", adultEligible: true, safetyEligible: true},
  target: {kind: "history_item", id, connectionId, acceptedAt,
    policyVersionAtAcceptance, prospectivelyRetained: true},
  participants: {memberLow, memberHigh, reciprocalBlock: false},
  relation: {id, state: "active"},
  consents: {memberLow: "current", memberHigh: "current",
    effectiveBeforeAcceptance: true},
  entitlement: {source: "server", scope: "history",
    active: true, expiresAt, environment: "qa"},
  serverClock: {timestamp},
  validation: {sourcesVerified: true}
})
// -> {allowed: false, code: "history_not_authorized", policyVersion: "bridge-v2"}
```

No passwords, private message bodies, raw JWTs, passphrases, account email addresses, device identifiers or report evidence enter the policy evaluator or audits.

### Contract

- `authorize()` is deterministic and **does not query the database**, mutate state, emit logs, or trust remote client fields. It receives normalized facts **only from trusted server adapters**.
- Treat unrecognized operation, wrong resource kind, missing field, stale/unknown state, missing server clock or absent consent as **DENY**. It must not throw uncaught errors containing PII.
- Decision object is `{allow: boolean, code: stableCode, policyVersion: "bridge-v2"}` with no private payload.
- Resource/identity mismatch returns a safe *indistinguishable* not-found on public resource APIs (separate HTTP mapping). Auth failures remain 401; an authenticated user's own ineligible state may be 403. State conflicts can use 409 only when doing so doesn't reveal existence of someone else's resource.
- Keep `TEST` grants only in explicitly QA-scoped trusted context; **never** infer premium from paid-looking client tokens/Flutter booleans. The full entitlement receipt system belongs later.
- The final enforcement adapter must query and lock authoritative PostgreSQL records **inside the same transaction** as the protected action (V2-03–V2-06). A previously computed `allow` is not a durable capability across a race.
- Policies are versioned; old clients cannot select an old policy that permits a historical-read bypass.
- If source facts are incomplete, default DENY for protected operations while preserving lawful user privacy/report intake through separate scoped routes, not a privileged bypass.

## 5. Threat model and negative acceptance tests

| Test ID | Attack / failure | Expected contract | Future runtime proof |
|---|---|---|---|
| P-001 | Missing/unknown operation or incomplete context | Deterministic DENY; no error leaks | V2-02 pure module |
| P-002 | Non-active, underage, ineligible user | No discover, send, Keep or future reconnect | V2-02, V2-13 |
| P-003 | Outsider guesses conversation/connection ID | No peer data, body, events or identifier existence disclosure | V2-02, V2-11 |
| P-004 | Either direction of block, mutual relationship ended | No future chat, unread or history | V2-02, V2-05/06/09 |
| P-005 | At `now == idleExpiresAt`, worker stopped | RANDOM and DIRECT LIVE denied | V2-04/05 |
| P-006 | Stale second Keep after End/expiry/withdraw | Cannot create mutual connection | V2-05 |
| P-007 | Wrong resource kind or previous session ID | No random-to-direct transcript replay | V2-05/06 |
| P-008 | Unread envelope sent to wrong recipient | Deny even if sender/friend knows its ID | V2-06 |
| P-009 | Unread older than 7d, ack recovery older than 15m | Deny independent of delayed cleanup | V2-06 |
| P-010 | Client `isPremium=true`, forged scope, or non-QA grant | No retained-history access | V2-09 |
| P-011 | Only one retention consent / consent given after message | No history retention/read | V2-09 |
| P-012 | Consents revoked, refund/expiry, 90d history elapsed | Immediate deny despite physical body remaining | V2-09 |
| P-013 | Expired/outsider report token; reported user tries viewing evidence | Deny; no premium moderator role | V2-07 |
| P-014 | Report within 7d but normal body already purged at 24h | Intake allowed where authorized; no falsely recovered body | V2-07/08 |
| P-015 | V1 generic message endpoint remains reachable after cutover | Deny historical reads across old and new endpoints | V2-11 hard gate |
| P-016 | Stale token, re-login, alternate device, SSE stream | Recheck authority and resource state; no privilege retention | V2-02, V2-11/13 |
| P-017 | Old synthetic QA conversation has no deadline | Not grandfathered into destructive expiry by this stage | V2-03 migration |
| P-018 | Unauthorized/privileged direct DB role uses bypass-RLS | Rejected role design and recorded security blocker | V2-02 review, later grant migration |

**Acceptance requirement:** at least one positive and one negative pure evaluator test per scoped operation, plus P-001–P-018 explicit fixtures. Compare new policy outcomes with V2-01 CT-001–CT-016, but do not equate V2-01 test oracle with actual deployed enforcement. Mutation tests: turn one permission fact false at a time; prove ALL sensitive grants fail closed.

## 6. Existing QA authentication compatibility

Current `/internal/lab/login` uses two synthetic cloud QA handles, 30m RS256 JWT, and an in-memory Android bearer. This stage does **not** alter lab login, allow public registration, claim adult verification, change token lifetime, rotate signing keys, enable persistent production sessions or add costs.

Current `http.mjs` performs JWT verification before non-login routes, and `live.mjs` reauthorizes SSE at connection/heartbeat/publication. Preserve these working boundaries until a separately approved V2 route cutover; V2-02's new policy module is **inactive** until that gate.

Existing `bridge_accounts.age_verified_at` on seeded testers is a synthetic QA gate, not proof of age verification for any public user. Keep operational trust-and-safety requirements in V2-13.

## 7. SQL runtime role inspection, least-privilege plan — READ-ONLY DOCUMENTATION ONLY

Checked-in migrations enable RLS on all 20 tables. Prior private Neon read-only inspection saw `neondb_owner` with `BYPASSRLS`; this is the **inspection identity** and must **not** be asserted to be Render's `current_user` absent direct runtime evidence.

### Required future evidence (do not execute against Neon/Render in V2-02 without separate authorization)

A single safe read-only runtime-role inspection should capture:
- `current_user`, `session_user`, `rolbypassrls`, `rolsuper`, `rolcreaterole`, `rolcreatedb`;
- applicable table grants and RLS configuration, without revealing connection URIs/passwords;
- authorized role and connection origin of the backend **without retrieving or exposing environment secrets**.

Example reviewed SQL proposal, not executed:

```sql
SELECT current_user, session_user,
       rolbypassrls, rolsuper, rolcreaterole, rolcreatedb
  FROM pg_roles WHERE rolname = current_user;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname LIKE 'bridge_%'
   AND c.relkind='r' ORDER BY c.relname;
```

### Proposed separation — implementation staged later

| Role | Allowed purpose | Must never receive |
|---|---|---|
| `bridge_migrator` | Reviewed DDL/data migration during approved change windows | Runtime customer requests, client credentials |
| `bridge_runtime` | Per-operation minimum DML for current API after grant review | `BYPASSRLS`, DDL, superuser, role grants, unrestricted evidence/history |
| `bridge_retention` | Bounded reviewed purge jobs only, scoped holds, audit | General read of all private messages, uncontrolled bulk delete |
| `bridge_case_reviewer` | Per-case, purpose-logged scoped evidence access | General account-history or premium entitlements |
| `bridge_test` | Disposable PostgreSQL CI database | Neon/Render credentials, production identities |

**V2-02 may document and test the role matrix, not modify the actual grant/connection principal.** Stage remains **security-role deployment validation OPEN** until separately approved runtime inspection and DBA migration.

## 8. CI / PR evidence requirements

**CI expected if implementation separately approved:**

1. Existing `npm test --prefix apps/api` and matching tests continue PASS.
2. Existing `npm run test:v2:contracts --prefix apps/api` continues PASS, without rewriting the V2-01 reference oracle to hide a conflict.
3. New `npm run test:policy --prefix apps/api` runs actual `src/policy` decision tests, deterministic and secret-free.
4. Existing GitHub Actions disposable PostgreSQL integration remains PASS; no live Neon connection.
5. Diff shows only approved `src/policy/*`, `tests/policy/*`, test wiring, and `docs/engineering/V2_02_SECURITY_REVIEW.md`.
6. At least P-001–P-018 mapped with test result or explicit future runtime blocker. No incomplete data ever grants access.
7. Reviewed threat model, client trust boundaries, policy version, deny codes and privacy-safe logging.
8. V2 kernel produces no new user-facing responses: **zero runtime behavior difference expected**.
9. No claim of actual least-privilege Render runtime validation unless the authorized inspection was really performed, and no R0 physical PASS inferred from CI.

**Merge status if all pass:** `V2-02 POLICY KERNEL IMPLEMENTED + CI VERIFIED; LIVE API INTEGRATION / RUNTIME ROLE / R0 DEVICE GATES OPEN`, not `V2 AUTHORIZATION RELEASED`.

## 9. Rollback and stop conditions

- **Before wiring**: revert policy module and policy CI step; production behavior never changed.
- **After future wiring** (separate PR): privacy-safe deny and forward-fix; never resurrect old broad message replay after cutover.
- Stop PR if a test grants an outsider, blocked/expired account, wrong recipient or one-consent premium viewer.
- Stop if a new dependency, role grant, schema migration, runtime route, secret read or Render deployment appears in the diff.
- Stop if development tries to auto-expire or purge the existing synthetic `legacy_qa` conversation.
- Stop if a test-only policy decision is presented as a fully operational and physically verified runtime permission system.

## 10. Signoff required before coding

**Founder approval request:** Authorize **only** V2-02's disconnected pure `apps/api/src/policy/**` kernel, policy unit/negative tests, isolated test runner/CI step and security review documentation. Do not authorize `http.mjs`, `postgres.mjs`, production database schemas/roles/grants, live Neon/Render inspection with privileged credentials, service deployment, client UI, 30-minute expiry activation, premium history, payment or public users.

After V2-02 code merges with CI evidence, re-evaluate R0 physical acceptance independently, and present **V2-03 additive schema rehearsal** for a separate founder approval.

**Review links:** [V2-01 baseline inventory](V2_BASELINE_INVENTORY.md); [V2-01 test acceptance brief](V2_01_IMPLEMENTATION_BRIEF.md); [Product V1](../product/PRODUCT_INVARIANTS_V1.md); [Architecture V2](ARCHITECTURE_V2.md).
