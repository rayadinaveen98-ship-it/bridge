# Bridge B3 — Old-Client Route Inventory and Android Protocol Matrix

**Classification:** REVIEW/PROPOSAL ONLY; no HTTP/Flutter source edited.  
**Verified source:** main@f8b18c4cae7736179b0ce8487168d4cb3fb81a6e, on 2026-11-16.  
**Companion:** [B3 integration brief](V2_06B_B3_INTEGRATION_BRIEF.md), [B3 security/release gates](V2_06B_B3_SECURITY_RELEASE_GATES.md), [Approved Product Invariants](../product/PRODUCT_INVARIANTS_V1.md).

## 1. Legacy V1 HTTP read/write surface — exhaustive code route inventory

The current API's `createHandler` in `apps/api/src/http.mjs` dispatches all routes below to `createPostgresService` (`apps/api/src/postgres.mjs`) with server-verified RS256 `sub`. These routes **do NOT yet enforce a new V2 room-policy firewall.** A proposed future firewall must use authoritative stored room/connection identifiers, not User-Agent, client version header, request path alone or front-end UI suppression.

| Current route | Existing behavior and leakage/mutation risk | Proposed V2 compatibility contract (NOT ACTIVE) | Evidence required at G1 |
|---|---|---|---|
| `GET /v1/bootstrap` | Returns active/open room ID; old Android may resume and request V1 messages | No V2 room/relationship identifiers or V2 live state in V1 bootstrap; preserve explicitly grandfathered legacy QA only | Old app cannot discover or resume a V2 ID |
| `PUT /v1/me/preferences` | Updates user preferences; may influence matching | Keep authorized account preference action only; do not silently join V2-only matching | No accidental V2 session transition |
| `POST /v1/matches/search` and `GET/DELETE /v1/matches/search/:id` | Old matchmaking can create/unlock a V1 random room and expose source IDs | V1 match flow never returns V2 room IDs; no automatic V1-to-V2 matching fallback | Race: search/cancel/accepted match preserved without V2 leakage |
| `GET /v1/conversations/:id/peer` | Returns peer pseudonym/account and room type; potential ID oracle | Deny V2 ID uniformly after auth; no identifying response | Guessed ID matches unknown/foreign error class |
| `GET /v1/conversations/:id/events` | SSE authorization and `ready` event with V1 replay hint | Deny subscription to V2 ID before any SSE headers; terminate old connection on scope change; no cross-room V2 event | No hint, event, IDs or bodies for V2; closed streams stop |
| `GET /v1/conversations/:id/messages?afterSequence` | Reads `bridge_messages.body`, unrestricted by V2 scope when V1 state is open | Deny ALL V2-marked IDs before querying V1 plaintext, independently of V1 body presence; old cursor cannot browse V2 | Cannot retrieve V2 or previous random/direct transcripts |
| `POST /v1/conversations/:id/messages` | **Writes plaintext** `bridge_messages.body`; same room ID could be abused | Deny V2 IDs before any old write/outbox/sequence update; no fallback to plaintext if crypto unavailable | No V1 body row, clock, outbox or history mutation for V2 room |
| `POST /v1/conversations/:id/close` | Old close semantics for random only | No V1 close/End action on V2 ID; versioned V2 terminal behavior only | No V2 terminal state change through old route |
| `PUT /v1/conversations/:id/connection-vote` | Old Keep mutates `kind` in-place, conflating source and connection | Deny V2 ID; V2 Keep requires bilateral current votes and immutable source, distinct new direct rooms | Random source never changes to V1 in-place connection |
| `GET /v1/connections` | Legacy relation listing returns source ID; can tempt V1 message fetch | Never include V2 mutual/room IDs in V1 listing; V2 mutuals via new view only | No V2 relation/room ID disclosure or history shortcut |
| `PUT /v1/blocks/:id` | V1 server block uses advisory mutex, closes pair rooms and ends relation | Safety must remain free. Authenticate; allow blocking by known peer if safe, but do not expose V2 room data or bypass newer V2 policy | V2 reads/writes cease after committed block; no deadlock/revival |
| `DELETE /v1/blocks/:id` | V1 unblock query does not take 714411 mutex | Unblock must not revive a V2 terminated room or lost mutual relation; revalidation on all later reads | End/revoke remains terminal after unblock |
| `POST /v1/reports` | Server records report intake, account/conversation association | Keep abuse reporting free and safely accessible; require V2-specific post-end scoped report evidence in V2-07, not a history response | No source message disclosure, report available when permitted |
| `GET /healthz` | Returns only backend health | May remain status-only, must not enumerate users/rooms/version IDs | No sensitive content |
| `POST /internal/lab/login` | Restricted synthetic QA login, no real adult assurance | Remains QA-only; never treated as public authentication, V2 production age proof or release signal | No external/public access, creds protected |

**Additional internal surfaces:**
- `apps/api/src/live.mjs` `ready` event embeds `GET /v1/conversations/:id/messages?afterSequence=<cursor>`; this must never be emitted for a V2 session. V2 stream protocol must explicitly tell client to use V2 current-only cursor.
- `apps/api/src/outbox.mjs` is durable at-least-once; event payload is body-free but includes opaque room/message/sequence references. Subscriber authorization must be rechecked under V2 policy on open and on each notification. SSE itself must not be a history channel.
- `apps/api/src/postgres.mjs:block()` uses mutex `714411` and closes pair rooms; `unblock()` does NOT use that mutex. Risk is heterogeneous route/role/account writes and incomplete actual V2 HTTP integration, not absence of a lock in V1 block.
- Original legacy room has four messages, two QA accounts and historical match slots. No migration, replay or destructive validation may touch them without separate approval.

## 2. Recommended V2 endpoint and payload boundary

**All below are unimplemented wire proposals**; names/HTTP status codes may change at a separately approved protocol lock.

| V2 operation | Proposed client payload/response | Server-side invariant |
|---|---|---|
| bootstrap | `currentRoom` scoped identity/expiry, list of mutual IDs, recipient unread *count*; never history | If no current active V2 room, no last-room cursor or source transcript; no old V1 redirection |
| live read | `{messages:[{id,sequenceNumber,senderId,text}|{id,sequenceNumber,deleted:true}],cursor}` | Room active, actor is current pair, signed cursor bound to actor+room and validated every read |
| send | `{clientMessageId,body}` plus bounded idempotency header; response `{id,sequenceNumber,duplicate}` | Server derives actor, recipient, accepted timestamp; decrypt/write only new V2 tables; never V1 body |
| direct unread inbox | `[{envelopeId,messageId,text,presentationProof?}]` bounded to 25 | Authenticated recipient only, valid active mutual, original 7d hard cap, no room history query |
| acknowledge | `{presentationProof}` for specific envelope ID | First-ack server time is immutable and cannot be advanced by subsequent reads/acks |
| recover | `{recoveryToken}` for envelope ID | Exact recipient, digest and minimum of firstACK+15m/original accepted+7d, no generic pagination |
| SSE | `ready` + body-free message-available hints | Current room authorization, fresh JWT, expiration and block; no V1 replay URLs |
| Keep / end direct / block | Explicit affirmative Keep, distinct direct IDs, no resurrection | Fully separate random source from relation and future free direct segments |
| report after End | Scoped report token and submitted case, *not* transcript | V2-07 and evidence migration independently authorized; safety free |

**One UX-critical honesty rule:** the server can establish *delivery/proof issuance* but cannot cryptographically prove a human saw the content on their physical screen. The five-minute presentation proof TTL in B2b is a test-only replay-control choice, not user-consented display policy. The 15-minute recovery window begins at immutable successful first acknowledgment, not at phone animation, typing, read/poll or a push notification.

## 3. Flutter/Android V1 compatibility mapping (currently implemented, NOT V2)

| Existing source | Verified behavior | Required later V2-10 review |
|---|---|---|
| `apps/mobile/lib/bridge_api.dart` | Restricts `_request` to `/v1/`; `messages(id,after)` polls V1 `afterSequence`; SSE uses V1 events; token held in memory | Versioned V2 endpoints, explicit `upgrade_required` deny response, no V1 fallback on a V2 room, bounded recovery proof handling |
| `apps/mobile/lib/bridge_controller.dart` | Holds in-memory message list and cursor, clears on `leaveChat`; `refreshMessages()` replays V1 pages and merges; Back/Resume tied to server bootstrap | Scope memory state to active V2 room+actor, clear current-only when ended/expired/revoked, avoid stale completed futures/race injecting old messages |
| `apps/mobile/lib/message_reconciliation.dart` | Detects sequence gaps/conflicting replay pages, refuses invalid pages | Treat authenticated V2 tombstones and scoped cursor per room; D1 cursor never accepted in D2; no previous session local list |
| `apps/mobile/lib/main.dart` | Current chat/Keep/block/report and saved connections screens operate on V1 | Distinct *active temporary chat* vs *mutual connection* vs *finite unread* UI; explicit status when aged/expired, no past-message timeline |
| Android framework configuration | Full Android QA build exists; in-memory bearer is not written to disk by BridgeApi | Review Activity/task-switcher snapshots, screenshots, clipboard, backup/export, notification previews, logs, deep links, accessibility, crash/OS restore, stale apps |

**Android user experience proposal (not yet approved design):**
- First V2 welcome/intro plainly explains random messages are temporary, mutual Keep enables future free chats, and existing random content does **not** transfer.
- On End/expiry the screen immediately loses old room read controls and no cached transcript remains in ordinary prior-chat UI. Returning from Back to Discover restores only *currently active* room, never prior session.
- Connection list shows mutual identities and a **Start chat for free** action for new D2; do not show D1 last-message snippet or history.
- Unread tray only lists eligible finite direct deliveries. After acknowledged, remove it from ordinary unread view; short transport recovery is not a historical inbox.
- Show safe, human-friendly states for crypto unavailable, key lost, expired, blocked, upgrade required, offline, device time skew, and two devices acknowledging one envelope.
- Avoid silently acknowledging before client presentation; do not imply the 5-minute synthetic proof is a promise of human viewing. Accessibility and low-connectivity conditions need UX tests.
- Mobile client must never store raw recovery token, decrypted message or keys in OS backups/analytics by default; any safe ephemeral local retry behavior needs explicit product acceptance and device tests.

## 4. Old-client cutover and fallback order

1. Keep existing private V1 testers and four records untouched; capture founder's R0 phone/tablet device acceptance first. No V2 ID exposed in V1 bootstrap/events/connections.
2. In disposable PG16, rehearse mixed legacy+V2 marked rooms with **both old and new clients**. A room's server-side stored policy chooses the gate, never a client-provided header.
3. Before exposing the first real V2 ID on any hosted QA route, deploy and prove **old V1 deny on V2** for GET/POST messages, bootstrap, events, peer, connection-vote, close, connections, search-match/queue and any alternate replay route, without blocking authenticated block/report or required privacy rights.
4. Only afterward, run founder-approved additive Neon V2 schema application and compatible V2 Android preview/API activation. Use separate deploy approval, exact main SHA, read-only role inventory and backup. No live Neon DDL in B3.
5. During canary, negative test old APK + V2 ID, cross-user/cross-room, block/update, 30m exact expiry, 7d and 15m, two-device races, SSE retry, key loss and safe upgrade screen.
6. **Rollback must route to safe-deny/upgrade-required** and preserve V2 encrypted rows; never reenable old `/v1/.../messages` plaintext replay, never silently copy ciphertext into the legacy body column.
7. Real-user beta remains prohibited until genuine adult/safety, moderator response, reporting, privacy ops, key custody and G1/G2/G3 approval.

## 5. Negative test matrix for B3a (PROPOSED, not yet run)

| ID | Attack or compatibility case | Expected contract outcome |
|---|---|---|
| X03-01 | User-Agent says `v2` but room is legacy | Stored policy wins, no automatic V2 identity |
| X03-02 | Old client requests V2 ID via V1 GET messages | Deny before old body read |
| X03-03 | Old client V1 POST attempts plaintext write to V2 ID | Deny before writing legacy body/outbox |
| X03-04 | Old V1 SSE subscribes to V2 ID | Deny before response headers; no replay hint |
| X03-05 | Old bootstrap or connections list reveals V2 ID | No V2 ID present |
| X03-06 | Old V1 Keep mutates source V2 random to connection | Deny; V2 Keep keeps immutable original |
| X03-07 | V1 peer/close/search/queue receive V2 room/source context | Deny or isolate, no V2 data leak |
| X03-08 | `legacy_qa` NULL, `policy_version` missing or contradictory | Fail closed for V2, never infer authorization |
| X03-09 | Caller supplies `actorId`, `ageVerified`, `premium` in V2 body | Ignore/refuse; subject from verified JWT and DB |
| X03-10 | Guessed room/envelope ID for other user | Consistent no-existence oracle error |
| X03-11 | Block during active read/sse/send, then unblock | Access revoked, no resurrected room/relationship |
| X03-12 | Duplicate retry or poll after 30-minute boundary | No clock extension or historical replay |
| X03-13 | D1 cursor reused in D2, guest tries previous random messages | Safe deny, no content |
| X03-14 | Unread recipient switches account across two devices | Wrong actor cannot list/ack/recover |
| X03-15 | V1 report or block safety action with stale client | Safety actions remain free without granting previous history |
| X03-16 | V2 reads after key loss or privilege failure | Fail closed; no plaintext fallback |
| X03-17 | SSE/outbox logs/headers contain bodies or recovery capabilities | Zero sensitive contents |
| X03-18 | Old app receives `upgrade_required` after cutover | Clearly blocked, no reconnect to old V1 body route |
| X03-19 | Android Back/relogin after expiry | No prior messages in local UI or backup |
| X03-20 | D1 ended, relation still active, finite unread remains | Recipient-only finite delivery; no D1 historical timeline |
| X03-21 | Signed 7d/15m boundary and two-device ACK | Cannot extend window; no token duplication to other actor |
| X03-22 | Host runtime role has owner/BYPASSRLS | STOP G1, no assumption RLS protects private data |
| X03-23 | Hosted audit/event credentials and logs contain real secrets | STOP + incident procedure, no deploy |
| X03-24 | Exact B3a pure PR path/CI evidence | All jobs pass, but still NOT live enforcement |

These IDs are an **acceptance backlog**, not a count of tests implemented or passed. A later true V1/V2 network gate must prove the same negatives against actual controlled endpoints after explicit approval.

## 6. Explicit protection of historical QA

- Do not run 0008 on the existing Neon database merely to make compatibility tests pass.
- Do not delete, update or reset the existing two real synthetic QA tester accounts, 4 original messages, match room or slots.
- Do not modify `bridge_messages.body NOT NULL` or make V1 capable of reading B1a ciphertext.
- A staging fixture may create its OWN disposable PG16 legacy and V2 rooms with the same shape, but never identify those fixture rows as the hosted originals.
- R0 physical phone/tablet acceptance remains OPEN; no CI-only declaration of device success. Full 138-case What If? review remains final at V2-16.
