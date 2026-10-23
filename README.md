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
- [Internal API implementation](apps/api/) — RS256-authenticated HTTP gateway, PostgreSQL transactions for matching/messaging, blocking, report intake and mutual connections. Not deployed or age-verified for live users.
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

Use Node.js >=22. Run `npm test --prefix packages/matching` for pure matching rules and static schema/design/API contract checks. Run `npm test --prefix apps/api` for offline HTTP/auth, rate limiter and fake-database tests. The separate real PostgreSQL test requires a disposable `bridge_test` database and is configured in GitHub Actions; the [GitHub Actions PostgreSQL 16 integration run](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488) passed after applying migrations 0001 and 0002 and checking real-database matching, messaging, outbox retries, blocks, reports and RLS isolation. See [database integration instructions](docs/engineering/POSTGRES_TESTS.md).

## Proposed production tech stack (not yet deployed)

Flutter; TypeScript/NestJS; PostgreSQL with Supabase; server-authoritative matching; managed realtime messaging; Firebase Cloud Messaging; React/Next.js safety dashboard; GitHub Actions.

## Repository handling

Do not commit API keys, authentication secrets, raw private conversations, report evidence or personal information. Public repo visibility does not equal open-source licensing: no license chosen.

**Next:** Audit load/concurrency, implement an actual authenticated realtime publisher and device message subscriptions, then add age-assurance and staffed moderation before any real user trial. Flutter integration and APK remain pending. No public beta before safety/legal/operations readiness.
