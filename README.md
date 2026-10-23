# Bridge — social discovery platform (working codename)

**Current status: research + offline prototype + early production foundation contracts and pure matching-domain code. No backend/mobile production app is deployed.**

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
- [Pure matching-domain reference and tests](packages/matching/) — matching eligibility, safety exclusions, language-neutral ranking. Not a production reservation service.
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

Run `npm test --prefix packages/matching` with Node.js >=20. This exercises pure matching rules and static schema/design/API contract checks. PostgreSQL migration integration tests, security tests and physical device tests remain pending.

## Proposed production tech stack (not yet deployed)

Flutter; TypeScript/NestJS; PostgreSQL with Supabase; server-authoritative matching; managed realtime messaging; Firebase Cloud Messaging; React/Next.js safety dashboard; GitHub Actions.

## Repository handling

Do not commit API keys, authentication secrets, raw private conversations, report evidence or personal information. Public repo visibility does not equal open-source licensing: no license chosen.

**Next:** Build and validate the transactional backend on a disposable database, age-assurance and moderator roles, then Flutter M1 with two consenting adult test devices. No public beta before safety/legal/operations readiness.
