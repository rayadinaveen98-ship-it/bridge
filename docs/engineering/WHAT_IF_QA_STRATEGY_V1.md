# Bridge — What If? Scenario Coverage & QA Plan V1

**Status:** PROPOSED FOR FOUNDER REVIEW. No implementation or live QA data mutation authorized.  
**Source of cases:** [138-case Scenario Atlas V1](../product/WHAT_IF_SCENARIO_ATLAS_V1.md), IDs `WF-A01` through `WF-L12` (variable end per group).  
**Policy authority:** [Approved Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md), [Approved Architecture V2](ARCHITECTURE_V2.md). New UX behavior marked proposed in atlas remains unapproved.  
**Baseline:** `main@3578565a`; two synthetic cloud QA accounts only, R0 physical acceptance open. No public user, real age assurance, staffed moderation, payment processing or V2 schema deployed.

## Recommended new planning gate: V2-00 — scenario and lifecycle contract freeze

Insert **V2-00** after documentation DOC-00 and ahead of V2-01 contract tests. **G0 R0 physical acceptance is independent and must still finish** before privacy cutover.

### V2-00 documents (no code)
1. Scenario Atlas, grouped by user-visible journey and critical backend failure.
2. Exact proposed flow text for each P0 scenario; align with approved V1/V2 definitions.
3. Separate **authentication session RFC**: sign-in vs logout vs app/background vs 30-minute chat expiry; per-device revocable credentials and token recovery; decisions UX-A01/A02/A03/UX-P01.
4. Search presence RFC: foreground lease vs process death vs 120s queue; decision UX-M01.
5. Safety report/incident UX: report vs block vs leave; post-end 7d intake and 24h payload purge; decisions UX-S01/02/03.
6. Approved retention and QA privacy paths for notifications, backups, screenshots and test entitlements.
7. Traceability matrix: WF-case -> approved/proposed -> V2 package -> automated test -> two-device test -> release gate.
8. Founder signs off on **remaining proposed UX policies**, not silently through documentation merge.

**V2-00 exit:** Each P0 has approved outcome or explicit hard gate blocking development, exact expected user feedback, server privacy policy, and runnable test specification. No P0 contradicts V1/V2; no unsupported public launch assumption.

## Five distinct kinds of identity and time state

| Concept | Rule | Why not conflate |
|---|---|---|
| App/activity/process lifecycle | May close, background or die at any time | App close is NOT server logout or End |
| Account authentication session | Current QA access JWT = 30min, in memory; production credential renewal is PROPOSED | Secure sign-in can outlive any one random session; revoked logout must be respected |
| Match search/queue | Existing waiting request up to 120s, reservation lease 60s distinct | It is not a random-chat lifetime; foreground presence lease not yet defined |
| Random chat | Approved 30min since activation or last **new accepted message** | Viewing, notification, typing, Keep pending, app resume do not reset |
| Mutual relationship and direct segments | Relationship persists while authorized; direct segment 30min idle | Ending direct chat does not end mutual relationship |
| Unread delivery | Up to 7d and 15m acknowledged recovery window | Does not authorize historical pagination |
| History / case data | Jointly consented direct history <=90d; random body purge target 24h; evidence 90/180d | May be server-retained under narrow legal/safety rules without account history |

## UX flow scripts to turn into acceptance tests

### Journey J-01: Abrupt exit/reopen
- Given active 5-minute-old random chat with valid identity and consent, user kills app.
- On reopen, app safely restores session if renewal is possible, boots from server, checks current room and message permissions.
- If room still active, returns to **current** random chat; not archived history.
- If 35m passed with no newly accepted messages, app may be signed in but room is expired: show "This conversation ended after 30 minutes without a message." Do not reopen old text.
- If user explicitly logged out, app must require authentication again; no silent sign-in via stale restore key.
- QA baseline differs: no persistent login, so current synthetic lab requires repeat sign-in after process death. This is a known limitation, not a failed approved production feature.
- Acceptance: branch by `serverSessionValid`, `chatState`, `last_accepted_at` in all combinations; no message content in cached task snapshots/backup.

### Journey J-02: Report during active random chat
- Chat menu -> **Report** -> explain categories and what is sent -> user submits.
- Show **Submitting** until server confirms a real report ID; then an accessible confirmation and a way to Leave and/or Block.
- Report is separate from Block. Whether "Report & Leave" is the default is still a founder decision; do not silently end room on case submission.
- Evidence snapshot happens in a restricted transaction while ordinary text still exists; report remains case-limited.
- In the 7d post-end window, reporter may file a complaint without regaining the chat; after 24h normal body purge the platform cannot claim to have historical text it destroyed.
- Submission failure: don't show "Report received" without server ACK; provide retry/help and avoid duplicate case creation.
- A child-safety emergency requires real escalation and published policy; two lab testers and a queue do not constitute staffed moderation.

### Journey J-03: Timeout while composing
- At 25m since last new accepted message, show a quiet remaining-time indicator (proposed UI).
- At 29:59, unique accepted message resets deadline to 30m after commit.
- At `now >= deadline`, even if UI still shows active, server refuses send and converges state to expired. Keep pending never extends.
- If user's app disconnected and a send is pending, reconcile by client ID; don't auto-post after expiry or fabricate a success.
- Ended/expired room cannot be resumed from account, push, deep link or paid history.
- This has nothing to do with whether the user remains signed in.

### Journey J-04: Back vs End vs sign-out
- Back: hide room and optionally offer Resume while unexpired. No server End.
- End: confirmation; request closes room for both; results in new Discover route. If End races mutual Keep, show the actual deterministic terminal server result.
- Sign-out: ends this device's access; conversation remains subject to server timing; sign-out isn't "End for everyone".
- No surprise reauthentication on routine Back or screen rotation.

### Journey J-05: Mutual Keep and next-day chat
- One Keep -> pending, no DM future access.
- Two eligible Keep before random expiry -> one relationship; source random content stays outside new direct session.
- Next day free account opens Connections -> starts new direct segment free. If partner offline, eligible message uses 7d recipient-scoped unread.
- After direct idle timeout, only the segment closes; relationship remains.
- Block or remove relationship -> future messaging denied. Premium cannot override.

### Journey J-06: Failed send or app killed mid-send
- Freeze client message ID per logical send; network timeout shows uncertain/pending.
- On return, current session read reconciles server-accepted message once and only once; don't create duplicate retry IDs.
- If server never accepted before expiry, do not post into a new segment automatically.
- Android OS can terminate process between HTTP ACK and REST refresh; test that race deterministically.

### Journey J-07: Free and premium access
- Free user can see current live session/unread; cannot paginate earlier sessions via UI/API/backups/old APK.
- Server-issued TEST entitlement alone cannot view history unless BOTH users consented prospectively at message acceptance.
- Revocation of either consent immediately locks history for both; retained body purge is later under separate approved retention procedure.
- Refund simulation removes entitlement but never removes free mutual connection.

### Journey J-08: Device and operational failure
- Notifications disallowed -> still recover via app foreground, no correctness dependency on push.
- Server cold start/offline -> bounded retry and honest status; user never sees fabricated match/sent receipt.
- Old APK after privacy cutover -> min-version or safe deny, never broad v1 historic read.
- Android Auto Backup/device restore -> explicit exclusion of messages, keys and sensitive cached views; production install without real login is not promised.

## Coverage map by domain

| Scenario family | Core implementation PRs | Gate / evidence |
|---|---|---|
| A. Onboarding | V2-02, V2-10, V2-13 | Adult consent/eligibility, Play policy and Android tests |
| B. Closure/background | V2-04, V2-06, V2-10, V2-13 | Restart/process death/JWT-vs-chat clock |
| C. Accounts/devices | V2-02, V2-06, V2-13 | Token revocation, cross-device races and secure relogin |
| D. Match queue | V2-01, V2-04, V2-10 | Cancel/match/timeout/one active slot |
| E. Random chat | V2-04, V2-06, V2-10 | 29:59 vs 30:00, worker stopped, old direct link |
| F. Keep/connection | V2-05, V2-06, V2-10 | Two-party atomic, no transcript copy, free DM |
| G. Messages/unread | V2-06, V2-10, V2-11 | Idempotent send, 7d unreads, 15m recovery, body-free hints |
| H. Safety | V2-07, V2-08, V2-13 | Report receipt, token/report vs purge, reviewer audit |
| I. Free/premium | V2-02, V2-09, V2-11 | Old/v2 history denial, two consents, entitlement revocation |
| J. Privacy/deletion | V2-08, V2-10, V2-12, V2-13 | Backup/delete/hold safety, no hidden archive |
| K. Accessibility | V2-10 | Phone+tablet, TalkBack, large type, offline/Doze |
| L. Operations | V2-01, V2-02, V2-11, V2-13 | Server failover, privacy-safe rollback, launch blockers |

## Minimum automated suites

1. **Contract/pure policy tests:** one automated result for every **P0** scenario's critical authorization and business transition, success+negative branches; deterministic fake wall/DB clock. QA-only tests must never be mistaken for real-user eligibility.
2. **Real PostgreSQL disposable integration:** transaction races `Keep/Expire/End/Block`; message commit/ACK loss, duplicate IDs, unread claim+ack/TTL, report snapshot and retention job conflict; check constraints and data integrity under concurrency.
3. **API security penetration regression:** guessed room ID, stale JWT, revoked refresh token, forged consent/premium, old client v1 replay, unauthorized SSE, block bypass, changing payload scope, read after 30m/7d/90d despite lagging cleanup.
4. **Flutter widget/golden/a11y:** screen states `loading/offline/denied/expired/pending/reporting`, alert text, full-size fonts, focus order, keyboard, TalkBack labels, tablet widths, right-to-left. Do not imply visual validation from code tests only.
5. **Android OS lifecycle:** force stop/process kill, back/home, network drop, airplane mode, battery saver, date/time skew, install/update/uninstall, backup/restore, notification settings. Test physical phone AND tablet.
6. **Safety and privacy:** report/blocked pair LAST on persistent synthetic accounts, no message body in logs, notifications or backups; safety case evidence must be auditable without appearing in premium history.
7. **Fault injection:** transient 401/403/404/409/429/503, Render cold start, Neon query failure, SSE disconnect, delivery duplication, outbox delay, worker paused, schema feature flag mismatch. All client messaging must be truthful.
8. **Non-destructive migration rehearsal:** snapshot disposable fixture matching two synthetic accounts/one random room/four messages; apply backward-compatible changes and confirm exact counts, terminal transitions, rollback-safe denial.

## Coverage depth and stop/go

- Every scenario has a stable ID; no case may be silently removed because it is awkward to build.
- Each **P0** must have its **decision status resolved** (approved or blocking review) and at least one appropriate negative test before affected PR merges. Any cross-account leak, blocked-user reconnection, expired random revival, or paid-history bypass is an immediate stop.
- Each P1 needs an acceptance contract and test track; accessibility/safety-critical P1 becomes P0 when it prevents safe use.
- Device scenarios include exact Android version, hardware, network mode, APK SHA, API commit, DB migration version, date, expected/actual and redacted failure evidence.
- Separate product, engineering, QA and privacy reviews are recorded per stage; no invented human testers or operating moderation team.
- No early public stranger access, refunds, real purchase capture, media sharing or E2EE claims.
- Test the specific 2-device synthetic pair with **block LAST** to avoid disabling all matching without an authorized reset.

## Suggested decision and review cadence

### V2-00a: Founder UX policy freeze
Review 13 proposed UX decisions in atlas, with independent signoff on authentication, foreground matchmaking and report/exit semantics. This can be accepted without starting code.

### V2-00b: Journey specs
Prepare 8 full, auditable journey maps above and attach exact error/empty/recoverable screen content. Make a separate entry for each of the 18 planned product destinations and transient screens.

### V2-00c: Acceptance coverage
Map every `WF-` card to `BR-` rule, tests and V2 PR; mark whether it's physically testable or requires controlled fake clock. Export a traceability spreadsheet/CSV only if founder asks.

### V2-00d: Engineering approval handoff
Only once founder approves V2-00 outcome, advance into V2-01 implementation brief. No separate backend/DB/cost/payment scopes are implied.

## Required source references (research, not implementation evidence)

- [Official Android lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle)
- [Android Credential Manager restore](https://developer.android.com/identity/sign-in/restore-credentials-implementation)
- [Android Auto Backup exclusion policy](https://developer.android.com/identity/data/autobackup)
- [Android lock-screen notification privacy](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications)
- [OWASP Mobile Security cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/Mobile_Application_Security_Cheat_Sheet.html)
- [Google Play UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en-GB)
- [Google Play child safety](https://support.google.com/googleplay/android-developer/answer/14747720?hl=en-GB)

**Policy note:** Google Play's July 2026 changes cover random and anonymous chat age restrictions / child safety. An adults-only promise or age checkbox does not replace effective verification and operational moderation. Detailed legal assessment remains a pre-beta gate.

## Explicit non-action statement

Today's work may add/modify **draft markdown files only** in an unmerged docs branch. The founder has not authorized changing any app code, server, Neon schema/data, account, migration, Render service, payment, purchase record, moderation provider, or release state. No P0 scenario is reported implemented merely by writing a specification.
