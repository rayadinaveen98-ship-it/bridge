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
