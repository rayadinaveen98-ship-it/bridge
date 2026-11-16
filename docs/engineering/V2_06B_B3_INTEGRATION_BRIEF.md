# Bridge V2-06B / B3 — Authenticated API and Privacy-Safe Integration Architecture

**Stage:** B3 DOCUMENTATION PREPARED / SOURCE NOT IMPLEMENTED / HOSTED ACTIVATION NOT AUTHORIZED  
**Prepared:** 2026-11-16  
**Verified source-of-truth:** `main@f8b18c4cae7736179b0ce8487168d4cb3fb81a6e`; [postmerge Foundation #43854756002](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43854756002) matching+postgres-integration SUCCESS.  
**Founder authorization in this stage:** B3 planning, source inspection and documentation only. Every source-code, migration, role, key, hosted deployment, physical-data mutation, Android or commercial change needs a new bounded approval.

**Related authoritative records:** [approved Product Invariants](../product/PRODUCT_INVARIANTS_V1.md), [Architecture V2](ARCHITECTURE_V2.md), [B2 implementation brief](V2_06B_B2_IMPLEMENTATION_BRIEF.md), [B2a/B2b evidence](V2_06B_B2_EVIDENCE.md), [V2 package gates](V2_IMPLEMENTATION_PACKAGES.md), [B3 route/client compatibility matrix](V2_06B_B3_ROUTE_CLIENT_MATRIX.md) and [B3 security and deployment gates](V2_06B_B3_SECURITY_RELEASE_GATES.md).

## 1. Engineering conclusion

The isolated V2 foundation now contains:
- B1a additive **0008 V2-only** metadata, LIVE ciphertext, direct-recipient UNREAD schema **in source and disposable PostgreSQL 16 tests only**, not the hosted Neon database.
- B1b disconnected AES-256-GCM per-item LIVE and UNREAD payload/DEK wrapping using **ephemeral synthetic injection**, not production secrets or E2EE.
- B2a synthetic guarded PostgreSQL encrypted writes, deduplication, body-free outbox, 30-minute last-accepted-message expiry, and random/direct separation.
- B2b synthetic guarded current-only LIVE read, recipient UNREAD, immutable first acknowledgment, digest-only recovery capability bounded by **min(firstAck+15m, accepted+7d)** and protected Block/revocation denial.

B2a/B2b have 26 and 21 passing Node TAP results respectively (including parent suite wrappers) in exact previous CI. **These are not an authenticated public API or a device acceptance.** All new sources remain disconnected from `apps/api/src/http.mjs`, `postgres.mjs`, `start.mjs` and the Flutter client.

**B3 mission:** define the *authenticated and backwards-compatible integration boundary*, predeployment security decisions, client protocol, concrete test evidence and safe rollout/rollback. B3 is **not** permission to turn on V2 routes, run 0008 on Neon, create real keys, pay providers or upgrade devices.

## 2. Verified current-code compatibility hazards (not hypotheticals)

1. `apps/api/src/http.mjs` sends V1 `GET /v1/conversations/:id/messages?afterSequence=...` to `service.messages` and V1 POST to `service.sendMessage`. `apps/api/src/postgres.mjs` reads and writes **plaintext** `bridge_messages.body`; its eligibility check is not a V2 room `policy_version`/role firewall. In the absence of a new server-side gate, an old V1 client could **send plaintext to an accessible V2 room** and potentially fetch it. Block V1 reads *and writes* of V2-marked room IDs BEFORE exposing such IDs, not only hide a history screen.
2. `http.mjs` includes `/v1/bootstrap`, queue/search, conversation `/peer`, `/events`, `/close`, `/connection-vote`, `/connections`, block and report. Every route that returns or mutates conversation state must be audited. The V1 `castVote()` mutates a random source to a connection **in place**; approved V2 Keep closes source and creates separate future direct segments.
3. `apps/api/src/live.mjs` uses body-free SSE event hints but its `ready` payload literally recommends replaying `GET /v1/conversations/:id/messages`; do not reuse that hint for a V2 session. Both notifications and stream reauthorization need V2 policy and expiry boundaries.
4. `apps/mobile/lib/bridge_api.dart` permits only `/v1/` paths; `bridge_controller.dart` maintains a mutable in-memory messages list and replay cursor and refreshes on SSE hints; `message_reconciliation.dart` verifies message-page ordering. New V2 endpoints, no-previous-history behavior, two-device unread UX and old-client rejection require Android **separately approved** implementation; UI-only hiding cannot enforce privacy. The current client states it does not persist bearer tokens to disk, but system backups, screenshots, crash dumps and process memory still need platform review.
5. `apps/api/src/auth.mjs` implements RS256 bearer verification with issuer, audience, expiration and subject checks. `apps/api/src/postgres.mjs` derives server account via `bridge_accounts.auth_subject`. **B2a/B2b do NOT call either path**: they accept synthetic `actorId` values and require a disposable loopback URL. The future V2 facade must trust only verified subject-to-account mapping and current locked database facts, never a body/query actorId or client-provided age, role, paid status or recipient.
6. **Race clarification correcting earlier imprecise B2 phrasing:** V1 `postgres.mjs:block()` **does acquire advisory mutex 714411**, as do V2 sessions/B2. Therefore it is inaccurate to say *all* hosted V1 block writes lack the shared lock. However V1 `unblock()` uses a separate pool query, hosted account/policy restrictions and route-level reads are not jointly integrated with new V2 session gates, and there is no actual V1-versus-V2 HTTP concurrency certification. A shared mutex in one V1 operation **does not certify complete revocation linearizability**. Audit every writer and locking/visibility condition before real authorization claims.
7. Cloud QA startup in `start.mjs` can `provisionCloudQaAccounts` and verify tester credentials; it still runs V1 service and no V2-specific policy. Keep those two testers and the four original QA messages untouched. **Do not** stage a V2 rollout through Render auto-deploy or startup schema migration.
8. Legacy `bridge_history_items.message_id` and `bridge_report_evidence.source_message_id` reference `bridge_messages` rather than `bridge_v2_secure_messages`. V2-07 and V2-09 need a later additive secure-ID linkage; never make dummy V1 plaintext body rows for new V2 messages.
9. New 0008 V2 tables have RLS ENABLED but no runtime read/write grants/policies. Disposable CI connects as `bridge_test` owner; privileged Neon inspection owner has had BYPASSRLS. **Actual Render runtime `current_user` remains unverified.** No database isolation claim follows from CI owner's successful queries.
10. B2b five-minute presentation-proof freshness is a **synthetic implementation choice**, not an approved UX or server security guarantee that text was displayed to a real person. A modified client can acknowledge immediately; actual presentation cannot be cryptographically proven by the UI alone. The founder-approved guarantees are first ACK immutability, 15-minute bounded recovery and original seven-day hard limit.

## 3. Proposed versioned V2 API contract (NOT implemented)

Principles:
- The server determines *V1 legacy vs V2 session scope* from stored policy and immutable `legacy_qa` markers, not user agent, client-provided version, token claim, path alone, or whether a room ID resembles V2.
- All V2 endpoints are restricted to synthetic QA until future explicit G1 approval; server-side authenticated bearer `sub` maps to exactly one current account. Reject account absence/status or ineligible peers uniformly.
- Current-live messages require current/active room; direct UNREAD requires original intended recipient plus active mutual relation even if the source direct segment has ended. Free users NEVER receive a previous-session timeline.
- No plaintext, ciphertext, token, KEK bytes or sensitive peer information in SSE, push, errors, telemetry, logs, crash reports or history listing. `Cache-Control: no-store` for all sensitive APIs.
- All authenticated delivery state changes must resample authoritative DB time after ordered locks. Only new unique accepted messages extend the 30-minute session clock; polling/read/ACK/SSE/duplicate do not.

| Candidate V2 endpoint | Authenticated meaning | Non-negotiable denial |
|---|---|---|
| `GET /v2/bootstrap` | Report *current* V2 room, current mutuals, only recipient-scoped unread count and protocol capability | No ended random/direct room body, no prior-session timeline or feature flag leakage |
| `GET /v2/conversations/:id/messages?cursor=...` | Current LIVE page for actor+room signed scope, bounded page; tombstone cursor allowed only while active | Other actor/room, expired/closed D1, old random source, client-supplied prior sequence |
| `POST /v2/conversations/:id/messages` | Trusted actor from bearer subject; recipient from current DB pair; one atomic B2a encrypted write | Plaintext legacy write, unauthorized pair, wrong idempotency, expired or blocked |
| `GET /v2/unread` | Recipient-specific finite direct UNREAD list; no generic room pagination or previous-session metadata | Sender/outsider, blocked/unmatched/expired recipient envelope |
| `POST /v2/unread/:envelopeId/ack` | Separate delivery presentation/ack proof (protocol requires further decision) and immutable first ACK | No proof, wrong actor, token replay into other envelope, ACK beyond hard cap |
| `POST /v2/unread/:envelopeId/recover` | Valid digest-bound recovery capability within 15m firstACK and initial 7d | Other recipient, revoked mutual, malformed key, expired cap, arbitrary history browsing |
| `GET /v2/conversations/:id/events` | Reauthorized *hint-only* stream; `ready` points to V2 current cursor endpoint | No V1 replay URL, no message body, no stale room subscriptions |
| `POST /v2/conversations/:id/end`, Keep/direct and block/report paths | Preserve V2 terminal/relationship state rules; reporting/blocking must stay free | No source transcript import, no resurrection, no safety action disabled for stale clients |

**Unfinalized choices:** exact path naming/HTTP codes, replay proof protocol, Android screen copy and offline delivery presentation, public key source, key identifier/version rotation and production gating require separate design/code approval. This table is a recommendation, not an already approved wire schema.

## 4. B3 engineering package sequence — exact proposed PR boundaries

### B3a — pure authenticated-route/compatibility contract and negative policy fixtures

**Status PROPOSED; code NOT APPROVED.** Single isolated seven-file source/test-only PR, no PG runtime routing:

1. `apps/api/src/v2/compatibility_contract.mjs` — NEW pure policy for V1/V2 route+stored room scope classification, no new server imports, no raw message data.
2. `apps/api/src/v2/response_contract.mjs` — NEW pure validation for versioned safe-deny responses, scoped message/unread/cursor output shapes.
3. `apps/api/tests/v2/compatibility/route_matrix.test.mjs` — NEW static and pure cross-method route matrix, old V1 read/write/SSE/Keep/peer/bootstrap compatibility and spoofed client-version negative cases.
4. `apps/api/tests/v2/compatibility/response_contract.test.mjs` — NEW uniform denial, no IDs/bodies/secrets in unauthorised envelopes, trusted actor and cache/header contract tests.
5. `apps/api/package.json` — ADD only named `test:v2:compatibility` pure test script; no dependencies or runtime changes.
6. `.github/workflows/foundation.yml` — ADD matching-only pure tests while leaving old V1, B1/B2 tests and PG16 checks untouched.
7. `docs/engineering/V2_06B_B3_EVIDENCE.md` — NEW candidate acceptance IDs, final PR SHA, exact CI and explicitly untested live gates.

**B3a does not implement V1 denial:** Its pure rule can be tested without being wired. Claiming V1 old-client protection after B3a would be a critical mistake. Strict no edits to `http.mjs`, `postgres.mjs`, `auth.mjs`, `start.mjs`, SQL, Flutter, service deployment or keys.

Proposed B3a test IDs: `G03-01..04` no V1 GET/POST/SSE/bootstrap/Keep access to V2-marked IDs; `G03-05..08` legacy QA unaffected until G1, NULL legacy classification safe, client version/user-agent spoof ineffective, server-stored markers required; `G03-09..12` signed `sub` vs actor body separation and blocked/peer status absent uniform deny; `G03-13..16` no bodies/keys in error/outbox/notification contract; `G03-17..20` bounded read/unread/ack/recovery response shapes and no old-history path; `G03-21..24` exact seven-file allowlist, named tests, matching+PG16 CI and postmerge proof. **These are requirement IDs, not implemented test counts.**

### B3b — private synthetic authenticated facade / transactional actor adapter

**Separate later founder approval and a new exact allowlist required** after B3a, independent from B3a. Build a *disconnected* test-only adapter that verifies an RS256 synthetic token, resolves `sub -> bridge_accounts.id` from disposable PG16, checks current account/policy status and chooses B2 scopes. Test identity swaps, account restrictions, two-device races and wrong roles against synthetic DB. Do **not** weaken B2a/B2b loopback guards or connect real HTTP. Proposed minimum: new `apps/api/src/v2/private_facade.mjs`, dedicated synthetic identity DB fixture/tests, named PG16 runner/CI and evidence. The **concrete allowed paths, API injection shape and acceptance** must be reviewed in a new brief before coding.

### B3c — production key/role and privacy-cutover design (NO automatic deployment)

Separately approve a **read-only redacted** Render runtime DB role and Neon schema-access inventory (never query message bodies or expose DB URLs), plus a production KEK/key-reference/nonce/backup/rotation/compromise design with budget. Real keys and permissions remain **unselected**; no paid KMS/cloud vendor, secret setup or database grants are approved.

### B3d / V2-10 / G1-V2-11 — real HTTP, Android and old-reader cutover

Design the V1-per-room firewall and versioned V2 HTTP and SSE adapters in a separate source PR with exact scope only **after** token/role/key controls and V2-07/09 dependencies are resolved. Android V2-10 and physical R0 must demonstrate compatible no-history UX. Actual V2 data/route exposure, source-of-truth migration, old-client safe-deny and Render release are **G1/V2-11 founder-only gated**, never automatic consequences of B3a/B3b passing.

## 5. Protocol and security decisions needed BEFORE hosted B3 integration

1. Production key provider, secret custody and cost; test-key design cannot survive restart. Server-side AEAD is not E2EE.
2. Signed token issuer/audience/key rotation and account mapping; no client `actorId` even in future V2 body.
3. Authenticated adult eligibility and policy acknowledgment source, not cloud QA `age_verified_at` synthetic defaults.
4. Dedicated nonowner API database principal, transaction-scoped authorization, vetted RLS/grants and role separation from migration/retention/case reviewer.
5. Safety semantics for immediate blocks across *every* writer, including account status transitions and V1 methods; safe unblocking must never resurrect a terminated V2 room or relationship.
6. Version/old client compatibility: rollout order must ensure V1 **read and write** denies on any V2 ID before the first such ID is exposed. No unsafe fallback even after rollback.
7. Terminal/expiry/private unread semantics and client screen memory/notifications/system backup; device QA before actual QA cutover.
8. Acknowledgment/presentation semantics: proof is a short-lived receipt of server delivery, **not actual on-screen viewing**; specify UX text, offline network recovery and 15m policy with accessibility/race review.
9. Audit-only security telemetry: request IDs, denial class, policy version, actor hashed/redacted; never content, token, KEK or full guessed room ID; retention/security review separately approved.
10. Reporting and history evidence FKs need independent V2-only linkage; never use paid retention as a workaround.

## 6. Release and rollback invariants

- While B3 design and isolated code proceed, **stable V1 synthetic QA must not be changed**, and source-only 0008 stays unapplied to hosted Neon.
- Prior to G1: rehearsed additive migration on *disposable* PG16 first, secure inventory/backup and operator approval for any later private QA migration, never drop/alter original four QA messages.
- Before exposing V2 rooms: demonstrate actual **negative network tests** that ALL old V1 read, write, bootstrap, peer, events, Keep, connections and reverse lookup surfaces cannot replay or mutate V2 conversations.
- After any V2 privacy cutover: rollback route to **safe-deny/upgrade-required**, never restore generic `/v1/.../messages` access. Keep a tested automatic stop path for keys/roles/decrypt failures.
- No physical purge/retention activation, case evidence, paid history or purchases in B3. Every later stage separate.
- **R0 Android phone/tablet physical acceptance remains OPEN.** The complete 138-case **What If?** review remains V2-16 LAST, not replaced by package-specific security tests.

## 7. Decisions and next approval

**B3 plan:** docs-only **PREPARED**. **Recommended next code decision:** authorise **B3a exact seven-file disconnected pure compatibility contract only**, with PR-head + postmerge CI, no route wiring/hosted DB/Android. B3b and B3c require separate founder reviews. No new product pricing, infrastructure subscription, security provider or launch date approved.
