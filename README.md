# Bridge — social discovery platform (working codename)

**Current status: product research + interactive offline prototype. Production implementation has NOT begun.**

Bridge is an adult-oriented, pseudonymous social discovery concept built around **Discover → Match → Talk → Mutually Connect → Reconnect**. Its purpose is engaging spontaneous conversations that may become ongoing relationships with both parties' consent.

## What exists

- [Offline interactive V1 prototype](prototype/bridge-v1.html) — mobile-first standalone HTML with 18 screen destinations, simulated matching/chat, mock reporting and mutual connection experience.
- [Prototype screen & interaction spec](docs/product/PROTOTYPE_FLOW_V1.md) — source-of-truth flow details, demo limitations and checklist.
- [Product definition](docs/product/PRODUCT_DEFINITION_V1.md) — intended users, feature scope, non-goals, retention and success metrics.
- [Architecture](docs/engineering/ARCHITECTURE_V1.md) — proposed infrastructure and data boundaries, not deployed systems.
- [Trust & safety](docs/safety/TRUST_AND_SAFETY_V1.md) — safety, privacy and compliance gates before testing with real users.
- [Market and business study](docs/research/FEASIBILITY_AND_BUSINESS_V1.md) — assumptions, unit economics and validation questions.
- [Roadmap](docs/ROADMAP.md) and [decision log](docs/DECISIONS.md).

Open `prototype/bridge-v1.html` in a browser. Demo users, messages, reports, age-gating and permissions are **simulated**. No real accounts, real chat, database, moderators, verified encryption, age-assurance service or monetization is present.

## Locked principles

- Adults-only intended service; adequate age assurance, legal review and human moderation required to launch.
- Pseudonymous **to peers**, but accountable to platform abuse controls.
- Permanent connections require **mutual affirmative consent**.
- **Equal treatment for supported languages**: no Telugu-first or country-first prioritization; explicit, unranked conversation-language selection. Language availability requires actual safety/translation support; the demo is only English UI.
- Never fabricate users/online counts or impersonate humans with bots.
- Do not falsely claim end-to-end encryption.
- Basic connection and safety tools remain free.

## Proposed tech stack (not implemented)

Flutter; TypeScript/NestJS; PostgreSQL with Supabase; server-authoritative matching; managed realtime messaging; Firebase Cloud Messaging; React/Next.js safety dashboard; GitHub Actions.

## Repository handling

Do not commit API keys, authentication secrets, raw private conversations, report evidence or personal information. Public repo visibility does not equal open-source licensing: no license chosen.

**Next:** Validate flows and implement M1: two eligible real Android devices exchange reliable messages with working server-side blocks and reporting. No public beta before safety/legal/operations readiness.
