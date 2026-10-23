# Bridge V1 — production design baseline

**Status:** implementation specification, not signed-off visual QA. The approved offline prototype is the interaction reference; these are candidate tokens.

## Design philosophy
Calm, premium and human. Conversations should feel more important than gamified UI. One primary action per screen; clear visibility of the anonymous-to-peers model. No deceptive scarcity or fake online counts.

## Core components
- AppShell: safe areas, device system bars, accessible page headings and back behavior.
- BottomNavigation: Discover / Connections / Me; focus and route persistence.
- PrimaryButton, SecondaryButton, CriticalAction: differentiated by semantics, not color alone.
- InterestChip and LanguageSelector: keyboard/screen-reader operable, search, custom language proposal as *demo only*. Enabled languages come from operationally supported server catalogue.
- MatchStatus: idle, searching, reserving, connected, unmatched, cancelled, timeout, reconnecting.
- MessageBubble and Composer: timestamp, send/pending/retry/read states, max-length feedback.
- MutualConnectDialog: separate opt-in by both participants, withdrawal supported.
- TrustActions: report, block and leave accessible from active and saved conversations.

## Accessibility
- Screen readers: distinct role/label for all icons; headings in semantic order; announcements for status changes.
- Target size at least 44 × 44 logical pixels where applicable; focus visible; adequate gesture alternatives.
- Respect dynamic font scaling (200% acceptance check), reduced motion, OS light/dark preference, contrast at WCAG AA.
- Bidirectional layout for RTL languages only after testing. English-only prototype is not proof of localization.

## Screen-level states
| Surface | Happy path | Required edge states |
|---|---|---|
| Welcome / age | Eligible adult advances | Ineligible, validation unavailable, consent declined |
| Identity | Choose pseudonym/avatar | Duplicate, profanity, connectivity, recovery needed |
| Language & interests | Select shared-language preference | None selected, unsupported, search empty, invalid custom entry |
| Discover | Quick Chat or Topic Match | No availability, restricted account, unsupported language |
| Match | Reserved -> active | Timeout, cancelled, simultaneous reservation conflict, disconnect |
| Chat | Message send and receipt | Pending, resend, duplicate suppressed, block, connection lost |
| End chat | Leave or mutual save | Other declined, request withdrawn, blocked, expired |
| Connections / DM | Reconnect | Unread, empty, unavailable, user removed, appeal |
| Report | Category and evidence consent | Offline, duplicate report, urgent danger escalation |
| Settings / deletion | Privacy and recovery | Export pending, deletion confirmation, legal hold |

## Motion
- Search animation must not obscure cancel; no artificial queue timers.
- Connect success animation <= 320ms. Honor reduced-motion setting (0ms).
- Background-to-foreground transitions preserve state without losing accepted messages.

## Prototype-to-implementation boundaries
Don't embed fake profiles or predetermined "matches" in a release build. Don't send message bodies to analytics. Don't render real identifiers or precise geography.
