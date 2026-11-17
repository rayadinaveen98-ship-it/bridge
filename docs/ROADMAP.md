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


## V2-06A disconnected synthetic engine — merged and verified (2026-11-16)

- **V2-06A IMPLEMENTED / ISOLATED CI VERIFIED / MERGED:** [PR #26](https://github.com/rayadinaveen98-ship-it/bridge/pull/26), merge **4bb43266c53436fbe6dc7c4707c76ae2903cf367**. [Final PR CI #43825963819](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43825963819) and [post-merge main CI #43826103264](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43826103264) both passed matching and disposable PostgreSQL 16 jobs.
- **What exists:** four NEW disconnected apps/api/src/messaging modules and synthetic-only tests for current-session LIVE scope, 30-minute accepted-message deadline, scoped HMAC cursor/tombstone metadata, 7-day recipient unread metadata, idempotent acknowledgment and 15-minute bounded recovery, DB lock/rollback, V2 session isolation and old four-message fixture preservation. Tested 7 pure cases and 17 PostgreSQL cases in the recorded job; read [V2-06 evidence](engineering/V2_06_EVIDENCE.md) for exact coverage and remaining gaps.
- **What emphatically DOES NOT exist:** production encrypted chat/body retrieval, real payload cryptography or keys, deployed unread delivery, HTTP or SSE V2 routing, live Neon migrations, new Android client flow, retention deletion, paid entitlements or public adult access. Synthetic fixture bytea is explicitly **not encryption**. Existing bridge_messages.body NOT NULL and legacy v1 broad read remain unresolved cutover risks.
- **CURRENT NEXT STAGE: V2-06B integration architecture / storage-security review, NOT AUTHORIZED FOR IMPLEMENTATION.** Prepare a separate founder-reviewed design that resolves confidential V2 payload storage + keys, immutable scope cutover, trusted identity + least-privilege Neon role, safe old-client denial, Android protocol and a non-destructive rollout. Do not wire V2-06A to private QA or accidentally activate it.
- **R0 PHONE/TABLET FULL ACCEPTANCE OPEN;** final comprehensive 138-case What If? review remains V2-16. No new spending or launch approved. Preserved existing two synthetic account/private QA evidence and hosted baseline.


## V2-06B integration and private storage architecture — documentation proposal (2026-11-16)

- **VERIFIED BASELINE:** V2-06A disconnected synthetic messaging engine was merged in PR #26; independent certification PR #27 landed at main@d6d3267c88810e40a3529bfda3de64e2a13e4708. [Post-merge Foundation #43826466068](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43826466068) passed matching and disposable PostgreSQL. **V2-06A IS NOT DEPLOYED**; R0 phone/tablet acceptance OPEN.
- **V2-06B DOCUMENTATION PROPOSED, NO IMPLEMENTATION APPROVAL:** [private messaging storage & integration security brief](engineering/V2_06B_INTEGRATION_SECURITY_BRIEF.md) and [privacy threat model](engineering/V2_06B_THREAT_MODEL.md). These reconcile the current v1 body NOT NULL constraint, 0005 V2 tables' legacy FK coupling, lack of real cryptography/key custody, broad v1 read surface, and unresolved actual Render runtime DB role/RLS.
- **Recommended architecture pending founder decision:** A separate additive, versioned V2-only message-metadata / authenticated-encrypted payload / recipient-unread store through a later **0008** migration (candidate naming), rather than using real user body in old bridge_messages or modifying existing migrations 0001–0007. Proposed AEAD is server-side protection at rest, **NOT E2EE**; no secret provider or paid service approved.
- **Next proposed gates:** B0 documentation only (this brief); separately authorized B1 **disconnected synthetic 0008 migration rehearsal and crypto key-contract tests**; separately authorized B2 trusted policy/back-end adapter tests; B3 versioned endpoint/Android/rollback review, with hosted activation reserved for G1/V2-11 after V2-10 and explicit founder approval. Never silently activate V2-04A, V2-05A or V2-06A.
- **No database/API/Android/live role/deployment/billing/retention changes by this documentation update.** Two synthetic testers, four original QA messages, Render Free and Neon Free baseline remain preserved. V2-07 onward package order and final V2-16 138-case What If? gate remain as approved.
- **Next decision:** founder reviews storage Option A and explicit B1 implementation-brief authorization; no source code, SQL or runtime integration permitted without a separate scoped approval.


## Bridge V2-06B/B1 exact implementation specification prepared — 2026-11-16

- **Verified main baseline:** PR #28 merged its *documentation-only* V2-06B architecture and threat model at `main@e18fc51d3de8522eb8e77d81f8eb475c1794694b`, [post-merge Foundation #43832937538](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43832937538) matching/PostgreSQL **SUCCESS**.
- **CURRENT STAGE: B1 DOCUMENTATION READY FOR FOUNDER REVIEW, NOT IMPLEMENTED.** The [exact B1 engineering brief](engineering/V2_06B_B1_IMPLEMENTATION_BRIEF.md) and [proposed schema/crypto contract](engineering/V2_06B_B1_SCHEMA_CRYPTO_CONTRACT.md) describe non-destructive **Option A**, three V2-only tables, and a separate guarded test-only `0008` migration. No implementation authorization or live cloud action.
- **Two separately controlled engineering PRs proposed:** **B1a (8 exact paths)** new 0008 secure metadata/LIVE/recipient unread tables plus separate disposal-only PG16 migration/rollback/restore tests, no edit to original 0001–0007 or historic 0004–0007 runner; **B1b (7 exact paths)** standalone AES-256-GCM AEAD/key contracts and synthetic pure tests, no real keys/provider, app integration or paid dependency. Founder approves each independently.
- **Safety gate:** Existing 34-table/four-ledger V2-03 tests remain unchanged and run before 0008; new test-only runner proves post-0008 37 tables and fifth checksum receipt in a **disposable** database. Existing four-message/room/two-slot synthetic fixture hashes preserved. No V1 body change, automatic migration, hosted Neon/Render, Android, retention deletion, billing or public beta.
- **Execution order:** B1a approval and scoped code/CI evidence -> separate B1b approval and pure crypto/CI evidence -> separately approved B2 backend adapter and B3 safe API/client design -> G1/V2-11 privacy-safe synthetic activation, only after Android V2-10 and founder approval.
- **Unresolved:** real secret/KEK custody/provider and cost; runtime role/RLS; stale V1 reader safe-deny; AAD/nonce/key operational policy; crossing rule for 7d/15m recovery. R0 physical Android acceptance remains **OPEN**; comprehensive 138-scenario What If? at V2-16 remains final.


## B1a V2-only additive secure schema — certified disconnected, 2026-11-16

- **B1a IMPLEMENTED / DISPOSABLE PG16 CI VERIFIED / MERGED, NOT LIVE:** [PR #30](https://github.com/rayadinaveen98-ship-it/bridge/pull/30), main merge a27467887e6cfd855b2ba980da5b0d2d5a9565b1. Final [PR #43837068978](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43837068978), final [push #43837059132](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43837059132), and exact merge [main CI #43837237068](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43837237068): matching and postgres-integration all SUCCESS.
- New 0008 source defines three **V2-only schema tables**: message metadata, LIVE ciphertext-shaped storage and recipient unread envelope. Separate acknowledged loopback-only migration runner; CI verifies 34->37 disposable tables, four->five receipts, forced transaction rollback, FK/unique/CHECK, default-deny RLS nonowner test, historical four-message QA SHA preservation and PG16 backup+restore. Nothing was applied to real Neon.
- Earlier unrelated V2-06A HMAC cursor-forgery test had random negative-fixture failure; [one-file test-only PR #31](https://github.com/rayadinaveen98-ship-it/bridge/pull/31) corrected the test with separate CI; B1a's final head incorporated this baseline without modifying its eight-path diff.
- **No cryptography yet:** ciphertext/IV/tag columns are only structural constraints, and test bytea is synthetic **NOT encrypted**. No KEK/DEK provider, actual encryption, V2 HTTP and PostgreSQL runtime integration, Render deploy, Android, new Neon runtime roles, billing, physical purge or public users.
- **NEXT FOUNDER DECISION: B1b standalone authenticated encryption/key-contract tests only** (previous 7-path implementation brief); do not start without separate approval. After B1b, B2 trusted backend adaptation, B3 protocol review and V2-10/G1/V2-11 privacy-safe activation remain individually gated. Existing R0 physical phone+tablet acceptance OPEN; final 138-case What If? V2-16 unchanged.
- Evidence details: [B1a verification and security gate register](engineering/V2_06B_B1_EVIDENCE.md).


## B1b disconnected authenticated encryption/key-contract — verified 2026-11-16

- **B1b IMPLEMENTED / ISOLATED CI VERIFIED / MERGED; NOT LIVE:** [PR #33](https://github.com/rayadinaveen98-ship-it/bridge/pull/33), merge **c4f970f3ceabcf2758e76e10c74f4be7a75543c5**. [Final PR #43840591295](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43840591295), final push #43840581981, and exact [main postmerge CI #43840915608](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43840915608): matching and disposable PostgreSQL integration **SUCCESS**.
- **Delivered within seven approved paths:** NEW disconnected Node AES-256-GCM encrypt/decrypt codec with 32-byte per-item test DEK, purpose-specific **ephemeral in-memory test KEK**, separate 96-bit random payload and wrapping IVs, 128-bit tags, canonical versioned length-prefixed AAD, UTF-8 validation, missing/tampered/retired key fail-closed, test-only wrap-IV reuse guard. **21/21 pure Node tests** passed including NIST vector and negative security inputs, alongside earlier V1, V2-01..06A, B1a PG16 schema and backup regressions.
- **Security reality:** Cryptography has been exercised in disconnected *synthetic* tests only, not used by any service route. No real production key custody/vendor, hosted encrypted payload writing, Android message reading, HTTPS scope binding, Neon DDL/roles, Render deployment, multi-process nonce registry or physical acceptance is in place. The new B1a 0008 schema remains **source/CI-only**. Do not market encrypted live messaging or E2EE.
- **NEXT: B2 trusted encrypted messaging backend — PLANNING/FOUNDER APPROVAL REQUIRED.** Before coding, review exact B2 scope, runtime identity and least-privilege database roles, key custody/cost, encryption/wrapper/provider interface, atomic sender/recipient persistence and Block/End/expiry races. Any hosted V2 access additionally needs V2-10 Android and G1/V2-11 old-V1 route safe-cutover approval; no live activation now.
- **R0 physical Android phone/tablet acceptance remains OPEN**, safety/moderation and privacy release gates unresolved, and full 138-case What If? audit stays at V2-16. [Exact B1b evidence](engineering/V2_06B_B1B_EVIDENCE.md) records CI and limits.


## V2-06B/B2 trusted encrypted-message adapter — exact design prepared, NOT IMPLEMENTED (2026-11-16)

- **Verified source baseline:** main@7ca0865b18abdfd123fb28dc58a4f720d50385f6, [post-merge Foundation #43841548152](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43841548152) SUCCESS in matching and PostgreSQL. B1a 0008 source-only secure schema and B1b standalone synthetic AES-256-GCM are MERGED and TESTED, **not hosted live features**.
- **B2 DOCUMENTATION ONLY / PROPOSED:** [Exact implementation and PR-boundary brief](engineering/V2_06B_B2_IMPLEMENTATION_BRIEF.md), [adversarial test and trust-boundary matrix](engineering/V2_06B_B2_THREAT_AND_ACCEPTANCE.md), [key custody and PostgreSQL role decision record](engineering/V2_06B_B2_KEYS_AND_PRIVILEGES.md). No B2 code, real keys, database migration, new deploy, device integration, payment or deletion authorized by this planning stage.
- **Recommended B2a (next separate approval):** precisely **7 allowed paths**: NEW disconnected encrypted-acceptance repository and synthetic PG16 fixtures/race tests, named test runner, additive Foundation test-only step and evidence. Use only loopback acknowledged bridge_test, B1b's ephemeral synthetic key provider, one 714411 mutex/ordered locks/authoritative clock, 0008 secure tables and body-free outbox. All-or-nothing send/duplicate/30m/Block/End/Keep tests; never touch old V1 plaintext body or live APIs.
- **B2b (separate later approval):** precisely **6 allowed paths**, NEW disconnected current-LIVE and recipient-specific UNREAD read/ack/recovery adapter and race tests. Hard 7d unread and 15m first-ack window; source direct room can be closed without turning unread into previous-session history. Verify block and revoked pair denial; old V1 endpoint cutover remains G1/V2-11.
- **Further critical dependency:** Existing `bridge_history_items.message_id` (0006) and `bridge_report_evidence.source_message_id` (0007) still point to legacy `bridge_messages`, **not** B1a `bridge_v2_secure_messages`; V2-07 report evidence and V2-09 prospective history require separately approved V2 secure-ID linkage/schema design. Never create dummy V1 body rows to satisfy those FKs.
- **Key/role reality:** B1b key provider is **ephemeral test-only**; reliable key recovery, rotation, usage and provider/cost are unapproved. New 0008 RLS default deny is not proof of Render's actual DB principal; owner/BYPASSRLS role remains an unresolved hosted security gate. Genuine adult/policy acceptance and backend subject mapping remain future requirements. No paid service approved.
- **Governance:** B2a and B2b are NOT approved for implementation by documentation; R0 phone/tablet QA still OPEN; B3 versioned API/rollback design, Android V2-10 and controlled G1/V2-11 privacy cutover separately gated. Final 138-case What If? stays at V2-16.


## Bridge V2-06B/B2a — disconnected encrypted message writes certified (2026-11-16)

- **B2a IMPLEMENTED / DISPOSABLE PG16 TESTED / CI VERIFIED / MERGED; NOT LIVE:** [PR #36](https://github.com/rayadinaveen98-ship-it/bridge/pull/36), merge `main@e2cae7af30d51cb5111c8f31d4566d8b3af935d5`. Final [PR CI #43849838361](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849838361), [push CI #43849829195](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43849829195) and [main post-merge CI #43850018131](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43850018131): matching + postgres-integration SUCCESS.
- **Delivered exact 7 paths:** new `apps/api/src/messaging/private_repository.mjs` and synthetic PG16 acceptance/race fixtures/tests, named package runner, additive Foundation CI step and evidence; no prior V1–V2-06B source/SQL modified. New V2-only secure message+LIVE ciphertext and independently encrypted recipient UNREAD, body-free event, sequence/idle reset all commit atomically or roll back. 30m expiry, Block-before-queue, Keep, End/D2, duplicate-conflict, key/nonce failure and five injected rollback points verified. **14/14 acceptance + 12/12 race TAP test results passed** (each file includes wrapper; 24 nested cases overall) alongside existing matching and PG16 baselines; four-message legacy QA records untouched.
- **Security limitations:** B2a tests use only disposable `bridge_test`, synthetic actor IDs and ephemeral purpose-scoped in-memory keys, not a production server principal. Actual live Block/account eligibility updates are not fully serialized with this test adapter; no real API auth, Android, Neon `0008` activation, Render deploy, KMS, runtime RLS or current-LIVE/UNREAD reads are implemented. Do **not** claim user-facing encrypted messaging or E2EE.
- **Next founder gate: B2b** — separately approve the proposed **six-file** disconnected current-LIVE/recipient-only unread read/ack/recovery adapter and synthetic PG16 race tests in [B2 implementation brief](engineering/V2_06B_B2_IMPLEMENTATION_BRIEF.md). 7-day unread and 15-minute first-ack recovery remain bound to their existing approved limits; precise `min(first_ack+15m,accepted+7d)` crossing rule remains proposed for explicit confirmation before live behavior.
- **Later gates** B3 authenticated/protocol and old-V1 reader safe-deny, runtime DB role and production key custody, V2-07/09 new secure-message evidence/history references, Android V2-10, G1/V2-11 hosted staged activation remain separately approved. R0 physical Android acceptance OPEN. Comprehensive 138-case What If? review stays FINAL at V2-16.
- [Final B2a evidence](engineering/V2_06B_B2_EVIDENCE.md).


## Bridge V2-06B/B3 authenticated API and privacy-safe cutover — DOCUMENTED ONLY (2026-11-16)

- **Source-of-truth main:** `f8b18c4cae7736179b0ce8487168d4cb3fb81a6e`, [main CI #43854756002](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43854756002) SUCCESS matching+PG16. B1a, B1b, B2a and B2b implemented, merged, disconnected and CI verified; **none deployed or wired to existing HTTP/Android**.
- **CURRENT STAGE B3 ARCHITECTURE/SECURITY PLANNING PREPARED; no source implementation authorization:** [B3 integration and exact proposed B3a scope](engineering/V2_06B_B3_INTEGRATION_BRIEF.md), [V1 route inventory / Flutter client and V2 protocol matrix](engineering/V2_06B_B3_ROUTE_CLIENT_MATRIX.md), [production key/role/security/R0 release gate register](engineering/V2_06B_B3_SECURITY_RELEASE_GATES.md). This documentation stage modifies NO runtime, SQL, existing QA data, Render, Neon, Android, retention, billing or paid services.
- **Most urgent old-client risk:** Current `/v1/conversations/:id/messages` both READS and **WRITES plaintext** `bridge_messages.body`, and its authorization does not enforce V2 room-version denial. Old V1 bootstrap/peer/SSE ready/replay/connection-vote/connections/close can leak or mutate V2 scopes if a V2 ID is exposed prematurely. Require server-side V1 **read-and-write safe-deny on V2-marked rooms** before exposing any hosted V2 ID; never allow rollback to unsafe replay.
- **Authentication gap:** Existing V1 RS256 bearer+subject->account is implemented, but B2a/b accept **synthetic actorId**, and current Flutter `BridgeApi` uses V1 routes only. B3b must independently prove trusted actor mapping; later V2-10 Android must enforce current-only memory, finite unread, redacted notifications, two-device receipt and upgrade UX. No real identity, age/policy assurance, network V2 route or physical device acceptance yet.
- **Race clarification:** V1 `postgres.mjs:block()` DOES take advisory mutex 714411 (same as V2 synthetic adapter), correcting earlier shorthand claiming V1 Block lacks the lock. But `unblock()` does not use the same lock, and account/policy updates/old routes are not uniformly V2 integrated; complete revocation/Block safety remains unverified for real HTTP.
- **Critical production gates:** Render runtime DB principal/grants/RLS **UNVERIFIED**; B1b/B2b AES/HMAC keys are ephemeral synthetic only, no durable KEK or provider approved; 0008 has NOT been applied to Neon. B2b five-minute presentation-proof TTL is test-only, *not* a founder product policy or cryptographic proof of human viewing. V2-07 report and V2-09 future-history FK linkage to `bridge_v2_secure_messages` still requires separate schema/security proposal.
- **Recommended next founder decision:** B3a **7-file** pure disconnected API compatibility/denial and response contract test package **ONLY**; `apps/api/src/v2/{compatibility_contract,response_contract}.mjs`, two new pure test files, additive `apps/api/package.json` runner, matching-only Foundation CI step, new B3 evidence. No edits to V1 routes or Neon/Render/Android in B3a. Later B3b synthetic JWT->DB actor facade, B3c role/key design and G1/V2-11 network activation require separate approvals.
- **Never weaken product invariants:** 30-minute accepted-message idle (poll/ACK/duplicate no reset), free mutual Keep and new D1/D2 without old transcript, recipient unread hard 7d and recovery min(firstACK+15m, original7d), blocked/revoked immediate denial, optional premium prospective bilateral consent only, reporting and privacy rights free.
- **R0 actual Android phone/tablet acceptance OPEN; V2-10 Android and G1/V2-11 hosted cutover GATED. Complete 138-case What If? review remains V2-16 FINAL.**


## Bridge B3a certified; B3b trusted-subject implementation specification PREPARED (2026-11-16)

- **Latest independently verified baseline:** `main@ba24e82fa8c4477dc3fab757a0df2f607191d50a`; [post-merge Foundation #43866135238](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43866135238) matching and PostgreSQL-integration SUCCESS. B3a pure V1/V2 route and response contracts **IMPLEMENTED / 25/25 Node TAP TESTS PASS / MERGED / CI VERIFIED / DISCONNECTED / NOT LIVE**; [implementation PR #41](https://github.com/rayadinaveen98-ship-it/bridge/pull/41), [evidence certification PR #42](https://github.com/rayadinaveen98-ship-it/bridge/pull/42). Prior B1a–B2b unchanged.
- **B3b STAGE: SPECIFICATION READY ONLY, NO SOURCE APPROVAL/IMPLEMENTATION:** [Exact 8-file B3b-1 implementation brief](engineering/V2_06B_B3B_IMPLEMENTATION_BRIEF.md), [identity/race acceptance matrix](engineering/V2_06B_B3B_TRUST_RACE_MATRIX.md). This B3b planning PR modifies documents only; NO HTTP/PG live integration, keys, Android, Neon, Render or QA records.
- **Key TOCTOU finding:** Existing `verifyBearer` can validate an RS256 subject and V1 resolves `bridge_accounts.auth_subject`, but B2a/B2b accept synthetic caller `actorId` and start separate transactions. A separate committed JWT-to-account preflight must **NOT** be represented as atomic B2 authorization. B3b-1 proposes only a transactional **test-only** subject resolver, under 714411 advisory mutex plus locked account row, using ephemeral synthetic 3072-bit RSA JWTs and checked loopback `bridge_test`; its internal callback runs before commit. JWT expiry rechecked after lock wait. **No message operation connected.**
- **Proposed B3b-1 exact 8 paths:** NEW `apps/api/src/v2/private_subject_adapter.mjs`; NEW `apps/api/tests/v2/identity/{signed_subject.test.mjs,postgres_subject.test.mjs,race_subject.test.mjs,fixtures.mjs}`; ADD only named scripts in `apps/api/package.json`, additive pure+PG16 checks in `.github/workflows/foundation.yml`; NEW `docs/engineering/V2_06B_B3B_EVIDENCE.md`. Separate founder approval required before coding, testing or merge.
- **B3b-2 separate later founder gate:** make signed-subject account mapping and B2a/B2b LIVE/write/unread/ACK/recovery operation use **one transaction and current locked identity/participant/Block state**. Requires an independent exact path brief/review; do not silently refactor B2 source or use nested transactions. B3a's pure old V1 route firewall is still NOT wired, so actual old V1 GET **and POST** messages/SSE/Keep/bootstrap/peer/connections remain a future G1/V2-11 safety gate before exposing ANY hosted V2 ID.
- **Remaining release gates:** real Render runtime DB role/RLS/grants UNVERIFIED, durable encryption/HMAC KEKs and provider/cost UNSELECTED; no production adult eligibility proof, nonowner DB access, V2-07 case evidence secure-ID links, V2-09 prospective bilateral history, V2-10 Android, V2-11 private QA network cutover, or real live E2EE claim. The synthetic B2b five-minute presentation proof is NOT a locked public UX policy. R0 phone/tablet physical acceptance OPEN; final **138-case What If? review stays LAST at V2-16**.
- **Next founder decision:** approve B3b-1 *only* within its exact eight files after reviewing the two docs. No paid service, billing, retention, destructive migration or public-release authority is implied.


## Bridge B3b-1 CI certification CLOSED; B3b-2 atomic messaging plan READY FOR APPROVAL — 2026-11-16

- **Latest verified main:** `110c5eaf29edaa2b45fa34a1b51c46d48778d3e1`; exact [Foundation #43879606406](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43879606406) **matching SUCCESS and PostgreSQL-integration SUCCESS**. This follows [B3b-1 implementation PR #44](https://github.com/rayadinaveen98-ship-it/bridge/pull/44) (28/28 new Node TAP passing, eight-file scope) and [one-document evidence PR #45](https://github.com/rayadinaveen98-ship-it/bridge/pull/45) **MERGED**; no V2 hosted deployment or Android change. B1a–B2b/B3a/B3b-1 stay disconnected synthetic/CI components.
- **CURRENT STAGE — B3b-2 PROPOSED/PLANNED ONLY, ZERO SOURCE CHANGES AUTHORIZED:** [exact B3b-2 10-file source/test/CI implementation brief](engineering/V2_06B_B3B2_IMPLEMENTATION_BRIEF.md) and [28-case atomic-auth/message/privacy/race acceptance matrix](engineering/V2_06B_B3B2_ATOMIC_TEST_MATRIX.md). This planning PR changes documentation only.
- **Atomicity rationale:** B3b-1 verifies RSA JWT subject -> eligible locked DB actor in an internal callback under mutex 714411, but B2a/b independently open their own PG16 transactions with synthetic `actorId`. Proposed new **internal-only** facade must route trusted actor+all B2a/b send/read/unread/first ACK/recover into the SAME client/BEGIN/COMMIT transaction, with current room/partner eligibility, Block and hard expiration checks. Preserve B2a/b standalone APIs/tests; no nested pool checkout or separate committed preflight.
- **Proposed B3b-2 exact 10 implementation paths:** NEW `apps/api/src/v2/private_atomic_facade.mjs`; MODIFY `apps/api/src/messaging/private_repository.mjs` and `private_delivery_repository.mjs` only to expose test-only same-client inner workers; NEW `apps/api/tests/v2/identity/{atomic_fixtures.mjs,atomic_write.test.mjs,atomic_delivery.test.mjs,atomic_races.test.mjs}`; ADD named test runner in `apps/api/package.json` and a disposable PG16 Foundation CI step; NEW `docs/engineering/V2_06B_B3B2_EVIDENCE.md`. **Separate founder implementation approval required** before any of those changes; stop for unapproved extra paths.
- **Highest-risk tests:** committed Block/restricted actor and peer deny; token expiry across DB locks before commit; original 30-minute unique-accepted-message idle rule; D1 -> D2 no former transcript; direct recipient-only unread original 7d and immutable firstACK + max15m recover; signed cursor/proof tampering; no V1 body fallback; one-client/one-transaction instrumentation; rollback after metadata/ciphertext/unread/outbox; original four-message synthetic QA hash preserved. B3b-2 test PASS would **not** constitute live network/RLS/Android certification.
- **Remaining separate gates:** V1 HTTP GET/POST/SSE/bootstrap/Keep/peer old-client safe denial **NOT IMPLEMENTED** (B3a is a pure policy only). Actual Render Neon principal/RLS, real KEK/KMS selection and recovery, holistic V1/Block/account writer races, age assurance, V2-07 evidence, V2-08 retention dry-run, V2-09 prospective history, V2-10 Android and G1/V2-11 private canary all remain unapproved or unverified as specified. No real-client token protocol, production E2EE, billing or public beta claim.
- **R0 physical Android phone/tablet acceptance remains OPEN.** Complete **138-case What If? review stays LAST at V2-16**; critical package-level security tests are not deferred.


## Bridge B3c production-security design and cost gate — 2026-11-16

**This item is DOCUMENTATION ONLY, NOT implementation, inspection or deployment.** Verified `main@3d4f71036b7dc7231175959bee14f1a7104b0ee6`, [Foundation #43898590922](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43898590922) both matching and disposable PG16 integration SUCCESS. B3b-2 [implementation PR #47](https://github.com/rayadinaveen98-ship-it/bridge/pull/47) and [evidence PR #48](https://github.com/rayadinaveen98-ship-it/bridge/pull/48) merged; 29/29 synthetic TAP, 26 nested cases, **disconnected** and **NOT hosted/live**.

- **B3c-0 DOCUMENTATION PLANNING:** [security readiness and approval stages](engineering/V2_06B_B3C_SECURITY_READINESS_BRIEF.md) plus [proposed RLS/role, key/rotation/cost matrix](engineering/V2_06B_B3C_ROLE_KEY_COST_MATRIX.md). Current proposal introduces no application source, SQL migrations, Cloud API or secrets. Current Render application pool sources `BRIDGE_DATABASE_URL`, but actual hosted PostgreSQL principal/grants/RLS remain **UNVERIFIED**.
- **Highest-risk blockers:** 0008 enables RLS without production policies, B2/B3b-2 synthetic CI uses DB owner; there is no production separation between migrator/API/retention/reviewer. Ephemeral AEAD/HMAC key provider and per-process nonce registry are **NOT** durable, global or restart-safe. V1 plaintext GET **and POST**, SSE/bootstrap/Keep/peer old-client privacy gate is NOT WIRED. No E2EE, no public adult/age verification.
- **B3c-1 next recommended future founder approval:** **DISPOSABLE PostgreSQL16 ONLY** test of owner vs nonowner RLS, effective GRANT inheritance, default deny, table/view/function leakage, and nonowner API authority. Exact test/source path list and test database cleanup must be approved separately. No live Neon/Render access.
- **B3c-2 independently approved later:** read-only, redacted inspection of actual Render runtime DB `current_user/session_user`, RLS/role/grants and policy inventory; not a DB write, role change or secret dump. Require founder permission for any actual hosted inspection.
- **B3c-3 independently approved later:** choose durable LIVE/UNREAD wrapping KEKs and separate cursor/presentation/recovery HMACs, nonce/restart/rotation/loss/incident contract, provider-region/latency, realistic cost model. Current published AWS/Google KMS cost examples are **illustrative only**, no vendor selected, no bills or new subscription approved.
- **Still separately gated:** V2-07 safety evidence secure-message linkage; V2-08 retention dry run; V2-09 bilateral prospective history; V2-10 Android UX; G1/V2-11 privacy-safe old V1 read/write and hosted canary; V2-12 physical retention; V2-13 public safety; optional billing. Production encryption and Neon schema/role modifications are **NOT approved**.
- **R0 physical phone/tablet acceptance remains OPEN; comprehensive 138-case What If? remains LAST at V2-16.** B3c offline planning cannot replace either gate.


## Bridge B3c-1 role/RLS adversarial test scope PREPARED, not approved — 2026-11-16

**Verified predecessor:** `main@fbbea78bca3ce8ca5f2c48152bc4008f723e089d`, [Foundation #43903076373](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43903076373) both matching and PG16 SUCCESS. [B3c-0 planning PR #49](https://github.com/rayadinaveen98-ship-it/bridge/pull/49) **MERGED**, exact four docs only. B3b-2 earlier merged and certified **29/29 synthetic TAP results**, still disconnected and NOT hosted. B3c-1 below remains **PROPOSED IMPLEMENTATION, ZERO SOURCE CODE APPROVED**.
- **New authoritative planning docs:** [B3c-1 exact SEVEN-file implementation brief](engineering/V2_06B_B3C1_IMPLEMENTATION_BRIEF.md) and [24-case independent-login/RLS/privilege threat matrix](engineering/V2_06B_B3C1_RLS_ATTACK_MATRIX.md). These are specifications, not claims of test passes.
- **Next candidate source scope (separate founder approval required):** NEW `apps/api/tests/v2/privileges/{fixtures.mjs,rls_nonowner.test.mjs,privilege_inheritance.test.mjs,view_function_boundary.test.mjs}`; ADD named `test:v2:privileges:db` to `apps/api/package.json`; ADD one **postgres-integration** role/RLS test step to `.github/workflows/foundation.yml`; NEW `docs/engineering/V2_06B_B3C1_EVIDENCE.md`. Exactly seven changed paths. **No V1/B2/B3 source edits, SQL migrations or cloud changes.**
- **Security objective:** real independent local PG16 LOGIN sessions (not superuser `SET ROLE`) test nonowner grant + default-deny RLS of actual three 0008 tables; owner `FORCE RLS` only on non-superuser canary, inherited grants and PUBLIC/function/view risks using **isolated synthetic canary**. Require exact local DB+ACK+source receipt, separate role-DDL ACK, full teardown/role/password redaction, zero historic fixture/catalog drift and all existing CI green. `bridge_test` CI superuser is NOT a production role. No actual Render runtime role, grants or Neon RLS has been examined.
- **B3c-2 separately gated** redacted READ-ONLY inspection of actual Render runtime pool/Neon role; **B3c-3 separately gated** production key provider, cross-process nonce uniqueness, budget, rotation/restore and outage handling. No external subscription, paid service, hosted SQL, live role/grant alteration or deployment authorized.
- **Major release blockers remain** B3a old V1 GET/POST/SSE/Keep/bootstrap privacy firewall not wired (G1/V2-11), no hosted nonowner V2 policy/keys, genuine adult eligibility, V2-07 case evidence, V2-10 Android. **R0 physical phone/tablet acceptance OPEN; V2-16 final 138-case What If? LAST.**


## Bridge B3c-2 — hosted identity confirmed; B3c-2R founder-approved for disposable proof (2026-11-17)

- **Verified B3c-2 LIVE DIAGNOSTIC RESULT:** PR #53 merged as `main@ad01d815ef1cd407ba50cb0b15df68412abf6b8e`. Opt-in read-only connection-pool inspection reported **HOLD_V2**: owner-level permissions including BYPASSRLS, CREATEROLE, CREATEDB and Bridge table ownership. No hosted V2 secure schema activated. This is a security architecture blocker, not evidence of a breach. The opt-in was switched off and subsequent QA deploy succeeded (Render logs showed the API ready). Private raw hosted audit certificate intentionally not committed to this public repository.
- **B3c-2R founder approval:** Security design, documentation and **disposable PG16/18 testing ONLY**. Proposed candidate is distinct migrator, V1, V2, case reviewer and retention worker roles, backed by an isolated redaction-safe role/permission matrix. See [B3c-2R role design](engineering/V2_06B_B3C2R_ROLE_DESIGN.md) and [test evidence ledger](engineering/V2_06B_B3C2R_EVIDENCE.md). No changes to live Neon, Render, existing Android, QA records, billing, real credentials or crypto providers.
- **Stop gate:** No V2 hosted cutover until actual runtime role least privilege and signed-actor RLS enforcement are proven through separate future authorized changes. B3c-3 key/provider and V2-07..16 gates unchanged; R0 actual phone/tablet certification OPEN and final 138-case What If? V2-16 LAST.


## B3c-2R — disposable PostgreSQL 16/18 role isolation implementation merged (2026-11-17)

- **TESTED / MERGED / NOT HOSTED:** [PR #54](https://github.com/rayadinaveen98-ship-it/bridge/pull/54) merged to `main@d6e1c9133969a82a26584e8706c63407163d6c00`; exact seven-file scope: two new independent-login/test guard paths, one added package script, new isolated PG16/PG18 CI workflow and three documentation changes. [Matrix CI #43937594699](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937594699) passed **PG16 11/11 TAP** and **PG18 11/11 TAP**, 0 failures; [Foundation #43937594478](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43937594478) matching and PG16 integration both SUCCESS on exact final PR head `064703fbd3bc65698e7888ead9b0b82fd102763e`. Separate postmerge `main` CI not independently confirmed; do not claim that result.
- **Boundary of proof:** Synthetic generated roles/canary rows demonstrate default-deny RLS, V1/V2/safety/retention separation, positive canary scoping and deny/no-escalation on disposable PG16/18. It is NOT a real 0008 PG18 schema or signed-user per-row V2 end-to-end proof. Hosted Render API remains owner/BYPASSRLS: `HOLD_V2`. No Neon, Render, Android, keys or QA data changed.
- **Next gate:** actual 0008 PG18 disposable + trusted actor-bound nonowner policy/transaction test design, with separate exact file approval before implementation. Any hosted role/grant/env/deploy change requires separate founder approval. B3c-3 and V2-07..16 remain pending; R0 phone/tablet certification OPEN and final 138-scenario What If? V2-16 LAST. Full evidence: [B3c-2R ledger](engineering/V2_06B_B3C2R_EVIDENCE.md).


## Bridge B3c-2R2 — actual 0008 PG18 signed-user nonowner proof (2026-11-17)

- **FOUNDER APPROVED — DISPOSABLE IMPLEMENTATION ONLY:** Prepare actual checked-in 0001–0008 SQL on a fresh attested PostgreSQL 18 GitHub Actions service, not Neon. Use isolated nonowner LOGIN and a synthetic JWT-to-transaction-bound signed actor proof against the actual three 0008 RLS tables. See [B3c-2R2 design](engineering/V2_06B_B3C2R2_DESIGN.md) and [evidence ledger](engineering/V2_06B_B3C2R2_EVIDENCE.md).
- **No hosted privileges changed:** Any temporary demonstration functions/RLS policies belong to disposable PG18 only; current Render QA remains owner/BYPASSRLS, **HOLD V2**. No actual API/Android integration or product encryption claimed; original 0001–0008 migration SQL unchanged.
- **Next independent gate after this proof:** threat-model production-safe signed actor/DB trust boundary, account+Block lifecycle/participant transaction races and least-privilege role cutover. B3c-3 durable keys, V2-07 onward, R0 physical phone/tablet and final V2-16 remain separate.


### B3c-2R2 implementation verification (2026-11-17)

- **Offline PG18 proof implemented:** Draft [PR #56](https://github.com/rayadinaveen98-ship-it/bridge/pull/56), exact seven-file scope, actual checked-in 0001–0008 SQL applied to ephemeral GitHub Actions PG18. 37 tables, five migration receipts, three V2 RLS secure tables, independently credentialed restricted app LOGIN and synthetic transaction-scoped JWT/HMAC context. **No runtime route, hosted schema, Android or Neon/Render change.**
- **Code-head security CI:** [actual PG18 0008 #43942617769](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942617769) **16/16 TAP passing**; previous [PG16/18 matrix #43942617909](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942617909) both success; [Foundation #43942618087](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43942618087) both jobs success. Final evidence-revision HEAD must separately pass CI before merge.
- **Limitation:** synthetic signed actor policy and test-only SECURITY DEFINER are NOT production security architecture; no atomic live eligibility/Block authorization, real key custody or safe V1/V2 cutover. Hosted runtime still holds owner/BYPASSRLS; **HOLD V2**. R0 phone/tablet open and V2-16 138-case last.


### B3c-2R2 merged and exact PR-head verified (2026-11-17)

- **IMPLEMENTED / TESTED / MERGED / NOT HOSTED:** [PR #56](https://github.com/rayadinaveen98-ship-it/bridge/pull/56) merged at `main@27dbb6dc84bfecce4bc94f8f3509c5857455e7c3`. Actual checked-in 0001–0008 SQL on disposable PostgreSQL 18 passed **16/16** Node tests; synthetic nonowner role denied forged actor context, cross-user ciphertext-shaped rows, unauthorized inserts and legacy V1 messages. No actual encryption or app API wiring.
- Final PR-head checks: [PG18 proof #43943002296](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43943002296), [PG16/18 role matrix #43943002126](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43943002126) and [Foundation #43943002205](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43943002205) all **SUCCESS**. Independent postmerge main CI remains unverified.
- **Real hosted release blocker UNCHANGED:** Render runtime's PostgreSQL owner/BYPASSRLS must be replaced via separately approved role/credential migration. Actual runtime signed-user/Block/revocation atomicity, durable key custody, V2-10 Android and G1/V2-11 old-client safe-deny are not certified. R0 physical acceptance OPEN; final 138-case V2-16 LAST. [Detailed evidence](engineering/V2_06B_B3C2R2_EVIDENCE.md).


## B3c-2R3A — signed-actor policy revocation GAP red-team (2026-11-17)

- FOUNDER APPROVED V2 CONTINUATION, isolated PG18 test-only. The current B3c-2R2 prototype SQL policies scope sender/recipient but do not deny on current account eligibility, Block, participant departure, direct relationship ending or room close. A passing red-team suite confirms that these existing gaps MUST be fixed before any V2 launch; it is not a privacy pass. See docs/engineering/V2_06B_B3C2R3_GAP_MATRIX.md and V2_06B_B3C2R3_EVIDENCE.md.
- Existing disconnected B3b-2 PG16 domain code has safety checks and synthetic races, but it is not integrated with independently authenticated nonowner PG18 access or live HTTP. No Neon/Render, Android, API, keys, real QA data or production schema changes authorized. Hosted V2 remains HOLD.
- Next distinct gate: B3c-2R3B atomic same-client signed actor, account/Block/room/connection authorization, with verified writer lock ordering and nonowner privileges. Founder must approve any hosted role/environment changes separately. R0 physical acceptance open; B3c-3 key custody, G1 firewall and V2-16 last.


### B3c-2R3A initial verified offline gap evidence (2026-11-17)

- Draft [PR #58](https://github.com/rayadinaveen98-ship-it/bridge/pull/58) test-only, six files. [PG18 revocation-gap CI #43945625737](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625737) **15/15 TAP PASSED because the prototype remains UNSAFE**; this is a red-team reproduction and explicit V2 activation HOLD. Existing [B3c-2R2 PG18 #43945625587](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625587), [B3c-2R PG16/18 #43945625731](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625731) and [Foundation #43945625611](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625611) all SUCCESS at initial code head; evidence-doc revision needs final-head CI.
- Security transition remains **BLOCKED:** current synthetic sender/recipient-only RLS does not enforce Block/peer/room/eligibility; production-grade same-client lock and independently nonowner actor transaction B3c-2R3B not implemented. Hosted Render owner/BYPASSRLS not remediated; no hosted V2 deployment, keys or Android changes. R0 physical certification open; G1 safe old-client deny pending; V2-16 last.


### B3c-2R3A red-team merged (2026-11-17)

- **TESTED / MERGED / OFFLINE ONLY:** [PR #58](https://github.com/rayadinaveen98-ship-it/bridge/pull/58) merge `0ed8ec856b780ce3143de70ce45402d73aa29109`; exact six paths. 15/15 PG18 red-team TAP tests [#43946039544](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43946039544), previous PG18 schema proof [#43946039534](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43946039534), PG16/18 role matrix [#43946039637](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43946039637) and Foundation [#43946039680](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43946039680) all SUCCESS on exact final PR SHA d251964. These TESTS PROVE PRIVACY GAPS, NOT A FIX. Independent postmerge main CI unverified.
- **Next:** B3c-2R3B atomic revocation and nonowner authorization architecture is NOT IMPLEMENTED; hosted V2 remains HOLD due to RLS owner/BYPASSRLS and unintegrated safety. Neon, Render QA/Android and data preserved; R0 physical certification open, G1 firewall and B3c-3 key custody pending, V2-16 final What If? last.


## Bridge B3c-2R3B-0 — atomic authorization and revocation implementation planning (2026-11-17)

- **DOCUMENTATION PREPARATION ONLY, pending CI/merge:** Latest verified source `main@0b3e4998697907033d7307ba95b0bb1326484cef`. After B3c-2R3A [PR #58](https://github.com/rayadinaveen98-ship-it/bridge/pull/58) and evidence [PR #59](https://github.com/rayadinaveen98-ship-it/bridge/pull/59), the synthetic PG18 sender-only policy is PROVEN UNSAFE under account/Block/revocation changes. Hosted V2 still HOLD; no new secure live schema, deployed API, Android or key management.
- **New authoritative decision records:** [atomic security architecture](engineering/V2_06B_B3C2R3B_ARCHITECTURE.md), [exact B3c-2R3B-1 offline eight-file implementation brief](engineering/V2_06B_B3C2R3B_IMPLEMENTATION_BRIEF.md), [46-case attack/acceptance matrix](engineering/V2_06B_B3C2R3B_ATTACK_MATRIX.md).
- **Critical newly explicit prerequisites:** absence-of-Block cannot be protected by account row locks alone; *every* Block/Keep/account/participant/revocation writer must use a compatible locking protocol or be fenced. The existing B3b-2 PG16 actor+peer business checks and the B3c-2R2 PG18 nonowner RLS proof are separate and must be reconciled. A signed actor GUC or unrestricted SECURITY DEFINER cannot be blindly promoted. Future nonowner runtime must remain no owner/BYPASSRLS with a scrutinized DB authorization boundary.
- **Next separately gated code:** B3c-2R3B-1 offline-only real 0008 PG18 independently authenticated atomic guard, revocation/Block and cross-actor tests, no app HTTP or hosted integration. Exact 8-file scope is **PROPOSED, NOT IMPLEMENTED/APPROVED AS A DEPLOYMENT**. Future hosted Neon roles, Render credentials, R0 QA/Android, B3c-3 key provider and G1/V2-11 old-client firewall each need separate permission. R0 physical signoff remains OPEN; final V2-16 138-case What If? LAST.


## Bridge B3c-2R3B-1 offline/hosted gate separation proposal — 2026-11-17

- **GATE SEPARATION APPROVED BY FOUNDER (2026-11-17) / NO SOURCE OR HOSTED CHANGE:** [Gate L vs Gate H decision record](engineering/V2_06B_B3C2R3B1_GATE_SPLIT_DECISION.md) separates possible repository-only merging of a synthetic offline PostgreSQL security lab from actual hosted V2 activation. The founder explicitly approved separating repo-only lab review from hosted security on 2026-11-17. It does **not** authorize PR #61 merge or hosted release.
- **Verified candidate:** [draft PR #61](https://github.com/rayadinaveen98-ship-it/bridge/pull/61) at `5692082a2444eaa1b0373df5a2b67e4d91c5789a`, exactly 8 approved paths, **53/53 PG18 TAP** and all five workflow families GREEN on exact SHA. 46 acceptance areas **42 offline PROVEN / 2 PARTIAL (38,42) / 2 BLOCKED (39,46)**. This is NOT 46 passed TAP tests or a production authorization proof.
- **Approved Gate L framework, implementation merge NOT approved:** allow review for merge of isolated test infrastructure only after independent source/CI/import-fence audit **and a separate explicit founder approval for PR #61 merge**. Until then PR #61 stays **DRAFT/UNMERGED** and no repository changes to production routes or migrations are authorized.
- **Gate H unchanged: HOLD_V2.** Live Neon pool owner/BYPASSRLS, production role/actor/key security, R3B-38 deadlock/load/retry, R3B-42 hosted preservation, R3B-39 V1 old-client firewall/writer races and R3B-46 Android/R0/V2-16 remain outside the offline proof and require separate approvals. Render manual deploy remains OFF; no Neon/Render/Android/QA/billing changes in this documentation proposal. Final 138-case V2-16 What If? remains last.



## Bridge B3c-2R3B-1 PR #61 Gate L readiness review — 2026-11-17

- **REVIEW DONE / CONDITIONAL GO FOR REPO-ONLY TEST LAB / MERGE NOT APPROVED:** [PR #61 Gate L readiness review](engineering/V2_06B_B3C2R3B1_GATE_L_READINESS_REVIEW.md) audits exact PR head `5692082a2444eaa1b0373df5a2b67e4d91c5789a` against founder-approved Gate L/H. Exactly 8 approved paths, 33 other API source modules and 6 other workflows checked for production imports, 5 CI families successful with 53/53 PG18 TAP and 0 skipped. Does not certify hosted V2.
- **PR metadata accuracy:** Corrected only PR #61 description to say disposable command-owner temporarily owns **12** tables (3 secure + 9 context/match/outbox), not the outdated 3-table statement. PR code SHA unchanged; still DRAFT and UNMERGED. Hosted Render QA remains live with autoDeploy disabled and original deployment unchanged.
- **46-area disposition:** 42 PROVEN in offline disposable test model / 2 PARTIAL (R3B-38, R3B-42) / 2 BLOCKED (R3B-39, R3B-46). No falsely counted release pass. Test fixture owner-rights/SECDEF/HMAC must never be used in production; source-tree import fence needs preserving.
- **Next explicit founder approval required:** Only a fresh, named **PR #61 Gate L repository-only code merge** may allow transition out of draft, after last-minute SHA/CI/import-fence checks. Gate H security role, key provider, Neon migration, V1 compatibility, Android, R0 and final V2-16 all remain separately gated and **HOLD_V2**.

