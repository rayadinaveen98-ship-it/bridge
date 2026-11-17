# Bridge B3c-2R3B-2 — V1 compatibility firewall and writer audit

**State: SOURCE-REVIEW FINDINGS + PROPOSED ACCEPTANCE; NO CODE CHANGES AUTHORIZED.**
**Baseline:** `main@5b9e437422f946cb668affd9048e1d0ff07ce2ce`; 2026-11-17.
**Primary sources:** `apps/api/src/{http,postgres,start,live,outbox,cloud_qa}.mjs`, `apps/api/src/{sessions/{random_repository,direct_repository},connections/keep_repository,messaging/{private_repository,private_delivery_repository}}.mjs`, checked-in `0001`, `0004`, `0008` migrations. Disconnected V2 modules are NOT current hosted HTTP paths.

## Firewall principle

V1 QA rooms remain readable/writable **only under their current V1 policy**, with unchanged data. A client using any old V1 endpoint must **never read, create V1 plaintext in, re-open, vote/convert, infer another participant through, or receive an SSE event for a V2-marked room**. Denial must happen both in HTTP routing (for fast uniform response) **and in the same database transaction prior to SELECT/INSERT/output** (against stale clients, race windows and unknown code paths). Never hide the presence of legacy V1 accounts or break existing V1 QA merely because a V2 marker column is NULL. V2 `policy_version='bridge-v2'` and `v2_session_role` are explicit V2 markers; legacy 0004 adds nullable marker columns and does not backfill old rows.

For privacy denial, prefer one constant `resource_unavailable` response with no existence, Block, age, user-identity or room-state hints. Status code, latency and SSE closure behavior require dedicated threat review; do not rely on only a UI disabled button. **Do not deny safety reports in a way that destroys reporting ability**; a V2 report must use a separate authorized case-evidence path without granting ordinary chat history.

## HTTP V1 entry-point inventory, actual code vs target

| Existing endpoint or operation | Current code path / observed guard | Required V2-marker behavior and test |
|---|---|---|
| `GET /healthz` | `http.mjs` alive only | Remains available; no V2 data or DB identity disclosed |
| `POST /internal/lab/login` | QA operator gate, synthetic tester handles | Remains independent of V2 auth; QA credentials never become V2 proof or adult verification |
| `GET /v1/bootstrap` | `postgres.bootstrap` joins active match slots, match sessions, conversation participants; may return room ID | Never return V2 room IDs through V1 bootstrap; V1 queue behavior and nullable legacy markers preserved |
| `PUT /v1/me/preferences` | `setPreferences` uses mutex 714411, modifies preferences/queue | Legacy preference updates remain allowed; no V2 match manipulation or user-supplied role/policy selector |
| `POST /v1/matches/search` | `enqueue` takes mutex, may create match, room and participant rows | Search returns only V1 resources; V2-marked match/queue cannot be claimed or resurrected by V1 |
| `GET/DELETE /v1/matches/search/:id` | `queueStatus` directly reads V1 queue/match/room; `cancelQueue` takes mutex | No V2 room ID leakage; ensure V1 cancel cannot delete V2 match slots/queue |
| `GET /v1/conversations/:id/peer` | `conversationPeer` uses `participants`, emits peer identity and `conversationKind` | Uniform deny before peer data is read/returned for V2 rooms |
| `GET /v1/conversations/:id/messages` | `messages` reads `bridge_messages.body` after `participants`; no `policy_version` V2 check | Uniform deny to V2-marked rooms; cannot read historical or current V2 via old API |
| `POST /v1/conversations/:id/messages` | `sendMessage` INSERT plaintext into `bridge_messages`, bumps sequence and event outbox; no V2 marker check | Uniform deny to V2-marked room **inside transaction before idempotent lookup and INSERT**; no V1 body/outbox/clock side effect |
| `GET /v1/conversations/:id/events` | `liveHub.open` authorizes before stream; heartbeat/publish calls `service.authorizeEvents`, checks membership and Block but no V2 marker | Cannot subscribe or receive hint for V2 room; close stream on subsequent revocation/token expiration, never rely on heartbeat alone |
| `POST /v1/conversations/:id/close` | `closeConversation` updates V1 random room, match/slots; no mutex | Never close or modify a V2-marked room from V1; ensure compatible locking if touching shared revocation state |
| `PUT /v1/conversations/:id/connection-vote` | `castVote` can INSERT votes/connection and transform random to direct-like V1 room; no mutex | Deny on V2 room, no conversion of V2 random transcript to V1 connection or plaintext history |
| `GET /v1/connections` | Queries connection table, peer, source room; no V2 policy selector | Do not expose V2-only connection IDs/peer existence to V1 client; preserve preexisting V1 results |
| `PUT /v1/blocks/:targetId` | `block` takes mutex, INSERT Block, closes shared rooms, ends relationship and match | Blocking must *still* work safely for V2-related peers and preserve evidence; serialize with all V2 operations, never simply reject critical safety action |
| `DELETE /v1/blocks/:targetId` | `unblock` directly calls `pool.query DELETE`, **without mutex or eligible-account transaction** | Protocol gap: rewrite only in separately approved change, serialize unblock and verify that unblock NEVER resurrects ended connection/closed room |
| `POST /v1/reports` | `report` stores report if reporter is participant; possible conversation linkage | Preserve safe reporting while preventing old-client access to V2 content; V2 evidence linkage needs separate case role / V2-07 |
| `start.mjs` startup | One `pg.Pool` from `BRIDGE_DATABASE_URL`, V1 `createPostgresService` and outbox poller | Separate V1/V2 pool-role routing before hosted V2; do not change private QA env or deploy here |
| `outbox.mjs` drain + `live.mjs` publish | At-least-once outbox, SSE notifications only, publication authorizes each subscriber | V1 dispatcher must not route V2 secure-message events to V1 clients; preserve V1 durable replay semantics |
| QA startup account provisioning | `cloud_qa.mjs` may insert/update synthetic accounts at boot, no V2 writer protocol | Do not use as general production account-revocation writer; existing QA records kept, provisioning behavior audited for cutover |

## Mutating writer lock audit

The positive proof in PR #61 uses synthetic cooperative mutex `714411`. It **does not** mean that all deployed V1 code uses that lock.

| Existing method | Shared 714411? | Mutates state relevant to V2 eligibility or privacy? | Integration risk / initial action |
|---|---|---|---|
| `postgres.block` | Yes | Block rows, connections, rooms, match, slots, queue | Blocking first is safe only if other writers participate. Must verify canonical lock order and response semantics |
| `postgres.unblock` | **No** | Deletes Block | Locks/recheck missing; cannot assume "absence of Block" is stable |
| `postgres.sendMessage` | No | V1 message, sequence, event outbox | On V2-marked ID, potential plaintext/sequence contamination until SQL-deny fence is present |
| `postgres.messages` | No | Read only, but privacy-sensitive | V2 marker/actor/Block/expiry must be denied; read lock only on room is not equivalent to writer protocol |
| `postgres.castVote` | No | Votes, connection, room kind/state, slots, queue | Can cross legacy/V2 Keep boundary unless fenced |
| `postgres.closeConversation` | No | Conversation, match, slots, queue | Can violate V2 room/session state unless fenced |
| `postgres.authorizeEvents` | No | Read-only SSE authorization | May reauthorize stale V2 stream without V2-specific eligibility |
| `postgres.setPreferences` | Yes | Account languages/preferences and match queue | Same global mutex but does not establish V2 actor protocol |
| `postgres.enqueue` | Yes | Match queue, matches, room, participants | Verify V1-only marker, no shared V2 candidate selection |
| `postgres.cancelQueue` | Yes | Queue cancel | Ensure cannot cancel an unrelated V2 queue |
| `sessions/direct_repository.withV2ConnectionTx` | Yes, disconnected | Direct segment, relationships | Domain tests only; not hosted route |
| `sessions/random_repository` synthetic tx | Yes, disconnected | Random match/session/rooms | Domain tests only |
| `connections/keep_repository.vote` | Yes, disconnected | Converted Keep and direct D1 | Domain tests only |
| `messaging/private_repository` and private delivery | Via disconnected adapters in tests | V2 secure data, outbox, ACK | Not wired to hosted service |
| `cloud_qa.provisionCloudQaAccounts` | Not established by this audit | Synthetic test account state at startup | Audit interaction if runtime roles split; no hosted change now |
| Account suspension/deletion admin workflows | Not proven in current hosted V1 source review | Eligibility, identity revocation | Catalog *all* writers before integration; default HOLD if unknown |
| Reviewer/retention worker (future) | Not implemented | Evidence lifecycle, deletion | Separately scoped roles and revocation protocol |

**Lock-order caution:** Some V1 operations lock the room `FOR UPDATE` before they discover the peer; synthetic V2 proof uses global mutex then additional locks. Appending a mutex in arbitrary positions can introduce deadlocks with room/connection/account locks. Decide a uniform global-first and deterministic account/room/connection order, then verify both transaction types under independent clients before changing existing services.

**Block semantics:** `unblock` should never automatically reconnect, reopen an ended Keep, restore a closed room, reissue unread token, or rebuild expired free chat history. A correctly serialized successful unblock may permit a *new* mutually approved connection under product rules; it must not act as retroactive authorization.

## Required executable acceptance matrix before old-client cutover

| Case | Test | Safety result |
|---|---|---|
| F01 | Legacy QA random room GET/POST before & after firewall | Existing supported V1 behavior preserved, data unchanged |
| F02 | Legacy QA direct/connection GET/POST | Existing supported V1 behavior preserved |
| F03 | V2 marked random room via V1 GET | Deny before plaintext SELECT; no existence/membership leak |
| F04 | V2 marked random room via V1 POST | Deny before idempotency lookup/INSERT, no sequence/outbox change |
| F05 | V2 marked direct room via V1 GET/POST | Deny both, no legacy row or event |
| F06 | V2 marked room via V1 SSE open | No subscription, uniform denial |
| F07 | V1 SSE already open when Block/expiry/role change occurs | Close before further event hint; periodic and publish-time checks |
| F08 | V1 bootstrap/queueStatus with V2 active room or match | No V2 ID returned, no stale V1 queue claims |
| F09 | V1 peer/connection list referencing V2 | No cross-user profile metadata/connection ID disclosure |
| F10 | V1 castVote attempts to convert V2 random | Denied; cannot create V1 Keep/legacy conversation |
| F11 | V1 close tries to mutate V2 room | Denied; no segment/match/slot effect |
| F12 | V1 Block races V2 SEND, LIVE, UNREAD or ACK (Block first) | New operation denied and no committed unauthorized artifact |
| F13 | V2 SEND before V1 Block | Accepted SEND may commit, then Block causes subsequent reads/ACK to deny |
| F14 | V1 unblock races V2 SEND, LIVE, ACK | No stale or resurrected authorization, no deadlock; deterministic new state |
| F15 | V1 castVote/close races V2 Keep/direct | No mixed V1/V2 conversion or unlocked stale relation |
| F16 | Peer suspension/deletion/age/safety change during read/write | Fail closed, including unknown admin writer paths |
| F17 | V1 report involving V2 conversation ID | Safe case intake without ordinary V2 ciphertext/history access |
| F18 | Outbox event for V2 secure message arrives at V1 dispatcher | No V1 SSE delivery of V2 message-available hints |
| F19 | V1 request with unknown/nonexistent/fake room/guessed V2 ID | Uniform error and no timing/oracle leaks |
| F20 | Rollback after Block/unblock and room updates | Original V1 and V2 state remain coherent; case evidence never deleted |
| F21 | Two-worker mixed V1/V2 latency/deadlock test | Bounded lock waits/retries, no unsafe success; SLO documented |
| F22 | Client reconnect across V1→V2 cutover | Old client sees only old V1 data; no free prior-message history |
| F23 | Abort/disconnect during V2 privacy-denied V1 POST/SSE | No commit, no lingering outbox/subscriber |
| F24 | Restart with startup QA account provisioning and migration version drift | Fail closed, preserve synthetic QA identity and original data |

**No F01–F24 test is claimed PASS in this document.** This is a design acceptance matrix, not new implementation or certification. Real Android/QA packet inspection and R0 physical acceptance remain separate.

## Sequence and rollback

1. Capture current V1 QA behavior on disposable PG first (existing unchanged read/write/Keep/Block/queue/report semantics), then define V2 marker guard contract with uniform denial.
2. In separately approved code PRs, insert **database-level** V1/V2 marker checks for all routes before V2 IDs can become reachable; protect SSE authorization/dispatch and old-client reports without removing abuse reporting.
3. Coordinate every revocation writer with V2 transaction protocol or fail closed on conflicting access. Test V1 old- and new-code mixes before changing hosted credentials.
4. Prove a new nonowner V2 identity/role gateway independently; no actor GUC/public function bypass and no retroactive transcript conversion.
5. Obtain separate hosted read-only baseline and migration approval; run a private synthetic canary, preserve original QA, and keep rollback privacy-safe.
6. Only after gates, update Android and release workflows. No auto deploy, existing credentials, migrations or old QA rows are modified now.

**Disposition:** `V1_FIREWALL_DESIGNED` when reviewed; `V1_FIREWALL_IMPLEMENTED`, `V1_RACE_TESTED` and `HOSTED_READY` are **NOT** true yet.

