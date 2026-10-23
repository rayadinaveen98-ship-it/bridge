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

## Reconciliation note

Early planning explored a Telugu/English-focused pilot for liquidity. The **latest prototype and flow specification explicitly supersede any language-first product policy**: conversational language choice is unranked and user-controlled. Operational launch coverage and pilots still depend on actual staffing and evidence, not a hidden preference embedded in the matching system.
