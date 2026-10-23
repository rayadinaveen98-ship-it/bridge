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
