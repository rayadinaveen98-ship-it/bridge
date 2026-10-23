# Bridge — Interactive Prototype V1

**Status:** Offline UX prototype, not a functional social network.  
**Working name:** Bridge (codename only).  
**Market hypothesis:** Global, multilingual adult social discovery. Every supported language has equal product standing; no geography- or language-first hierarchy in discovery or matching.  
**Current scope:** One-file mobile-first prototype, 18 user-facing screen destinations, simulated one-to-one conversations, no backend or real people.

## 1. Product thesis

Help adults move from a spontaneous meeting to a respectful, mutually agreed ongoing connection without requiring a public real-world identity. The first usable loop is **Discover → Match → Talk → Decide → Reconnect**.

Product pillars: Fast to start; safe to leave; transparent about who is real; anonymous to peers but accountable to the platform; meaningful repeat visits.

## Language equality policy (latest accepted prototype refinement)

- There is **no Telugu-first, Hindi-second, English-first or country-first product hierarchy**. All launched conversation languages have equal feature and safety standards.
- Users explicitly select languages; no language is preselected or silently inferred from device locale or location. Catalogue entries are alphabetic or neutrally ordered, with search and custom demo entry.
- A match requires at least one shared language. Multiple shared languages do not imply priority from list order. No automatic fallback without consent.
- Conversation-language support is not the same thing as interface localization. The prototype interface is English-only, and real production support requires accessible translated copy, appropriate fonts and bidirectional support, trained moderation and user support.
- Low liquidity in one language should produce truthful wait times, **not hidden preference toward another language**. Match and safety quality should be measured for each supported language.
- The demo catalogue demonstrates choice only; it does **not** prove worldwide moderated or translated coverage.

## 2. Navigation and screens

| # | Destination | Key UX states | Primary transition |
|---|---|---|---|
| 01 | Welcome | Introduction, adult-only label | Age eligibility |
| 02 | Age eligibility | Unconfirmed, confirmed, validation error | Safety agreement |
| 03 | Safety agreement | Rules, consent required | Identity |
| 04 | Identity | Avatar selection, nickname validation | Preferences |
| 05 | Preferences | Unranked multilingual choices, interests, conversation intent | Discover |
| 06 | Discover | Quick Chat, interests, explanation | Queue or Topics |
| 07 | Topics | Topic selection, start | Queue |
| 08 | Matchmaking | Searching, demo match, cancellation, blocked-no-match | Conversation / Discover |
| 09 | Conversation | Incoming/outgoing messages, prompts, menu | End / Report / Block |
| 10 | Chat actions | Leave, report, block | End / Report / Discover |
| 11 | End chat | Decline, pending request, simulated mutual acceptance | Discover / Connections |
| 12 | Connections | Empty, pending, saved connection | Direct messages |
| 13 | Direct messages | Post-consent conversation, remove and block | Connections |
| 14 | Profile | Avatar, nickname, interests, languages | Settings / editing |
| 15 | Settings | Notification / request preferences, privacy entry | Safety / Account |
| 16 | Safety & help | Community standards and support info | Report |
| 17 | Report | Reason, optional context, demo receipt | Discover |
| 18 | Account | Recovery explanation, no-storage disclosure, reset | Welcome |

The reporting confirmation is a transient outcome screen, not a new permanent navigation destination. The desktop review sidebar provides direct inspection shortcuts; ordinary users should not be able to bypass real onboarding gates.

## 3. Primary flow and rules

### Onboarding

1. Confirm adult eligibility. A real app **must not** treat the prototype checkbox as adequate age verification.
2. Accept community rules and privacy disclosures.
3. Choose pseudonym and avatar.
4. Choose at least one explicitly selected conversation language, with optional interests and intent; no language is preselected.
5. Enter Discover.

### Matching

- Eligibility, block status and an explicitly shared conversation language are hard requirements; no language has a preferred ranking.
- Intent is an important compatibility signal; interests should be softer signals while the community is small.
- Server is authoritative for queue membership and pairing; a user cannot join two active matches.
- Respect skipped/blocked users, duplicate requests, cancellation and reconnects.
- The demonstration uses a **Simulate a match** button and a fake identity labeled demo. It does not claim real online users.
- If the only demo participant is blocked, the prototype shows an honest no-eligible-match state instead of rematching.

### Conversation

- User sends a message; the prototype displays canned sample replies.
- Prompts/icebreakers are optional; there is no chatbot pretending to be human.
- Leave, block, and report are accessible through the conversation menu.
- Incoming messages should never override a user's decision to block/leave in the production app.

### Persistent connection

- A private connection request is possible after a conversation.
- A lasting connection exists only after a mutual yes.
- The prototype's explicit **Simulate mutual acceptance** button substitutes for the unavailable other participant.
- Real implementation should handle request expiry, request withdrawal, blocking, deletion, and mutual consent atomically.

### Trust and safety

- Production requirements: adult age controls, bot prevention, anti-spam, a live report pipeline, reviewer access restrictions, auditing, trained operational response, repeat offender handling, user appeals, and legal escalation.
- No production report/incident occurs when a user submits the sample form.
- Privacy messaging must truthfully distinguish pseudonymity, transport/storage encryption and independently verified end-to-end encryption.

## 4. Engineering V1 scope

Recommended implementation: Flutter Android client; NestJS or comparably testable service layer; PostgreSQL-backed accounts/conversations/consent records; managed real-time transport; push notifications; matching job/queue; and an independent web-based moderation dashboard.

Core entities: `accounts`, `identities`, `eligibility_records`, `preferences`, `blocks`, `match_queue`, `sessions`, `conversations`, `messages`, `connection_requests`, `connections`, `reports`, `enforcement_actions`, `audit_log`, `notifications`, `privacy_requests`.

Core services: Eligibility, Identity, Matchmaking, Messaging, Relationships, Moderation, Notification, Privacy. Server-side authorization is required on every private message and relationship mutation.

### Instrumentation (avoid message-body analytics)

- `onboarding_started`, `onboarding_completed`
- `matching_requested`, `match_found`, `match_cancelled`, `match_unavailable`, `match_wait_ms`
- `first_message_sent`, `conversation_completed`, `conversation_duration_sec`
- `connection_requested`, `connection_mutual`, `connection_declined`
- `report_submitted`, `report_triaged`, `block_applied`, `appeal_resolved`
- `retained_d1`, `retained_d7`, `retained_d30`

For MVP validation, report median/90th-percentile wait time, first-chat completion, day-7 retention, mutual connection rate, abuse reports per active chat and moderation response latency.

## 5. Review / test checklist

- [x] 18 primary views render without JavaScript runtime errors in a Chromium-based test.
- [x] Age gate and rules agreement prevent normal-flow progression without confirmation (demo only).
- [x] Nickname input and preference setup work.
- [x] Quick and topic discovery routes work.
- [x] Simulated match, message send and canned reply work.
- [x] Report demo leads to receipt that explicitly says it was not submitted.
- [x] Mutual-connect demo leads to direct messages.
- [x] Block prevents a new match with the only demo partner until reset.
- [x] Mobile layout at 390 × 844 renders, with bottom navigation and no external libraries.
- [ ] Test on physical Android and iOS devices and assistive technologies.
- [ ] Validate the entire flow with real adult target users.
- [ ] Conduct privacy, threat-model and legal/policy reviews.
- [ ] Build, test and staff actual moderation operations.
- [ ] Develop real authenticated accounts and independently tested security controls.

## 6. Decisions to make after prototype testing

1. Does Quick Chat or Topic Match produce more completed enjoyable conversations?
2. Should onboarding ask only language first, delaying interest setup until after the first conversation?
3. Is the chat interface intuitive on small, low-end Android devices?
4. Do users understand mutual connection privacy without explanation?
5. Do users trust the safety cues, and can they find reporting in an uncomfortable scenario?
6. What interest-based or cross-language pilot creates sufficient liquidity without privileging a specific language?

## 7. Important boundaries

The prototype runs fully offline. It has no real authentication, no age verification, no backend, no persistence, no encryption claims, no real messaging, no moderators, no operational blocking, no billing, and no submitted reports. It is for **interaction and layout feedback only**. Its visuals and project codename are provisional.