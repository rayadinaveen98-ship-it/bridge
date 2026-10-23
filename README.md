# Bridge — social discovery platform (working codename)

**Current status: research + offline prototype + early backend code, SQL schema and tests. Backend is not deployed and does not permit public signup. No Android APK exists.**

Bridge is an adult-oriented, pseudonymous social discovery concept built around **Discover → Match → Talk → Mutually Connect → Reconnect**. Its purpose is engaging spontaneous conversations that may become ongoing relationships with both parties' consent.

## What exists

- [Offline interactive V1 prototype](prototype/bridge-v1.html) — mobile-first standalone HTML with 18 screen destinations, simulated matching/chat, mock reporting and mutual connection experience.
- [Prototype screen & interaction spec](docs/product/PROTOTYPE_FLOW_V1.md) — source-of-truth flow details, demo limitations and checklist.
- [Product definition](docs/product/PRODUCT_DEFINITION_V1.md) — intended users, feature scope, non-goals, retention and success metrics.
- [Architecture](docs/engineering/ARCHITECTURE_V1.md) — proposed infrastructure and data boundaries, not deployed systems.
- [Trust & safety](docs/safety/TRUST_AND_SAFETY_V1.md) — safety, privacy and compliance gates before testing with real users.
- [Market and business study](docs/research/FEASIBILITY_AND_BUSINESS_V1.md) — assumptions, unit economics and validation questions.
- [Roadmap](docs/ROADMAP.md) and [decision log](docs/DECISIONS.md).
- [Design tokens](design/tokens/bridge.v1.json) and [V1 component specification](design/DESIGN_SYSTEM_V1.md).
- [Pure matching-domain reference and tests](packages/matching/) — matching eligibility, safety exclusions, language-neutral ranking.
- [Internal API implementation](apps/api/) — RS256-authenticated HTTP gateway, PostgreSQL transactions for matching/messaging, blocking, report intake and mutual connections. **Authenticated internal SSE notification delivery** and outbox polling are implemented in code, not deployed for live users.
- [Live-message delivery protocol and limitations](docs/engineering/REALTIME_SSE_M1.md) — stream, replay, block checks and single-node restrictions.
- [Flutter Android internal client](apps/mobile/) — laboratory-only test APK source; validated build workflow, no public user signup.
- [Proposed PostgreSQL migration](database/migrations/0001_bridge_foundation.sql), [API endpoints](docs/engineering/M1_API.md) and [state machine contract](docs/engineering/M1_STATES.md). Not deployed or applied.

Open `prototype/bridge-v1.html` in a browser. Demo users, messages, reports, age-gating and permissions are **simulated**. No real accounts, real chat, database, moderators, verified encryption, age-assurance service or monetization is present.

## Locked principles

- Adults-only intended service; adequate age assurance, legal review and human moderation required to launch.
- Pseudonymous **to peers**, but accountable to platform abuse controls.
- Permanent connections require **mutual affirmative consent**.
- **Equal treatment for supported languages**: no Telugu-first or country-first prioritization; explicit, unranked conversation-language selection. Language availability requires actual safety/translation support; the demo is only English UI.
- Never fabricate users/online counts or impersonate humans with bots.
- Do not falsely claim end-to-end encryption.
- Basic connection and safety tools remain free.

## Foundation tests

Use Node.js >=22. Run `npm test --prefix packages/matching` for pure matching rules and static schema/design/API contract checks. Run `npm test --prefix apps/api` for offline HTTP/auth, rate limiter and fake-database tests. The separate real PostgreSQL test requires a disposable `bridge_test` database and is configured in GitHub Actions; the [GitHub Actions PostgreSQL 16 integration run](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488) passed after applying migrations 0001 and 0002 and checking real-database matching, messaging, outbox retries, blocks, reports and RLS isolation. The [live-notification integration CI run](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39934866721) also passed two authenticated-client tests and real outbox-to-stream tests. See [database integration instructions](docs/engineering/POSTGRES_TESTS.md).

## Proposed production tech stack (not yet deployed)

Flutter; TypeScript/NestJS; PostgreSQL with Supabase; server-authoritative matching; managed realtime messaging; Firebase Cloud Messaging; React/Next.js safety dashboard; GitHub Actions.

## Repository handling

Do not commit API keys, authentication secrets, raw private conversations, report evidence or personal information. Public repo visibility does not equal open-source licensing: no license chosen.

**Android M1 internal build:** [Flutter test client](apps/mobile/) is implemented. [PR #3](https://github.com/rayadinaveen98-ship-it/bridge/pull/3) merged after [Android CI run 39937613672](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39937613672) passed Flutter analysis, tests, and debug APK compilation. The APK is an ephemeral GitHub Actions artifact (7-day retention), not a signed release or public app. **Next:** test two physical Android devices against a dedicated internal backend; harden token/session revocation, durable cursor storage, distributed abuse controls, age assurance and staffed moderation. SSE is single-process and loopback-only, not public.


## M2 internal sign-in checkpoint (2026-10-23)

[PR #4](https://github.com/rayadinaveen98-ship-it/bridge/pull/4) merged. The Flutter internal APK now has a test-account/passphrase login instead of manual JWT input. The backend exchanges locally verified salted-scrypt credentials for 30-minute RS256 JWTs; the route is disabled by default and loopback-only. A private Windows Docker lab launcher is at [`scripts/Start-BridgeLocalLab.ps1`](scripts/Start-BridgeLocalLab.ps1). Do **not** use any other app's Supabase project; Bridge has no dedicated deployed database yet.

[Flutter APK CI](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39942130635) and [backend/PostgreSQL CI](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39942130666) both passed. The artifact is a debug build and expires according to GitHub Actions retention. The in-chat APK copy is not a public service or production release. No live two-device hardware tests, public registration, age-assurance provider, or staffed moderation exist.
