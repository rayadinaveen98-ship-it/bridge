# Bridge V2-01 — Deterministic contract tests and migration inventory

**Stage status:** PROPOSED — for founder approval of an exact future engineering PR.  
**Prepared:** 2026-11-15. **Target baseline:** `main@3578565aa5542a52fdc2679829db6f938cc960d3`.  
**This is a planning brief, not authorization to implement source changes, run production tests, migrate data, alter deployments or create purchases.**  
**Dependencies:** Founder-approved Product Invariants V1 + Architecture V2; existing R0 real-phone/tablet acceptance evidence G0. Full 138-case What If? audit intentionally **deferred to final V2-16** by founder, not a prerequisite to this stage.

## Goal and deliverable

Provide deterministic automated contracts proving approved V2 session, permission and privacy rules **before changing any runtime architecture**. Preserve all existing M1/M2/R0 tests and lab account behavior. Package V2-01 is tests and read-only inventories only; it must not introduce a production behavior switch, schema migration, feature flags permitting unintended data, or new cost.

**Success definition:** CI reliably demonstrates the V2 *expected outcomes* as executable specifications (models/fake adapters) even when the production implementation is not yet developed. Tests that are red because implementation is absent must be clearly classified as **future implementation expectations** and kept in an isolated non-blocking contract suite until the corresponding implementation package. Existing release CI must stay green; do not weaken assertions to manufacture green status.

## Exact proposed PR boundaries

- `apps/api/tests/v2/contracts/*.test.mjs`: Node 22 `node:test` assertions covering pure state transitions and policy matrices.
- `apps/api/tests/v2/helpers/clock.mjs`: injected deterministic clock; avoid global Date monkey-patching, system changes or real `setTimeout` waits.
- `apps/api/tests/v2/helpers/accounts.mjs`: synthetic, non-identifying accounts: participant A, B, outsider C, blocked D, test-entitled E; explicit consent and eligibility fixtures.
- `apps/api/tests/v2/helpers/session_factory.mjs`: random vs mutual relationship vs direct-segment object factories; fake document/DB authorization outputs.
- `apps/api/tests/v2/access_matrix.test.mjs`: path-specific `LIVE`, `UNREAD`, `HISTORY`, `REPORT`, `EVIDENCE`, `ENTITLEMENT` decision table.
- `apps/api/tests/v2/migration_inventory.test.mjs` and `docs/engineering/V2_BASELINE_INVENTORY.md`: **read-only** schema/row expected-state and classification, with zero secrets/user message bodies in logs. No connection to live Neon inside test runner; live baseline inventory requires separate explicit permission even for read-only production-credential access.
- `apps/api/package.json` (optional): add `test:v2:contracts` script using `node --test tests/v2/**/*.test.mjs`, ensuring Node CLI glob support or use an explicit test aggregator.
- `.github/workflows/foundation.yml` (optional and reviewable): run **contracts harness only**, with existing foundation and disposable PostgreSQL checks unchanged. Do not activate unimplemented-behavior expectations as failing tests in the main gating jobs.
- `apps/mobile/test/` (test-only, optional): pure protocol/state expectations for expiry and current chat, if they can compile with present mocks without production behavior changes.

**Explicitly out of scope:** No edits to `apps/api/src/**`, `apps/mobile/lib/**`, `database/migrations/**`, `apps/api/src/start.mjs`, `docs/ROADMAP.md` historic stage statuses except separate documentation bookkeeping. No external auth provider, billing SDK, live Neon write/read scan, retention worker, UI redesign or Render deploy.

## Policy traceability matrix — required test vectors

| Case | Contract ID | Happy expectation | Negative/race expectation |
|---|---|---|---|
| Eligibility | BR-001, BR-002, BR-003 | Eligible, shared moderated language, one slot | Underage, unsupported language, duplicate search fail closed |
| Random clock | BR-004–006, D-01 | `t=29:59` open / unique message extends exactly 30m | `t=30:00` expired; read/poll/typing/Keep doesn't extend |
| Recovery | BR-005, BR-006 | Same unexpired random ID resume | Closed, expired and outsider/guessed ID denied |
| Mutual Keep | BR-007–011, D-03 | Two votes before expiry create one relationship | One/withdrawn/late Keep, End-vs-Keep and Block-vs-Keep never create partial relation |
| Direct segments | BR-009–014, D-06a | New segment with empty transcript and free send | Source random transcript never copied; old segment cannot page history |
| Unread delivery | D-02, D-06b | Per-recipient envelope at `t<7d`, 15m bounded ack recovery | `t=7d` expiry, cross-account read, `t>15m` retry denied |
| Premium | BR-015–018, D-04, H-01 | Bilateral prior consent + active grant + `t<90d` allows scoped direct history | Purchase alone, one consent, old random, expired/refunded grant, `t>=90d` all denied |
| Reporting | BR-019–022, D-05, D-07 | Eligible reporter within 7d; evidence isolated | Outsider, revoked token, post-purge body unavailable, reviewer without role denied |
| Privilege boundary | BR-014, BR-024, BR-026 | Server-owned scope and policy version | Forged premium/consent, old endpoint, stale client, owner-role RLS assumptions |
| Legacy safety | M-01, BR-026 | `legacy_qa` room and four messages unchanged in hypothetical migration | No implicit timer backfill, physical deletion or auto-rotation |

## CI and proof requirements

Existing CI topology:
- `.github/workflows/foundation.yml`: Node 22, matching and HTTP tests, PostgreSQL **16** in disposable `bridge_test` and applied migration 0001–0003.
- `apps/api/package.json`: `npm test --prefix apps/api` executes `node --test tests/*.test.mjs`; **nested `tests/v2` is not run by this pattern** without an explicit separate command.
- `.github/workflows/android-internal.yml`: Flutter static analysis, existing widget/protocol tests, debug APK.
- `.github/workflows/cloud-qa-android.yml`: main-branch Android modifications trigger Cloud APK and hosted auth/health checks, no need to change it for V2-01 tests.
- `apps/api/tests/postgres.integration.test.mjs`: currently checks loopback `bridge_test` before executing destructive fixtures. Preserve this protection; V2-01 must not use live QA for tests.

**Pass gate:** (a) unchanged foundation suite PASS, (b) new pure policy contract fixture tests PASS when run explicitly, (c) no live runtime/schema delta, (d) each BR policy has an indexed contract case or is marked to its owning later PR with documented blocker, (e) test seed and fake times reproducible, (f) no secret or message body logged.

**Expected failing future tests:** Keep them as explicitly isolated, documented executable expectations for V2-02–V2-12, not as broken current CI. Once relevant production code is delivered, replace adapter/fakes with actual implementation integration and add hard required CI gates. This avoids claiming unimplemented features pass because a mock was tested.

## G0 physical device evidence (still separate)

Before promoting V2-01 engineering stage as implementation-approved, record actual R0 Android phone/tablet status: login, server restore, Back/Resume, original four-message continuity, lost-network replay and report acknowledgment; mutual Keep/End tests only in a controlled fixture plan because they mutate the original pair, and **Block LAST**. If R0 is not device-accepted, V2-01 planning may proceed but implementation exit cannot be labelled fully validated.

## Exact PR exit and rollback

Future implementation PR title: `V2-01: deterministic contract harness and read-only legacy inventory`.  
Approval covers only the test/doc paths above and optional test-script/CI addition explicitly reviewed.  
Rollback: straightforward revert of test-only branch/CI script; no migrations, API behavior change, data reset or deployed service.  
If tests report inconsistent assumptions, stop and bring a founder-visible product-decision issue, not a silent policy change.

## Immediate next review questions

1. Is the V2-01 scoped test/contract package approved for source **test files only**, or must we finish G0 device results first?
2. Which existing QA synthetic conversations can be used in future migration rehearsals? **Default:** disposable clones only, not production/QA originals.
3. Whether CI should enforce contract harness success while runtime V2 behavior is still absent. **Recommendation:** yes for pure contract models; no for future implementation integration expectations.

**Decision record:** V2-01 implementation scope awaits separate founder authorization. All subsequent V2-02+ implementation, live schema modifications, deployment, message deletion, payments, new services and public rollout remain independently gated.
