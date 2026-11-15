# Bridge V2-02 — Central Policy Security Review and Evidence Register

**Status:** V2-02 implementation branch — not a live authorization deployment.  
**Approved source:** [V2-02 implementation brief](V2_02_IMPLEMENTATION_BRIEF.md) in docs-only merged PR #17.  
**Source baseline:** `main@528496aed9d1ddb695ef5a56f8a4ed6ac62d1006`; no application runtime behavior change is authorized.  
**Product authority:** [BR-001–BR-029, D-01–D-07, H-01 and M-01](../product/PRODUCT_INVARIANTS_V1.md); [Architecture V2](ARCHITECTURE_V2.md).  
**Companion V2-01 suite:** `npm run test:v2:contracts --prefix apps/api` remains **reference-contract only**.

## 1. What V2-02 implements — and what it absolutely does not

- `apps/api/src/policy/operations.mjs` defines **22** explicit V2 policy operations and stable decision codes. No wildcard, `ADMIN` or `ALL_MESSAGES` permission.
- `apps/api/src/policy/context.mjs` copies and freezes only expected context facts, excluding message bodies, raw tokens, secrets, client premium flags and user-generated report evidence.
- `apps/api/src/policy/authorize.mjs` is an **inactive, deterministic, default-deny** evaluator. It returns only frozen `{allow,code,policyVersion}` and has no network, SQL, filesystem, logging or mutating effects.
- `apps/api/tests/policy/policy.test.mjs` tests the **actual production-intended evaluator** across positive and negative examples for each named operation, not a mock oracle.
- `apps/api/tests/policy/security.test.mjs` covers P-001–P-018 attack and boundary scenarios to the extent expressible without actual HTTP, DB or payment integrations.
- `apps/api/package.json` adds a named `test:policy` script; `.github/workflows/foundation.yml` adds a clearly labeled policy test step. Original matching, HTTP/auth, V2-01 contracts, PostgreSQL and Android build workflows are not weakened.
- This package **does not import the new module from `http.mjs`, `postgres.mjs`, `start.mjs` or `live.mjs`**, so existing synthetic QA behavior is unchanged.

**Security boundary:** `validation.origin="trusted_server"` and `sourcesVerified=true` are contractual markers, **not security protections against forged caller JSON**. A future trusted server adapter must obtain all facts from authoritative identity/database, produce these markers internally and NEVER pass untrusted request bodies directly to the kernel. A passing policy test is not evidence that the currently deployed API enforces V2.

## 2. Trust boundaries and fail-closed policies

| Boundary | V2-02 pure model | Remaining runtime gate |
|---|---|---|
| Identity | `authenticationValid` and account identity required; no token data passed | RS256 verification, revocable device sessions and JWT expiry remain in actual HTTP/auth |
| Eligibility | Active account, explicit adult eligibility, safety readiness, policy acceptance for social interaction | Real adult assurance and terms proof require V2-13; synthetic `age_verified_at` is not genuine verification |
| Matching | Shared moderated language and free active slot | DB row locks and fairness/one-slot serialization in V2-04 |
| Random/direct | Current participant, allowed peer, no bilateral block, explicit session kind and exclusive 30-minute expiry | DB time and row locks inside V2-04/05/06 transactions; no expiry schema currently |
| Connection | Explicit mutual relationship; access does not confer history | Two distinct Keep votes, no in-place random transcript conversion in V2-05 |
| Unread delivery | Recipient-only, seven days; acknowledgment recovery 15 minutes | Real envelope IDs, replay tokens, atomic claims in V2-06 |
| History | Direct messages only, prospectively retained, BOTH valid consents, viewer QA server grant and 90-day ceiling | Consent/entitlement tables in V2-09; old v1 endpoint lockdown in V2-11 |
| Reporting | Participant-based active report, or seven-day verified post-end report token | Token minting, case evidence isolation, throttling and human operations V2-07/13 |
| Evidence | Case-bound reviewer identity, scope and purpose | Reviewer provisioning/audit, audited evidence record access V2-07 |
| Privacy/safety | Authenticated ownership for privacy, separate block/report permissions even if chat-ineligible | Verified privacy workflow, incident response and account recovery V2-13 |
| Test grants | Trusted `qa` runtime and QA-admin identity, logged-action prerequisite model | Server grant tooling/audit V2-09; no test grant activated here |
| App compatibility | No `ALL_MESSAGES` privilege from policy operation enum | Current `GET /v1/conversations/:id/messages` remains **a blocking risk at V2-11**, no V2 route safe-read cutover yet |

### Source completeness

- An omitted, null or malformed actor/operation, unknown/unsupported operation or clock, missing peer/membership, unknown session kind, missing consent or untrusted entitlement **cannot create an allow decision**.
- Public routing must later map cross-user denial and unknown resource to indistinguishable 404-style outcomes, with separate 401 for invalid sessions and restricted 403 for own eligibility. No HTTP status changes are implemented here.
- User-facing rights to report, block, request privacy or withdraw consent are **separate** from permission to continue chatting: a blocked or restricted but authenticated participant can still seek appropriate safety/redress. These operations do not return chat data.
- Normalization strips untrusted extra fields rather than logging them. The evaluator never receives or returns body text.
- Decision `allow` is a **point-in-time advisory result**; authorization MUST be repeated on DB-locked state at the action's commit point in later stages.

### Two caveats for later API integration

1. The pure policy checks **trustworthiness of supplied facts only by contract**; a forged source marker inside an HTTP body would not be safe. A separate adapter must be written and tested during later API integration.
2. An attacker may cause timing races between `authorize()` and a DB write (End vs Keep, block vs send, token expiry vs read); policy must execute under the actual transaction after acquiring necessary locks. **Current V2-02 cannot claim resistance to these races.**

## 3. Threat coverage P-001–P-018

| ID | Pure policy evidence | Actual integration still required |
|---|---|---|
| P-001 | Unknown operation, invalid source, clock and missing context deny | HTTP input cannot forge trusted context |
| P-002 | Deny underage/restricted/suspended/unsupported language | Production adult assurance and actual DB fact provenance |
| P-003 | Deny outsider/guessed room, relation and account-owned views | API safe 404/endpoint and SSE scoping |
| P-004 | Two-way blocks, peer suspension and revoked mutuals deny | DB transactional block order |
| P-005 | Exact 29:59.999 allowed / 30:00 denied for both types | DB clock and async cleanup resilience |
| P-006 | Ended/expired random cannot Keep | Two votes + withdrawal/End/Keep SQL concurrency |
| P-007 | Cross-kind/direct/source IDs rejected | Immutability and source transcript separation |
| P-008 | Wrong unread recipient and connection rejected | Envelope DB row/claim/replay |
| P-009 | 7d unread and 15m recovery hard boundary | Ack nonce verification and recipient binding |
| P-010 | Forged client premium, non-QA entitlement and wrong scope deny | Server grant audit and payment receipt integration deferred |
| P-011 | Only one/late/wrong-policy consent denies | Prospective persistence and bilateral consent transaction |
| P-012 | Revoked grants/consents, block and 90-day cutoff deny | Database invalidation and data-deletion schedule |
| P-013 | Expired/outsider report token, wrong case reviewer rejected | Case/token creation and reviewer logs |
| P-014 | Reporting at two days permitted without a body exposure | Actual message purge and safety snapshot preservation |
| P-015 | Unknown old-style history permission denied in kernel | **Old actual v1 message API is NOT FIXED; V2-11** |
| P-016 | Expired auth, missing trusted source and revoked reviewer deny | Real JWT/device/stream refresh & revalidation |
| P-017 | Missing V2 expiry cannot grant random live access | M-01 legacy exemption and actual QA data preservation in future migration |
| P-018 | Reviewer vs QA-admin role and case scope cannot conflate | **Actual Render runtime DB role unknown; live grant inspection NOT done** |

P-006, P-014, P-015, P-016, P-017 and P-018 are **PARTIALLY MODEL-TESTED / INTEGRATION OPEN**. Never mark their actual security acceptance complete from the test counts alone.

## 4. Proposed least-privilege DB role matrix — DOCUMENTATION ONLY

Earlier read-only Neon inspection through the inspection credential reported `neondb_owner` with `BYPASSRLS`. This **does not prove Render's runtime uses that principal**; live verification is pending separate permission.

| Proposed role | Allowed scope | Explicit denial |
|---|---|---|
| `bridge_runtime` | Minimum reviewed queries under trusted service and narrowly scoped grants | No DDL, `BYPASSRLS`, raw evidence browse, unrestricted history |
| `bridge_migrator` | Approved additive schema maintenance in an isolated window | No normal user request handling |
| `bridge_retention` | Reviewed batch cleanup with case/hold exclusions | No arbitrary purge or general private-content browse |
| `bridge_case_reviewer` | Assigned case evidence, purpose logged | No admin wildcard, no premium history |
| `bridge_test` | Local/disposable PostgreSQL CI fixtures | No Neon/Render credentials or production data |

**Safe future read-only inspection plan, not executed:**
```sql
SELECT current_user, session_user, rolbypassrls, rolsuper,
       rolcreaterole, rolcreatedb
FROM pg_roles WHERE rolname = current_user;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname LIKE 'bridge_%' ORDER BY c.relname;
```
Avoid outputting credentials, connection strings or private bodies. DBA/security review required before any actual role creation, privilege change or runtime credential rotation.

## 5. Required CI and release evidence

| Claim | Required proof |
|---|---|
| New policy kernel committed | Exact commit/PR and only whitelisted paths |
| Test suite passed | `npm run test:policy --prefix apps/api` Node 22 unit/negative results |
| Existing M1/M2/R0 tests still green | Original `npm test --prefix apps/api` and disposable PostgreSQL CI |
| V2-01 reference contracts still green | `npm run test:v2:contracts --prefix apps/api` unchanged |
| No runtime integration | Diff verification: no `http.mjs`, `postgres.mjs`, `start.mjs`, `live.mjs`, `apps/mobile`, SQL migrations, deployment or billing changes |
| No live data changes | No Neon/Render, mutation, role inspection, payment or real-user tools called for this work |
| R0 physical verification | Still OPEN, independent test gate |
| V2-03 authorization | **NOT GRANTED**; separate founder review |

**Rollback:** Revert the isolated policy/test/CI PR; the live backend is unchanged. If a test fails or policy grants a wrong resource, block merge and fix the branch before any next-stage work. Future after API integration: rollback must never restore the legacy unrestricted history endpoint after privacy-safe cutover.

## 6. Known limitations and next governance step

- Persistent authenticated sign-in, actual account recovery, genuine age assurance and incident staffing remain incomplete.
- V2-02 is **not** the V2-04 expiry feature nor V2-05 Keep relationship migration nor V2-06 unread service nor V2-09 prospective history.
- R0 phone/tablet acceptance cannot be inferred from automated tests.
- The 138-case exhaustive What If? experience audit remains final V2-16, while all approved P0 invariants receive their own earlier integration tests.
- Any future **V2-03 schema migration rehearsal** requires its own founder approval and must not touch Neon until specifically authorized.

**Change log:** Created on a V2-02 source branch. Test results/merge status should be recorded only after GitHub CI verifies the exact commit.
