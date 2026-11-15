# Bridge V2-01 — checked-in baseline and contract evidence

**Status:** TEST-ONLY CONTRACT INVENTORY; **no production V2 implementation**.  
**Captured against:** `main@5b54ff9a038a3ec3f6ee9f5a9d25c35a96ff54c4` (DOC-00 merged), on 2026-11-15.  
**Approved test-only scope:** [V2-01 implementation brief](V2_01_IMPLEMENTATION_BRIEF.md).  
**Policy source:** [BR-001–BR-029](../product/PRODUCT_INVARIANTS_V1.md); [Architecture V2](ARCHITECTURE_V2.md).  
**Data access:** No fresh live Neon query was performed for this package; no database changes, deployments, user-account actions, message reads, billing or payment calls.

## 1. What the test suite actually proves

`npm run test:v2:contracts --prefix apps/api` runs **pure test-only reference predicates**, synthetic accounts, deterministic clocks, and **read-only checked-in SQL text inspection**. The reference oracle is at `apps/api/tests/v2/helpers/reference_contract.mjs`, not in production `apps/api/src`. No production module imports it.

**PASS means only: PRODUCT CONTRACT SPECIFICATION IS EXECUTABLE AND INTERNALLY CONSISTENT.** It is **not** proof that the existing Node API or PostgreSQL enforces V2. Runtime authorization must be tested against actual services as each V2-02–V2-12 package is later implemented.

Do not combine this test count with production/backend integration coverage or claim real hardware acceptance.

## 2. Existing schema: static source inventory, not live DB introspection

The existing three committed migrations are:

| Migration | Function | Current status in repository |
|---|---|---|
| `0001_bridge_foundation.sql` | Accounts, profiles, languages/preferences, bidirectional blocks, match queue/sessions/slots, conversations/messages, Keep votes/connections, reports, audit/privacy requests | Existing migration source; already exercised in disposable CI PostgreSQL, original header claiming `NOT APPLIED` is historical |
| `0002_message_outbox.sql` | Durable body-free message notification outbox | Existing migration, single-node outbox |
| `0003_lab_credentials.sql` | Synthetic tester handle and scrypt passphrase hashes | Lab-only; not public authentication |

The **20 declared Bridge tables** (static SQL inspection only):

- Identity/preferences: `bridge_accounts`, `bridge_profiles`, `bridge_supported_languages`, `bridge_account_languages`, `bridge_preferences`.
- Matching: `bridge_blocks`, `bridge_match_queue`, `bridge_match_sessions`, `bridge_active_match_slots`.
- Chat/connection: `bridge_conversations`, `bridge_conversation_participants`, `bridge_messages`, `bridge_connection_votes`, `bridge_connections`.
- Safety/privacy: `bridge_reports`, `bridge_enforcement_actions`, `bridge_audit_events`, `bridge_privacy_requests`.
- Reliability/lab: `bridge_event_outbox`, `bridge_lab_credentials`.

The committed SQL contains `ENABLE ROW LEVEL SECURITY` for each table, but **no customer-safe entitlement, payload split, unread envelope, history consent, evidence or deletion policy schema**. Do not infer that merely enabling RLS without reviewed grants/policies makes the privileged service safe; an earlier read-only Neon inspection found privileged `neondb_owner` able to bypass RLS. The actual Render DB role still needs explicit, safeguarded verification in V2-02.

Legacy `bridge_messages` has a direct `body text` column; `bridge_conversations` has `kind='random'|'connection'`. Current `castVote()` changes the original conversation kind in place rather than starting a new direct segment. The `lease_expires_at` on `bridge_match_sessions` is the initial reservation lease, **not** the V2 chat idle clock.

## 3. Last observed synthetic QA counts — historical evidence only

The previous read-only QA snapshot on 2026-11-15 showed:

| Record category | Last observed |
|---|---:|
| Synthetic accounts | 2 |
| Original open random conversation | 1 |
| Existing messages | 4 |
| Active match slots | 2 |
| Saved mutual connections | 0 |

**Do not treat this as a new verification.** The V2-01 contract test uses a separate in-memory fixture with the same counts; it does **not** load, change or verify live user data. Existing seeded chat is protected under approved M-01 legacy migration design. Any later live QA inventory/migration requires independent scope and protective rehearsals.

## 4. Test traceability, owners and known gaps

| Contract ID | Focus | Pure reference test | Real enforcement owner |
|---|---|---|---|
| CT-001 | Eligibility / shared moderated language | `contracts/lifecycle.test.mjs` | V2-02, V2-04, V2-13 |
| CT-002 | One match slot per account | lifecycle | V2-04 DB concurrency |
| CT-003 | 29:59 vs 30:00 expiry | lifecycle | V2-04 |
| CT-004 | Unique accepted ID resets timer only | lifecycle | V2-04 / V2-06 |
| CT-005 | Authorized current-session recovery | lifecycle | V2-04 / V2-11 |
| CT-006 | Two Keep votes, expiry/End/block precedence | lifecycle | V2-05 |
| CT-007 | Fresh free direct segment, no random copy | lifecycle | V2-05 / V2-06 |
| CT-008 | 7-day recipient-scoped unread | `contracts/retention.test.mjs` | V2-06 |
| CT-009 | 15-minute acknowledgment retry | retention | V2-06 |
| CT-010 | Prospective bilateral history and QA test grant | retention | V2-09 |
| CT-011 | Block/withdrawal/revocation immediately deny | retention | V2-02 / V2-09 |
| CT-012 | Post-end report token, no transcript reopening | retention | V2-07 |
| CT-013 | Evidence snapshot and reviewer role | retention | V2-07 / V2-08 |
| CT-014 | Legacy v1/forged premium/history access denied | retention | V2-02 / **V2-11 privacy cutover** |
| CT-015 | Non-destructive QA legacy fixture mapping | retention | V2-03 / V2-12 |
| CT-016 | Read-time expiry works if worker stops | retention | V2-04 / V2-08 |
| AM-001 | LIVE/UNREAD/HISTORY matrix | `access_matrix.test.mjs` | V2-02 / V2-06 / V2-09 / V2-11 |
| INV-001 | 20 table names, RLS statements and known schema gaps | `migration_inventory.test.mjs` | V2-02 / V2-03 |

**Explicit known runtime failures versus V2 target (not fixed by this PR):**
1. Active random room has no V2 30-minute idle deadline.
2. Two Keep votes currently mutate source random `kind` to persistent `connection`, retaining original message stream.
3. Broad generic `GET /v1/conversations/:id/messages` still permits message replay during an open session, without V2 free/premium read scope.
4. Test JWT expires after 30 minutes and is in volatile memory; automatic production auth/session renewal is not built.
5. No actual evidence snapshot, 7-day unread envelope, entitlement ledger, consented history, retention worker, or prod-safe moderation operation is built.
6. Existing R0 APK physical phone/tablet acceptance remains **OPEN**.

## 5. Executable negative assertions and test limitations

- A client-supplied `premium` flag must never grant HISTORY; a server grant without both active consents still denies.
- User A cannot fetch B's unread envelope or outsider messages by guessing IDs.
- A blocked or expired random session cannot be resumed by returning to the app.
- Duplicate retry of accepted message does not reset inactivity and must not create another body.
- At `now >=` expiry, read-time denial is mandatory even if an expiry sweeper hasn't run.
- A report token does not grant ordinary message history; evidence review is case-specific.
- A reference model cannot prove transaction serialization, encryption, actual SQL role isolation, network SSE ordering or device/OS lifecycle. Those stay **future integration/physical tests**.

## 6. CI implementation and rollback

- Existing script `npm test --prefix apps/api` remains unmodified (top-level `tests/*.test.mjs` only).
- New named command `npm run test:v2:contracts --prefix apps/api` uses **four explicit Node 22 test paths** instead of a shell-dependent recursive glob.
- Existing `Foundation checks` workflow adds a separate step `V2-01 reference-contract tests (NOT runtime enforcement)`; existing matching, HTTP/PostgreSQL, tokens and Flutter jobs stay unaltered.
- No `apps/api/src/**`, `apps/mobile/lib/**` or `database/migrations/**` edits.
- Roll back by reverting this isolated test/CI PR. There is no DB rollback or live data to restore.
- Do not merge if baseline CI fails, docs incorrectly imply feature implementation or test imports production secrets/QA DB access.

## 7. Milestone status

| Milestone | Status |
|---|---|
| DOC-00 Product V1 / Architecture V2 documentation | MERGED / APPROVED FOR PLANNING |
| V2-01 test-only code package | **UNDER TEST** — source/CI evidence required |
| R0 real phone/tablet acceptance | **OPEN** |
| V2-02 through V2-15 runtime implementation | NOT AUTHORIZED |
| Exhaustive 138-case What If? review V2-16 | DEFERRED TO FINAL STAGE |
| Public beta, real payments, destructive retention | NOT APPROVED |

If V2-01 passes automated CI, mark only `CONTRACT SPEC TESTED`; do not infer R0 acceptance or authorize follow-on implementation automatically.
