# Bridge V2-01 — Deterministic contract tests and migration inventory

**Stage status:** BRIEF PREPARED FOR SEPARATE FOUNDER APPROVAL; work-package order approved for planning, V2-01 test implementation NOT AUTHORIZED.  
**Prepared:** 2026-11-15. **Target baseline:** `main@3578565aa5542a52fdc2679829db6f938cc960d3`.  
**This is a planning brief, not authorization to implement source changes, run production tests, migrate data, alter deployments or create purchases.**  
**Dependencies:** Founder-approved Product Invariants V1 + Architecture V2; existing R0 real-phone/tablet acceptance evidence G0. Full 138-case What If? audit intentionally **deferred to final V2-16** by founder, not a prerequisite to this stage.

## Goal and deliverable

Provide deterministic automated contracts proving approved V2 session, permission and privacy rules **before changing any runtime architecture**. Preserve all existing M1/M2/R0 tests and lab account behavior. Package V2-01 is tests and read-only inventories only; it must not introduce a production behavior switch, schema migration, feature flags permitting unintended data, or new cost.

**Success definition:** CI reliably demonstrates the V2 *expected outcomes* as executable specifications (models/fake adapters) even when the production implementation is not yet developed. Tests that are red because implementation is absent must be clearly classified as **future implementation expectations** and kept in an isolated non-blocking contract suite until the corresponding implementation package. Existing release CI must stay green; do not weaken assertions to manufacture green status.

## One-PR acceptance contract for independent approval

**Implementation classification if separately approved:** one **test-only and documentation** PR, tentatively titled `V2-01: deterministic contract harness and read-only legacy inventory`. It may add test modules and test-runner wiring only. It must not build a parallel production policy engine and then mark the future real backend as tested.

The following are **contract assertions against isolated pure fixtures**, not proof that the current runtime enforces V2:

| Test ID | Exact logical assertion | Why it matters |
|---|---|---|
| CT-001 | Ineligible, blocked, unsupported-language, outsider attempts never receive a match or another user's room ID | BR-001–003 |
| CT-002 | Only one active random session per account; two simulated concurrent searches cannot produce two authorized slots | BR-003 |
| CT-003 | At server `t=lastAccepted+29m59s`, random send is eligible; at exactly `+30m`, it is denied | BR-004, D-01 |
| CT-004 | New unique accepted message extends idle clock; duplicate `clientMessageId`, typing, reading, polling and Keep do not | BR-004, D-01 |
| CT-005 | Back/process-recovery may rejoin same unexpired random room; ended/expired room cannot reopen | BR-005–006 |
| CT-006 | Only two active Keep votes before expiry grant one mutual relationship; withdraw/late/block/End races never create half-connections | BR-007–008 |
| CT-007 | Mutual connection enables new free direct segment; original random messages are absent and old direct segments offer no free history | BR-009–014 |
| CT-008 | Unread is **recipient only**, not generally queryable as history; access ends at seven-day expiry | D-02 |
| CT-009 | The 15-minute acknowledged-delivery recovery window expires strictly; same message cannot reappear as open-ended pagination | D-06b |
| CT-010 | Premium/test entitlement without bilateral consent at acceptance denies history; no retroactive random transcript; 90-day horizon | BR-015–018, H-01 |
| CT-011 | Revoked consent/entitlement or block immediately denies history, even when physical purge is delayed | BR-011, BR-017, H-01 |
| CT-012 | Seven-day post-end report token authorizes case intake, not ordinary transcript browsing; expired token and outsider denied | BR-019–021, D-07 |
| CT-013 | An eligible safety case can preserve scoped evidence before ordinary-body purge; reviewer without case permission is denied | BR-020–021 |
| CT-014 | Old `v1` message route, forged `premium`, guessed ID or stale token cannot bypass the intended V2 policy | BR-014, BR-024 |
| CT-015 | Synthetic `legacy_qa` fixture remains intact across **hypothetical** V2 migration mapping: 2 test accounts, 1 open random room, 4 bodies, 2 slots | BR-026, M-01 |
| CT-016 | With worker unavailable, read-time expiry/privacy policy still denies; no claim that timed deletion ran | BR-004, BR-021 |

**Evidence required for each CT-ID:** (a) immutable policy ID, (b) preconditions and deterministic clock, (c) positive and negative expected decision, (d) isolated fixture used, (e) test runner output, and (f) future V2 PR responsible for proving it against real PostgreSQL/API behavior. Where a test cannot be expressed without implementing the feature, document a future **pending integration assertion** rather than fabricating a passing green test.

**Minimum deliverable:** CT-001 through CT-016 specified in executable pure-model tests where meaningful; all remaining BR IDs mapped to future V2 implementation PRs in a machine-readable or Markdown matrix. For CT-014, the current old API is *known* to permit broad active-session message replay: record that mismatch as an explicit future V2-11 cutover blocker, not a false pass on current backend code.

**CI approach:** Keep existing Node/Flutter/PostgreSQL checks unchanged. Add a separately named **V2 contract** command using an explicit test-file list or validated Node 22-compatible glob. Contract tests can be required to pass as model specifications; backend enforcement tests only become release gates when their actual feature PR is implemented. Avoid external paid test services and no hosted QA access is required.

**Rollback/proof:** Revert the isolated test-only PR and CI command if its design is wrong; no server writes or migrations to unwind. A PASS is **CONTRACT SPEC VALIDATED**, never **V2 IMPLEMENTED / DEVICE TESTED**.

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

## Separate R0 acceptance requirement

**G0 remains OPEN.** The founder must still physically validate the existing R0 QA APK on Android phone/tablet; no fake-clock contract test, GitHub merge, or lab fixture substitutes for those results. Test-only V2-01 scope can be *planned* now; actual implementation and stage sign-off remain subject to the package's separate approval and G0 acceptance path. Protect the original QA account data; any Block/End test on the two seeded accounts requires controlled fixture procedure and Block LAST.

## Immediate next review questions

1. Is the V2-01 scoped test/contract package approved for source **test files only**, or must we finish G0 device results first?
2. Which existing QA synthetic conversations can be used in future migration rehearsals? **Default:** disposable clones only, not production/QA originals.
3. Whether CI should enforce contract harness success while runtime V2 behavior is still absent. **Recommendation:** yes for pure contract models; no for future implementation integration expectations.

**Decision record:** V2-01 implementation scope awaits separate founder authorization. All subsequent V2-02+ implementation, live schema modifications, deployment, message deletion, payments, new services and public rollout remain independently gated.
