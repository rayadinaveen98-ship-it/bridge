# Delivery roadmap and quality gates

## Completed: discovery and prototype
- Product thesis, competition/business risk review and rough economics.
- V1 product boundary, journey and 18-screen offline interaction prototype.
- Simulated match/chat/mutual-connect/report/blocked-demo flows.
- Proposed cross-language equality requirement (no preset language; user-selected shared language matching).
- Preliminary desktop/mobile prototype checks were reported in the original workflow. These are *not* a substitute for an independently reproducible repository CI run.

## Phase 3 — validate design and decisions
- Review flows on mobile with real consenting adult research participants (without hosting live stranger chat).
- Validate error, empty, loading, keyboard, smaller-display, screen-reader, light/dark and RTL states.
- Verify legal exposure, app-store policies and age assurance approach.
- Finalize architecture acceptance criteria, privacy data map and moderation operating model.

## Phase 4 — backend foundation
- Accounts, privacy controls, authentication sessions and abuse limits.
- Schema migrations, transactional matching state machine and message persistence.
- Strict authorization for all conversation and mutual-connection operations.
- Report queue, reviewer roles, audit logging, retention and deletion functionality.

## Phase 5 — Android M1
- Flutter app on two physical Android devices.
- A real compatible match; ordered durable messages; reconnect; end and block; mutual save.
- Working server-side safety actions, not simulated dialogs.

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
