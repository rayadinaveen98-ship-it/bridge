# Bridge Product Invariants V1 — approved contract register

**Decision status:** APPROVED by founder on 2026-11-15. This document records the previously approved BR-001–BR-029 invariants and numeric defaults. It does not certify implementation or physical QA.

**Change control:** Product contract changes need explicit founder approval; source, API tests, device QA and migration impact must be reconciled before implementation. No production users or public chat are authorized.

## Constitution

Bridge is an adult-only, pseudonymous social discovery platform. Strangers can talk temporarily; only **two independent Keep decisions** create a lasting, revocable connection. Free mutual connections can chat again whenever eligible. Payment may provide optional **prospective jointly consented history**, never purchase access to someone else. Privacy, reporting, blocking and legally required rights remain free.

## Approved immutable contract

| ID | Invariant |
|---|---|
| BR-001 | Public discover/send requires active account, genuine adult eligibility, safety eligibility and required policy acknowledgment. Synthetic QA eligibility does **not** constitute age verification. |
| BR-002 | Every supported language has equal standing; user explicitly chooses languages; matching requires a common moderation-ready language with no hidden geographic/language preference. |
| BR-003 | At most one active random match slot per account; transactional and idempotent search/match/cancel, including multi-device races. |
| BR-004 | Random conversation expires after **30 minutes without a newly accepted unique message**; clock and deadlines are server-owned. Viewing, typing, polling, notifications, reconnecting and duplicate retry do not extend expiry. |
| BR-005 | Back/relogin can resume only the **same currently active and unexpired** random session; this is not an ordinary history feature. |
| BR-006 | End, expiry or safety termination of a random session is irreversible. Neither paying nor guessing IDs can restore it; slots are released safely. |
| BR-007 | Each member independently elects Keep on an eligible active random conversation; a pending unilateral vote grants no future messaging; withdrawal is allowed before conversion. |
| BR-008 | Only two current Keep votes, eligible pair, no blocks and an atomic server transaction can create one mutual connection. Stale votes never revive a terminated session. |
| BR-009 | **Free** participants with an active mutual relationship can initiate future communication whenever eligible; this is not a paid entitlement. |
| BR-010 | Connection identity and historical transcript are distinct. Original random content is **never automatically imported** to future mutual-session history. |
| BR-011 | Either person may end the relationship or block the other; access is revoked on the server, never restored by payment. |
| BR-012 | A free account can see its *current* authorized live conversation, its active mutuals and eligible unread deliveries, but **no previous-message timeline or ended random chats** in ordinary APIs. |
| BR-013 | Offline messages for an eligible mutual peer use finite, recipient-scoped unread delivery, not a browsable previous-session transcript. |
| BR-014 | Free-history denial applies to APIs, subscriptions, notifications, local storage, device restore, pagination, caches and old app versions; UI hiding is insufficient. |
| BR-015 | Premium history can include only prospectively eligible messages accepted under an applicable policy; never old deleted random conversations or a retroactive unlock. |
| BR-016 | Both participants must affirmatively consent to retention with clear scope, purpose, duration and revocation rules before eligible retention begins. |
| BR-017 | Premium never overrides eligibility, a block, relationship revocation, expired room, bilateral consent or safety. Expired/revoked grants cease authorizing history reads. |
| BR-018 | During development, pricing is **₹0** with backend-issued, audited, scoped TEST entitlements. No production purchase, subscription or real processor is approved. |
| BR-019 | Reporting and blocking are free and server-enforced; a limited post-end report path must not reopen transcript history. |
| BR-020 | Case evidence is separate, access-restricted, audited, time-limited and **never** a paid user feature. |
| BR-021 | Hidden ordinary messages are not automatically deleted; approved finite retention, purge, evidence and legal holds must be separately enforced and accurately disclosed. |
| BR-022 | Legally applicable privacy access/export, account deletion and other rights remain free, with truthful explanation of lawfully preserved records/backups. |
| BR-023 | Peer-facing pseudonymity is not operator-facing anonymity; **do not claim E2EE** unless separately built and validated. Screenshots by recipients cannot be prevented. |
| BR-024 | Authentication, authorization, expiry, participant ownership, blocks, history consent and paid entitlement are checked centrally on the backend for **every** sensitive operation. |
| BR-025 | Policies use stable identifiers and versioned decisions with tests, audit and founder-approved changes; no silent weakening through config. |
| BR-026 | Existing synthetic accounts/messages/conversations survive explicit reviewed **non-destructive** migrations; no automatic legacy cleanup. |
| BR-027 | **Android first.** iOS is a separate app-store feasibility and approval decision. |
| BR-028 | No public random matching or real-user beta before operational adult eligibility, moderators, reporting response, abuse defense, security/privacy and incident gates pass. |
| BR-029 | Each invariant requires traceable backend tests, Android tests where applicable and actual hardware acceptance; CI success alone is not release evidence. |

## Approved defaults D-01–D-05

| ID | Binding decision |
|---|---|
| D-01 | Only a **new accepted unique message** resets a random-session 30-minute inactivity clock. |
| D-02 | Recipient-scoped free mutual unread delivery **up to 7 days**, with no historical pagination. |
| D-03 | Original stranger transcript is **not copied or converted** into mutual-conversation history. |
| D-04 | Premium retention requires **both parties' affirmative prior consent**, independent of purchase. |
| D-05 | Normal random-body purge target **within 24h after termination** with a distinct post-end report facility. |

## Additional architecture decisions already approved (separate scope)

**D-06a:** Mutual relationship persists until revoked; each direct-chat segment closes after **30 minutes of newly accepted-message inactivity**. A new direct segment may start for free.

**D-06b:** Consumed delivery supports **15-minute bounded recovery** after acknowledgment; unread envelope hard maximum **7 days**.

**D-07a:** Restricted evidence normal cases **90 days after closure**, serious/escalated/appealed **180 days after closure**; unresolved reviewed every 30 days, escalated for necessity review at 90 days, ordinary unresolved outside cap 180 days from creation absent documented escalation/hold. Legal review is required before real-user operation.

**D-07b:** Post-end random report token **7 days**; available message bodies can be snapshotted only while ordinarily retained (**24-hour purge target**). Later reports do not imply inaccessible text still exists.

**H-01:** Prospective premium history **90-day rolling horizon** for both-consented messages; viewer needs entitlement; withdrawal denies reads immediately, ordinary copies scheduled for deletion within 24h except lawful evidence.

**M-01:** Existing synthetic test room/messages are grandfathered as **legacy_qa** in a future explicitly authorized migration and must not be automatically expired/purged.

These architecture details are approved **for documentation and implementation planning only**. They do not approve application changes, migrations, deployment, billing setup or paid costs.

## Conflict-resolution order

1. Applicable law and appropriately authorized, documented safety preservation.
2. Active safety restrictions, block, deleted/restricted account, adult eligibility.
3. Approved Product Invariants V1 and explicitly approved V2 policy amendments.
4. Scope-limited, authenticated relation/session permissions.
5. Scoped free/premium entitlements.
6. UI convenience and analytics.

Where policy information is missing, **deny protected reads/writes**; allow a safely authenticated route to report abuse or exercise legal privacy rights. Do not leak whether a guessed ID exists.

**Source context:** Original approved V1 specification appeared in the founder conversation on 2026-11-15. This register is a normalized preservation of that decision record; it is not an implemented feature list.
