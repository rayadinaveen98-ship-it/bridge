# Delivery roadmap and quality gates

## Completed: discovery and prototype
- Product thesis, competition/business risk review and rough economics.
- V1 product boundary, journey and 18-screen offline interaction prototype.
- Simulated match/chat/mutual-connect/report/blocked-demo flows.
- Proposed cross-language equality requirement (no preset language; user-selected shared language matching).
- Preliminary desktop/mobile prototype checks were reported in the original workflow. These are *not* a substitute for an independently reproducible repository CI run.

## Foundation progress — 2026-10-23
- Added candidate light/dark semantic design tokens and screen-state/component specification.
- Added unit-testable language-neutral matching eligibility and candidate ranking module.
- Added proposed PostgreSQL relational schema, API paths, messaging state contracts and fail-closed RLS baseline.
- Added lightweight CI checks; tests validate logic/static contracts only, not deployment or data-security compliance.
- All work committed on `main`; neither API nor production app is running.

## Phase 3 — validate design and decisions
- Review flows on mobile with real consenting adult research participants (without hosting live stranger chat).
- Validate error, empty, loading, keyboard, smaller-display, screen-reader, light/dark and RTL states.
- Verify legal exposure, app-store policies and age assurance approach.
- Finalize architecture acceptance criteria, privacy data map and moderation operating model.

## Backend engineering update — 2026-10-23
- Added RS256 authenticated loopback-only HTTP routes with strict request validation and basic in-process laboratory quotas.
- Implemented SQL transaction-backed queue matching, durable message sequencing/idempotency, double-opt-in connections, blocking and report intake.
- Added isolated PostgreSQL 16 integration tests to GitHub Actions and dependency-free fake-Postgres/HTTP tests.
- **Not deployed**. No operational age assurance, live human moderation or public user onboarding.
- PostgreSQL migration and scoped concurrency tests have been verified in GitHub Actions; load, penetration and production environment testing remain.

## M1 durability checkpoint — 2026-10-23
- [PR #1](https://github.com/rayadinaveen98-ship-it/bridge/pull/1) merged; added transactional outbox, retryable claim/ack dispatcher, unit and real Postgres tests.
- **Both GitHub Actions jobs passed** in [run 39931219488](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488), including migrations 0001+0002 and an explicit non-owner role RLS visibility test.
- No real-time network publisher, background delivery worker, mobile app, age-assurance provider or live moderation deployed yet.

## M1 internal live-delivery checkpoint — 2026-10-23
- [PR #2](https://github.com/rayadinaveen98-ship-it/bridge/pull/2) merged: authenticated SSE notifications, a single-process outbox poller, participant/block checks before delivery, JWT expiry rechecks, and durable REST replay.
- **Both GitHub Actions jobs passed** in [run 39934866721](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39934866721), including real PostgreSQL outbox-to-two-subscriber delivery, outsider rejection, block revocation, and disconnect/replay checks.
- No Android APK, public deployment, cross-node event broker, real age-assurance provider or staffed human moderation yet. Transport is loopback-only.
- Next engineering slice: minimal Flutter internal test client that connects over HTTP/SSE to a dedicated trusted lab backend; do not confuse test accounts with public adult age verification.

## Phase 4 — backend foundation
- Accounts, privacy controls, authentication sessions and abuse limits.
- Schema migrations, transactional matching state machine and message persistence.
- Strict authorization for all conversation and mutual-connection operations.
- Report queue, reviewer roles, audit logging, retention and deletion functionality.

## Android M1 internal build checkpoint — 2026-10-23
- [PR #3](https://github.com/rayadinaveen98-ship-it/bridge/pull/3) merged: Flutter Android client, unranked language choices, matchmaking, chat, SSE replay, mutual connections, report/block controls, debug-only loopback traffic policy.
- [Android Actions run 39937613672](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39937613672) passed Flutter analysis, protocol/widget tests and debug APK build/upload.
- APK artifact is a short-lived internal test binary, not a production release.
- **Not yet verified:** two physical devices exchanging messages; server age assurance, human moderation, push, encrypted cursor persistence, distributed streaming.
- Next: provision a dedicated synthetic test lab and run two physical-device M1 acceptance tests.

## Phase 5 — Android M1
- Flutter app on two physical Android devices.
- A real compatible match; ordered durable messages; reconnect; end and block; mutual save.
- Working server-side safety actions, not simulated dialogs.

## Internal test-login update — 2026-10-23
- Replaced the manual JWT field in the Flutter lab app with local test-account handle and passphrase.
- Added opt-in backend login, salted-scrypt credential hashing, 30-minute signed token exchange, per-handle local throttling and a synthetic local account provisioner.
- No connected Bridge Supabase project or live hosted API exists; do not reuse other app databases.
- **Validated in GitHub Actions:** [Flutter analysis/widget tests and debug APK](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39942130635) and [Node/PostgreSQL 16 login tests](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39942130666) both passed. Source merged in [PR #4](https://github.com/rayadinaveen98-ship-it/bridge/pull/4). These do not constitute production security certification.
- Before real two-device use: provision a dedicated test backend and verify device/ADB connectivity. Public chat remains disabled.

## Phase 6 — test and security gate
- Unit/integration/e2e tests and load testing; security and privacy assessment.
- Age-assurance, moderation staffing, user support and legal/policy readiness.
- No public stranger matching without practical live safety response.

## Phase 7 — invite-only adult beta and decision gate
- Measure real matching time, conversation quality, day-1/day-7 retention, mutual connections, reports and moderator time.
- Expand only if verified safety and unit economics support expansion.

## Explicitly outside M1
- Public feeds, video/voice calls, virtual gift economy, unlimited group rooms, iOS release commitments, AI impersonation, fake online users.

## Progress claims
Prototype complete ≠ production implementation. Unverified revenue figures and performance goals are hypotheses, not validated results.


## M2 connection safety hardening — 2026-10-23

[PR #6](https://github.com/rayadinaveen98-ship-it/bridge/pull/6) merged. [Foundation CI run 39954995708](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39954995708) passed both matching and real PostgreSQL 16 integration jobs. Newly tested: two-sided mutual connection while chat is open, connection persistence, offline replay from sequence cursor, closed-chat vote/read refusal, blocking access revocation and prevention of re-matching that pair. Ineligible/closed peer connections are filtered from list results.

**Live-device status:** operator-confirmed two-account Android<->Windows message delivery; mutual-connection UI, actual USB interruption/resume and on-device block flow still await the operator's manual QA. Running local backend must be restarted after git pull to pick up these server changes. The existing M2 APK is unchanged. No public release.


## M2 Android replay repair and QA handoff — 2026-11-14

- [PR #7](https://github.com/rayadinaveen98-ship-it/bridge/pull/7) **merged** at commit `fe618119`: the Android controller now verifies contiguous replay, rejects gaps/conflicts without advancing the cursor, and ignores stale in-flight responses from a closed/switched conversation.
- Seven Flutter replay regression tests, static analysis, and Android debug compilation **passed** in [PR CI 43599109135](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43599109135). Backend/PostgreSQL CI **passed** on [main 43599576368](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43599576368).
- **M2 acceptance remains OPEN:** confirm mutual Keep on Android, USB disconnect/replay with exactly-once display, report acknowledgment, block denial/no-rematch, and expired-session handling. Only the earlier synthetic Android ↔ Windows message exchange has operator-reported evidence.
- **M3 remains unstarted**; do not confuse debug APK compilation with physical device acceptance or public launch.


## M2.5 private cloud phone + tablet testing — operator acceptance (2026-11-14)

- **IMPLEMENTED + MERGED:** Cloud QA hosted mode [PR #9](https://github.com/rayadinaveen98-ship-it/bridge/pull/9), cloud-targeted Android APK CI [PR #10](https://github.com/rayadinaveen98-ship-it/bridge/pull/10), sign-in correctness self-check and Android passphrase input guidance [PR #11](https://github.com/rayadinaveen98-ship-it/bridge/pull/11), latest source `cf093d33`.
- **DEPLOYED:** Render Free Node service in Singapore with manually controlled deploys (auto-deploy OFF); dedicated Neon Free PostgreSQL 18 project with Bridge's 20 RLS-enabled tables. Hosted health + unauthenticated access-boundary smoke checks passed in cloud APK CI.
- **DEVICE OPERATOR-REPORTED PASS:** Both Android phone and Android tablet installed the cloud build, signed in using the two synthetic accounts, and successfully exchanged messages. This is an initial functional confirmation, **not** full M2 acceptance.
- **PENDING M2 DEVICE ACCEPTANCE:** Verify mutual Keep and reconnect, lost-network/replay ordering and no duplication, report acknowledgment, block denial/no re-match (last), and expired-session UX on the two Android devices. Record the exact tested build, date and devices.
- **PENDING M3 RELIABILITY:** Automatic session renewal/revocation, secure persistence of message cursor, durable background recovery and predictable retries; do not claim these features implemented.
- **PROPOSED product/quality gate following M2/M3:** Premium end-to-end UX visual consistency and accessibility review; trust & safety, age assurance and moderation operations must be designed and independently validated **before** any real users or public beta. No release date approved.
- **DELIVERY PROCESS:** Mobile changes merged after CI yield the cloud APK artifact via [Bridge cloud QA debug APK workflow](https://github.com/rayadinaveen98-ship-it/bridge/actions/workflows/cloud-qa-android.yml) (7-day expiry). Backend-only changes require manual Render redeploy after checks; old app and new backend must be compatible. Distribution improvements and stable signing are pending; do not promise a permanently accessible install URL or silent updates.

Read [two-device QA guide](engineering/TWO_DEVICE_QA.md) for repeatable operator steps and version recording. Existing local-lab QA remains an optional engineering fallback, not a required user testing step.

## R0 — Lifecycle stabilization (approved to start 2026-11-15; current development)

**Scope-approved R0, implementation under review; device sign-off remains OPEN.** See [R0 lifecycle acceptance](engineering/R0_LIFECYCLE_ACCEPTANCE.md).

- Existing active random chats need an explicit `Resume conversation` action after Back to Discover. Back must not silently terminate or erase a conversation; End is deliberately confirmed and server-authoritative.
- Bootstrap should restore a still-valid authenticated waiting search when no active random chat exists. Expired waiting requests must not be resurrected. Duplicate searches and cancellation races should recover the server state.
- Saved connections remain separate from random-chat End; use server conversation kind, not assumptions about local UI.
- **Do not** treat the initial 60-second match reservation lease as a lifetime limit for an activated/open conversation; avoid destructive stale-slot cleanup until a separate inactivity policy is reviewed.
- Run PostgreSQL, backend and Android regression CI; deploy the compatible backend only after all gates pass, then validate on both Android phone and tablet. Do not mark R0 complete based solely on CI.
- No new infrastructure, paid plans, test-data wipes, public signup, premium redesign or release authorization.

## Architecture V2 founder approval and proposed delivery program — 2026-11-15

**ARCHITECTURE APPROVED FOR DOCUMENTATION AND IMPLEMENTATION PLANNING ONLY; NO V2 CODE APPROVED.** The authoritative prospective contracts are [Product Invariants V1](product/PRODUCT_INVARIANTS_V1.md) (BR-001–029, D-01–D-05), [Architecture V2](engineering/ARCHITECTURE_V2.md) (D-06/D-07/H-01/M-01 approved for planning), and [V2 Implementation Packages](engineering/V2_IMPLEMENTATION_PACKAGES.md) (package sequence, dependencies, test criteria and rollback gates **FOUNDER-APPROVED FOR PLANNING; engineering execution NOT AUTHORIZED**).

**Current technical reference:** `main@3578565a`, PR #14 merged, backend deployed to existing private Render QA and cloud QA debug APK CI passed. Earlier roadmap statements that the backend is not deployed or uses NestJS/Supabase are historical only. Flutter Android + Node.js service + Neon PostgreSQL + one-node SSE/outbox is the actual current baseline. Synthetic tester_a/tester_b earlier exchanged messages; **R0 physical-device acceptance remains OPEN**.

**Policy-critical V2 gaps:** current random room lacks server-side 30m idle expiry; current two Keep votes mutate the same random conversation to `kind=connection`; generic v1 message reads permit historical replay; no separately scoped delivery, premium bilateral retention, evidence snapshot or retention jobs. No production identity/age assurance, staffed moderation, real payments or public release authorization.

**Approved business/privacy direction:** free perpetual mutual relationships; free new direct sessions; no previous-message timeline for free users; 7d max recipient-scoped unread; 30m random AND direct session accepted-message inactivity; joint prospective premium history 90d rolling; QA entitlements at ₹0 only; no payment gateway or product SKU approved. Separate 7d post-end report, 24h ordinary message purge target (not activated), 90/180d safety evidence policies, and an explicit `legacy_qa` migration exception that preserves existing data.

**Proposed execution order:**
`G0 R0 device QA -> V2-01 deterministic test contracts -> V2-02 policy/security -> V2-03 additive schema -> V2-04 random expiry + V2-05 connection split -> V2-06 live/unread -> V2-07 evidence -> V2-08 deletion dry-run + V2-09 consent/TEST entitlements -> V2-10 Android UX -> G1/V2-11 API privacy cutover -> G2 physical/privacy gate -> separately approved V2-12 actual retention -> V2-13 production identity/safety -> V2-15 beta decision`. V2-14 Play Billing sandbox remains OPTIONAL and separately gated. Full PR-level scopes and rollbacks are in the package plan.

**Non-negotiable rollback:** After V2 history read cutover, never revert to unrestricted `/v1/conversations/:id/messages` access. Fallback is **safe deny** or forward fix. Physical deletion requires distinct founder approval; it cannot be rolled back by exposing a backup.

**The V2 package sequence and engineering gates are approved for planning only, not for code execution.** No application code, database data/schema, Render deployment, billing or payment settings or public-user privileges may be changed by this documentation PR.

## Deferred final milestone: V2-16 What If? user-journey and edge-case audit — founder sequence decision, 2026-11-15

The founder requested that the comprehensive What If? research, UX review and formal scenario certification be **placed at the end of the planned V2 roadmap**, rather than inserted as a new gate before V2-01. **The original implementation sequence remains: G0/R0 device acceptance -> V2-01 through V2-15 (with V2-14 optional).** V2-15 is a preliminary adult-beta readiness assessment, **not** permission to launch. After that, V2-16 performs the complete scenario audit and the final founder release go/no-go gate. No public beta launches before V2-16 is accepted.

- [What If? Scenario Atlas V1](product/WHAT_IF_SCENARIO_ATLAS_V1.md): 138 *draft* cases across 12 experience domains; saved now for comprehensive final review.
- [Scenario Coverage & QA Strategy V1](engineering/WHAT_IF_QA_STRATEGY_V1.md): existing eight journey examples and full future acceptance matrix.
- [V2 implementation PR packages](engineering/V2_IMPLEMENTATION_PACKAGES.md): V2-00 prerequisite **withdrawn from the plan**; V2-16 final audit added after core work.
- **Important boundary:** Approved V1/V2 safety, expiry, privacy, consent and authorization cases still require tests inside their relevant earlier engineering PRs. Only the *dedicated exhaustive 138-case UX review* is postponed.
- Proposed, not approved: silent production login, foreground match presence lease, passive countdown, Report & Leave vs Block interaction, notifications, secure draft restoration and other proposed UX details; do not silently implement them as part of other packages.
- Current QA still holds JWT only in memory; no production session refresh. R0 on actual phone/tablet remains OPEN.

**Resumed immediate planning:** [V2-01 deterministic contract and migration inventory implementation brief](engineering/V2_01_IMPLEMENTATION_BRIEF.md) is prepared for separate founder approval. R0 hardware testing remains OPEN. No V2 test code has been written.

**Change control:** DOC-00 documentation reconciliation and proposed implementation brief only. No application changes, live Neon schema/data, Render deployment, test-account reset, billing, paid services or release authorized.

## Post-V2-01 status / V2-02 authorization preparation — 2026-11-15

- **V2-01 IMPLEMENTED / CI TESTED:** test-only PR [#16](https://github.com/rayadinaveen98-ship-it/bridge/pull/16) merged as `734240369205ed895c2e49824e75d8263ca4baef`; two successful PR checks and successful post-merge `Foundation checks` run [43735526322](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43735526322). The sixteen synthetic CT contract groups, policy access matrix and static source inventory validate **test models and checked-in SQL**, not actual V2 server enforcement. No V2 runtime/schema/deploy modifications from V2-01.
- **V2-02 PLANNING DOCUMENT PREPARED (NOT AUTHORIZED TO IMPLEMENT):** [Exact Central Policy & Authorization Implementation Brief](engineering/V2_02_IMPLEMENTATION_BRIEF.md). The recommended first authorization PR introduces **disconnected** pure server policy functions, actual-function unit tests, a closed operation set and role/grant review *documentation*, without modifying `http.mjs`, `postgres.mjs`, DB roles, live account data or Render. The current V1 private synthetic QA continues unchanged until separately approved later cutover.
- **R0 physical phone/tablet acceptance OPEN**; no statement of real-device V2 testing or production security certification.
- 138-case end-to-end What If? audit remains **V2-16, after core stages**; critical privacy/safety checks still belong in each earlier stage.
- Founder must separately authorize V2-02 source paths before any coding, live security inspection, migration, deploy, cost or payment operation. This DOC-ONLY update neither authorizes nor performs them.

## Verified V2-02 completion / V2-03 additive-schema planning — 2026-11-16

- **V2-02 IMPLEMENTED / CI VERIFIED within disconnected policy-kernel scope:** [PR #18](https://github.com/rayadinaveen98-ship-it/bridge/pull/18) merged to `main@7721afbb608edcad2a71b888bcb90ec1fc251a1b`. [Post-merge CI run 43742699492](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43742699492) passed matching, backend, V2-01 reference contracts, 68 pure V2-02 policy tests and disposable PostgreSQL. This **does NOT activate the V2 policy in existing HTTP/PG runtime**.
- **Current stage: V2-03 — DOCUMENTED, NOT AUTHORIZED TO IMPLEMENT:** [exact additive schema implementation brief](engineering/V2_03_IMPLEMENTATION_BRIEF.md). Four proposed migration layers (0004 metadata, 0005 sessions/live/unread, 0006 consent/history/QA entitlements, 0007 evidence/retention), synthetic preservation tests and one-way rollback. This stage is **strictly disposable/test database only** if separately approved.
- **No live Neon schema writes or read-only role inspections** are authorized by this planning stage. No API/Flutter source, Render deploy, real-data copy, message purge, billing or payment changes.
- **Legacy message body boundary:** `bridge_messages.body NOT NULL` remains unchanged through V2-03. Future body-null relaxation is a distinct V2-06/V2-11 data-access cutover decision, not a hidden additive migration.
- **R0 physical Android phone/tablet acceptance remains OPEN.** Comprehensive 138-case What If? review remains V2-16. Existing privacy/safety tests still belong in each engineering package.
- **Next decision:** founder reviews the V2-03 migration-code/test-only package. A separate approval is required to create SQL/test files; any later live Neon DDL requires its own independent approval and backup/rehearsal evidence.

## V2-03 verified complete; V2-04 lifecycle planning — 2026-11-16

- **V2-03 IMPLEMENTED / DISPOSABLE CI VERIFIED:** [PR #20](https://github.com/rayadinaveen98-ship-it/bridge/pull/20) merged `main@a922f63d572866d751b9747070381c453e239026`; [post-merge Foundation CI 43803304381](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43803304381) passed matching and PostgreSQL 16 integration (15 migration checks and backup/restore). Only SQL source, isolated test-runner and CI changed; **NO live Neon migration applied**.
- **Current stage V2-04 — IMPLEMENTATION BRIEF DRAFTED, NO CODE AUTHORIZATION:** [random-chat expiry and slot-safe cleanup plan](engineering/V2_04_IMPLEMENTATION_BRIEF.md). Recommends a disconnected V2-04A `apps/api/src/sessions/**` engine and PG16 race tests; active 30-minute timeout for new rooms is **NOT** live in the current private QA build.
- **Critical technical finding:** a PostgreSQL `now()` value stays anchored to the transaction start, even if a room lock is acquired much later. V2-04 must sample authoritative `clock_timestamp()` **after locks** and prevent late writes. No older-match reservation lease can be repurposed as random chat idle expiry.
- **M-01 preserved:** existing synthetic open chat and four messages cannot be retroactively timed out, backfilled or erased; explicit V2 markers and a separately approved live migration/cutover are required.
- **V2-04 activation NOT approved:** no edits to current hosted API routes, `postgres.mjs`, Flutter, Neon schema/data, Render, payments, billing or retention. Old V1 historical-replay endpoint remains a later V2-11 security cutover blocker.
- **R0 physical phone/tablet acceptance OPEN;** exhaustive 138-case What If? review stays final V2-16. Mandatory V2-04 expiry, security and data-preservation test cases run in V2-04's own acceptance, not postponed.
- **Next decision:** separately approve or amend the scoped **V2-04A disconnected session engine**; do not infer authorization to activate live expiry, apply migration to Neon or begin V2-05.

## V2-04A source verified; V2-05 mutual connection planning — 2026-11-16

- **V2-04A IMPLEMENTED / DISPOSABLE CI VERIFIED:** [PR #22](https://github.com/rayadinaveen98-ship-it/bridge/pull/22) merged at `main@1ef086c6e4b87ad966b103db33872513f7ae6bda`; [post-merge CI run 43811015419](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43811015419) passed both matching and PostgreSQL 16 jobs. **Random expiry is NOT active in hosted QA**; new session adapter is disconnected.
- **CURRENT STAGE V2-05 DOCUMENTATION PREPARED:** [exact mutual Keep and free direct-session implementation brief](engineering/V2_05_IMPLEMENTATION_BRIEF.md). Proposed **V2-05A disconnected** Keep transaction + direct-session creation/renewal with 30 separate C05 acceptance criteria, no V1 source conversion or old transcript copy. **V2-05 implementation is NOT authorized by this docs stage.**
- **Critical compatibility blocker:** existing `castVote()` turns `random -> connection` in place; existing `connections()` returns only open source-conversation IDs. The approved V2 model requires an immutable CLOSED random source, separate persistent relationship and NEW free direct-session ID; old V1 message APIs must be cut over safely before exposing V2 direct IDs.
- **Live activation is independently gated** on Neon V2-03 schema migration/legacy classification, auth/policy/read-scope and Android compatibility review, old `/v1/.../messages` privacy safe-deny, actual DB runtime role verification and separate founder authorization. No Neon, Render, Flutter, user data, billing, payments or real user access changed.
- **R0 physical-device acceptance remains OPEN.** Exhaustive 138-case What If? research/documentation stays at final V2-16; mandatory connection/expiry/security cases have package-specific tests now.
- **Next founder decision:** approve the exact V2-05A disconnected implementation scope, or amend it before any code PR; do not interpret the planning PR as authorization for V2-05B or V2-06.


## V2-05A certified; V2-06 documentation prepared — 2026-11-16

- **V2-05A IMPLEMENTED, MERGED, DISCONNECTED CI VERIFIED:** [PR #24](https://github.com/rayadinaveen98-ship-it/bridge/pull/24), merge SHA d50a4d00d7545c555e99f1f09283145520960a01. [Exact final PR-head CI #43820598492](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43820598492) and [exact post-merge main CI #43820774828](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43820774828) both PASS with matching and disposable PG16 jobs. See [V2-05 evidence](engineering/V2_05_EVIDENCE.md).
- **Current stage: V2-06 DOCUMENTATION PREPARED, SOURCE IMPLEMENTATION NOT AUTHORIZED:** [V2-06 scoped LIVE/unread implementation brief](engineering/V2_06_IMPLEMENTATION_BRIEF.md) proposes **V2-06A disconnected** current-session message scope, seven-day recipient unread envelopes, 15-minute recovery, opaque cursors and disposable PG16 concurrency tests. It recommends no existing v1 route or live database changes.
- **Storage/cryptography blocker:** existing bridge_messages.body NOT NULL and placeholder bytea payload/unread ciphertext schema do not themselves establish encrypted, non-replayable V2 content. Before any actual body handling, separately approve storage/key-management architecture and, if needed, new additive schema/migration rehearsal. Old generic /v1/conversations/:id/messages read path must be privacy-safe before hosted activation.
- **Preserve stable QA:** Neon legacy tester accounts/room/four messages, existing Render service and Android builds unchanged; no live V2 migration, app integration, paid service, message deletion or public beta. V2-04A/V2-05A are in-repo but remain **inactive** in hosted QA.
- **R0 PHONE/TABLET ACCEPTANCE OPEN.** CI does not constitute hardware sign-off. V2-05B and V2-06B integration, V2-10 Android and V2-11 privacy read-cutover need fresh founder approval. Final 138-case What If? review remains at V2-16.
- **Next decision:** founder may approve/amend exact V2-06A **disconnected code/test-only scope** after reviewing brief. This documentation update is not approval of engineering execution or any deployment.
