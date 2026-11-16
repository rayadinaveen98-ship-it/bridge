# Decision log

_2026-10-23. Documented from project discussions and the latest offline artifact._

| Decision | Status | Reason |
|---|---|---|
| Working codename Bridge | Temporary | Branding/name not final |
| Combined discovery + mutual friendship product | Agreed direction | Differentiate through the complete conversation-to-connection experience |
| Android-first production | Proposed | App Store restrictions make pure anonymous/random chat risky on iOS |
| 18-screen offline interactive prototype | Completed | Flow validation before substantial infrastructure spend |
| English-only demo UI, explicit unranked multilingual conversation preferences | Latest prototype baseline | Language equality without unsupported worldwide operational claims |
| No geography-first or language-first feature priority | Latest documented requirement | All supported languages have equal product standing |
| Text-first UX | Agreed V1 | Lower infrastructure and abuse risk than voice/video |
| Mutually accepted relationships | Agreed V1 | Consent-based continuation |
| Blocking/reporting and moderation operations before real public release | Mandatory | UGC abuse and legal responsibilities |
| Flutter + NestJS + PostgreSQL/Supabase | Architectural proposal | Needs proof-of-concept and load tests |
| Pure matching-domain eligibility/ranking and PostgreSQL schema | Foundation committed | Design / test artifacts, not live authorization or deployed backend |
| Light/dark UI design tokens | Initial baseline | Accessibility, RTL, contrast and device tests remain |
| End-to-end encrypted chat | Not claimed / not implemented | Requires dedicated security design and review |
| Monetization through optional premium/cosmetics and limited ads | Hypothesis | Must validate willingness-to-pay and contribution economics |
| Final name / pricing / public release date | Open | Dependent on testing, policy and funding |
| Internal loopback HTTP gateway + PostgreSQL transaction service | Implemented, internal only | No public deployment; framework decision may be revisited |
| PostgreSQL 16 integration suite | Passed in GitHub Actions | Synthetic fixtures and scoped transaction tests |
| In-memory per-subject rate limiter | Laboratory-only | Must become distributed anti-abuse controls |
| Authenticated single-process SSE + durable replay | Implemented and CI verified | See M1 live-delivery spec; no distributed broker yet |
| Flutter M1 internal Android client | Built and debug APK CI passed | Synthetic-account lab only; no physical two-device certification, no public release |
| M2 no-manual-JWT lab login | Implemented, CI passed | Synthetic pre-provisioned users, 30-minute signed tokens, loopback-only; public login forbidden |
| Windows local Docker lab bootstrap | Committed | Requires user's machine with Node.js 22+, Docker Desktop; cannot reach users from public internet |

## Reconciliation note

Early planning explored a Telugu/English-focused pilot for liquidity. The **latest prototype and flow specification explicitly supersede any language-first product policy**: conversational language choice is unranked and user-controlled. Operational launch coverage and pilots still depend on actual staffing and evidence, not a hidden preference embedded in the matching system.

## Latest authoritative decisions — 2026-11-15 (supersede older proposals)

**Source:** Founder-approved [Product Invariants V1](product/PRODUCT_INVARIANTS_V1.md) and [Architecture V2](engineering/ARCHITECTURE_V2.md). This section updates **decision status**, not app implementation or device-test status.

| Decision | Decision status | Implementation / constraint |
|---|---|---|
| Android-first | **APPROVED** | Public Android release NOT approved; iOS remains separate policy gate |
| Existing Flutter Android + Node.js modular monolith + Neon/PostgreSQL | **APPROVED ARCHITECTURE** | Existing runtime deployed for private synthetic QA, not production |
| Unranked, explicitly user-selected shared moderation-ready languages | **APPROVED** | No language/geography-first product roadmap or hidden preference |
| Temporary stranger chat and 30-minute inactivity | **APPROVED** | Server 30m expiry **NOT IMPLEMENTED**, distinct from old 60s match reservation |
| Mutual Keep creates durable revocable relationship | **APPROVED** | Current code in-place changes `random -> connection`; V2 needs immutable random source and new direct session |
| Mutual connections can send new direct messages free | **APPROVED** | 30m direct-segment idle, 7d unread max, 15m ack recovery proposed then approved in D-06 |
| Free no previous chat-history timeline | **APPROVED** | Current generic v1 replay endpoint remains a blocker until safe cutover |
| Future optional premium history | **APPROVED** | Prospective only after two valid consents; 90d rolling and viewer entitlement; QA TEST grants at ₹0; NO REAL BILLING |
| Random messages and case evidence | **APPROVED POLICY** | Normal 24h post-end body purge target; 7d report token; case evidence 90d normal/180d serious; **NOT IMPLEMENTED** and still subject to pre-beta legal review |
| Existing four-message QA fixture protection | **APPROVED ARCHITECTURE** | Non-destructive migration and `legacy_qa` grandfathering only after separate migration authorization |
| Central server authorizer and least-privilege runtime | **APPROVED ARCHITECTURE** | Current Neon inspection owner BYPASSRLS; actual Render runtime role needs verification |
| Implementation packages V2-01 through V2-15 | **ORDER / PR BOUNDARIES / TEST AND ROLLBACK GATES APPROVED FOR PLANNING — NOT APPROVED TO EXECUTE** | See [V2 package plan](engineering/V2_IMPLEMENTATION_PACKAGES.md); every code/migration/deploy/destructive action needs separate approval |
| Public stranger matching, real payments, paid services, iOS | **NOT APPROVED** | No real-user beta until actual adult verification, legal/compliance and staffed safety operations pass |

**2026-11-15 documentation approval:** The founder approved DOC-00 draft PR #15 for a docs-only review/merge and the package sequence and boundaries. Full 138-case What If? review remains proposed **V2-16 at the end**. R0 device acceptance remains OPEN. No application source, database, cloud deployment, billing or public beta authorization accompanies these approvals.

**Historical conflict note:** Early records describing NestJS/Supabase, zero deployed backend or Android-first as only proposed are not the current design/operational baseline. Keep those entries for history, but always use the dated **2026-11-15 approved V2** decisions above when planning. No development or release was authorized by recording these decisions.

## V2-03 execution boundary — status update 2026-11-16

- **V2-02:** Pure central policy kernel and tests IMPLEMENTED/CI VERIFIED, PR #18 merged at `7721afbb`. Not integrated with production/private QA HTTP routes; no claims of live authorization or physical acceptance.
- **V2-03:** [Database expansion implementation brief](engineering/V2_03_IMPLEMENTATION_BRIEF.md) PREPARED FOR REVIEW. No SQL schema implementation, live migration, change to message bodies, data deletion, server integration or infrastructure privilege change authorized.
- **Recommended technical policy (proposed, not yet approved as implementation):** retain original random source conversations and FKs; create new direct-session records; introduce scoped unread/history/evidence tables without backfilling old records; preserve original `bridge_messages.body NOT NULL` until separately authorized safe read/retention cutover.
- **Existing approval preserved:** R0 hardware verification still OPEN; exhaustive What If? audit final V2-16; no payment, moderation vendor, public beta or production release authorized.

## V2-04 random lifecycle — planning-only decision register, 2026-11-16

- **V2-03 completed (disposable):** PR #20 merged at `a922f63d`, 0004–0007 SQL files and migration/backup tests passed CI. SQL not applied to live Neon and existing tester records untouched.
- **V2-04 plan drafted:** [V2-04 exact implementation brief](engineering/V2_04_IMPLEMENTATION_BRIEF.md) outlines exclusive 30-minute DB-clock expiry, atomic terminal/slot cleanup, current-room-only recovery, zero revival and duplicate-idempotency no-reset semantics.
- **New proposed implementation boundary, not yet founder-approved:** V2-04A session module under `apps/api/src/sessions/**`, synthetic PostgreSQL 16 tests, isolated CI and evidence, **disconnected from current routes**. Separate live migration and API activation are required; no direct relationship conversion in V2-04.
- **No new product rule:** all decisions retain BR-004–008 and D-01 from approved V1/V2. No new device/session-auth behavior, feature monetization, paid service or public beta authorized.
- **R0 real phone/tablet acceptance still OPEN;** 138-case comprehensive audit remains final V2-16.

## V2-05 mutual connections and direct segments — proposed execution boundary, 2026-11-16

- **Baseline:** V2-04A isolated random-session engine merged as PR #22 at `1ef086c6`, post-merge CI passed. Hosted QA still runs the unchanged older API; no live Neon migration.
- **Product policy unchanged:** two independent current Keep votes create one revocable mutual relationship; new direct sessions are free, individually 30-minute-idle and do not copy random history; a terminated direct segment does not revoke the mutual relationship; block/unmatch does. Prior stranger transcript remains separate.
- **Engineering brief prepared (NOT APPROVED FOR CODING):** [V2-05A Keep + Direct sessions](engineering/V2_05_IMPLEMENTATION_BRIEF.md). Recommend a disconnected transaction-engine + disposable PG16 tests, including 30 C05 tests and rollback/legacy preservation.
- **Critical real integration blocker:** old `castVote()` mutates source in-place and `connections()` expects source OPEN; no old endpoint is appropriate for new V2 direct IDs without separate V2-11 read-scope protections.
- **No new implementation authorization:** do not change application code, SQL, Neon, Render, Android, billing, retention or test-account data from this documentation. R0 physical-device acceptance is still OPEN and full 138-case What If? review remains final V2-16.
