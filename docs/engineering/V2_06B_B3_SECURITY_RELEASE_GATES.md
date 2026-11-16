# Bridge B3 — Security, Operations, Cost and Release Gate Register

**Stage:** B3 documentation-only design; NONE of the release gates below are certified or authorized for execution.  
**Evidence baseline:** `main@f8b18c4cae7736179b0ce8487168d4cb3fb81a6e`, [CI #43854756002](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43854756002) matching+PG16 SUCCESS.  
**Review references:** [B3 API plan](V2_06B_B3_INTEGRATION_BRIEF.md), [B3 legacy-route/client matrix](V2_06B_B3_ROUTE_CLIENT_MATRIX.md), [B2a/B2b evidence](V2_06B_B2_EVIDENCE.md), [Product Invariants](../product/PRODUCT_INVARIANTS_V1.md).

## 1. Nonnegotiable trust boundaries

| Boundary | Existing verified work | Not yet proven; stop rule before hosted activation |
|---|---|---|
| AuthN | V1 `verifyBearer` validates RS256 signature/issuer/audience/expiration/subject; V1 database service resolves `auth_subject` | B2a/B2b synthetic caller `actorId` is NOT derived from this. No future V2 body `actorId`; B3b verifies signed JWT -> account mapping under current DB state and race |
| Adult and policy | Cloud QA lab test accounts seeded `age_verified_at`/safety flags | Genuine public adult assurance and user policy acknowledgment unimplemented; NEVER open real-user matching |
| Row authorization | B1a 0008 tables RLS enabled/no runtime policies; B2 uses synthetic database owner | Actual Render runtime DB principal, BYPASSRLS, grants and row policies unverified; no hosted V2 auth/DDL |
| At-rest content | B1b AES-256-GCM synthetic ephemeral provider, purpose-separated per-message DEK/wrapping | No production KEK provider, restart/restore/rotation/rekey, compromise workflow, audit or key backup. Server-side AEAD is NOT E2EE |
| Cursor/proof/recovery | B2b isolated HMAC cursor, presentation proof, digest-bound recovery | HMAC keys ephemeral; no user device protocol, key lifetime/version or availability guarantees; five-minute presentation proof is TEST ONLY |
| Random/direct isolation | B2a/b synthetic current-only and separate D1/D2, unexpired 30-minute clock | Old V1 plaintext routes not yet safely gated against V2 IDs; no real Android/new API rollout |
| Revocation | V1 `block()` and V2 engines share 714411 mutex; V2 test negative races | Unblock lacks same lock and all account/policy updates not certified; true V1/V2 concurrent HTTP actor revocation not proven |
| Unread | One per-recipient, up to 7d, firstACK+15m synthetic recovery | No production unread background delivery, receipt presentation UX, multi-node key recovery or device acceptance |
| Report & history | Legacy report intake; 0006/0007 scoped storage references legacy message IDs | V2-07 safety evidence and V2-09 prospective history require separately approved *V2 secure message* linking, never dummy `bridge_messages.body` |
| Retention | V2-08 proposed dry-run; original random 24h purge target documented | No physical cleanup or legally reviewed retention job activated; DO NOT silently delete legacy QA |
| Public operations | Lab-mode controls, body-free SSE/outbox event hints | No staffed moderation/incident response, public abuse defense, real-person age assurance, legal/safety gate or beta |

## 2. Exact pre-release checks and owner sign-off evidence (all PENDING)

| Gate | Required artifact and evidence | Current status |
|---|---|---|
| G-B3a pure compatibility | Exact founder-approved seven-file B3a PR, pure negatives X03-01..24; PR head and postmerge both Foundation jobs green | **PROPOSED, NOT AUTHORIZED CODE** |
| G-B3b actor boundary | Separate founder-approved disposable PG16 facade tests, real RS256 signed synthetic token, DB subject mapping, account/peer locks, stale token/role/race negatives | **PROPOSED, NOT AUTHORIZED CODE** |
| G-K1 key custody | Decision on hosted environment secrets vs managed KMS, threat model, operating cost, versioned purpose keys, rotation/restore/loss/compromise rehearsal, key change control | **UNSELECTED; NO PROVIDER OR SPEND** |
| G-DB1 real principal | Separately approved redacted read-only inspection of `current_user/session_user`, role attributes/BYPASSRLS, table grants and RLS policies; service runtime must be nonowner least-privilege | **UNVERIFIED; DO NOT GUESS** |
| G-P1 route firewall | Real dual-version network tests on an approved *nonpublic* canary show old V1 GET, POST, SSE, bootstrap, peer, Keep, close and connections cannot expose/mutate V2 | **NOT IMPLEMENTED; NO REAL ENDPOINT TEST** |
| G-S1 revocation | Same-transaction eligibility/Block/end semantics and account-status mutations; exact concurrency tests against V1+V2 routes; no stale response content | **PARTIAL TEST-ONLY; NOT LIVE VERIFIED** |
| G-07 reporting | V2 secure source-message evidence FK redesign, token/report route, retention and case reviewer access audit; cannot leak former chat | **V2-07 SEPARATE** |
| G-09 history | Both-party prospective consent, free vs paid separation, 90d rolling retention; never retroactive, `₹0` TEST only | **V2-09 SEPARATE** |
| G-R0 device | Founder physical phone+tablet login, send/receive, resume/back, block/report, two-device and exact build/Render SHA logs | **OPEN** |
| G-A10 V2 Android | Approved V2 client path version, memory/cache/error/notification/recovery behavior and device evidence; no old fallback | **V2-10 GATED** |
| G-G1 private QA cutover | Founder approves exact backend SHA + Android APK, additive Neon migration with backup, safe old-client denial, kill switch, staged canary | **G1/V2-11 NOT APPROVED** |
| G-G2 physical V2 | Founder exact tester-device pass/fail and independently verified privacy scenarios | **NOT STARTED** |
| G-G3 public operations | Genuine adult verification/policy consent, staffed moderation, privacy rights, incident process, legal/privacy review and monitoring | **NOT READY / NO PUBLIC BETA** |
| G-16 exhaustive audit | Full 138-case What If? test with evidence, residual risk and final founder go/no-go | **V2-16 FINAL** |

**No gate above is satisfied merely by Node CI on disposable synthetic fixtures.** B1/B2 are correctly marked implemented/tested/inactive; B3 requirements are proposed.

## 3. Real runtime database principal — inspection only with later explicit authorization

Recommended redacted, read-only probes in a restricted console or preapproved offline script:
- `SELECT current_user,session_user` from the **actual Render application pool**, without printing connection URL or passwords.
- `pg_roles` attributes `rolsuper,rolbypassrls,rolcreaterole,rolcreatedb` for that principal; make no assertion about those flags now.
- `pg_class.relrowsecurity,relforcerowsecurity`, role effective GRANTs on `bridge_v2_secure_messages/live/unread` and future evidence/history tables; owner exemption must be considered.
- Verify scoped nonowner *denials*, not just that the owner can query the table. Never write test or PII values into hosted Neon for this inspection.
- Explicitly isolate migrator, API, future retention worker and case reviewer identities. The worker/report owner must not be repurposed as the chat API principal.

This is a **future approval brief only**. No connector currently supplied credentials or ran a live privileged query in this B3 planning stage.

## 4. Durable key management options — security and cost evaluation

| Path | Benefit | Cost/risks and founder gate |
|---|---|---|
| Synthetic in-memory KEKs/HMAC (B1b/B2b current) | No new spend, deterministic disposable CI evidence | **Testing only**. Keys vanish on process restart, no reliable unread/ack recovery. Cannot deploy for user content |
| Hosting environment secrets with versioned scoped keys | May use existing paid/free platform features without extra vendor; fewer moving pieces for synthetic canary | Compromised host exposes keys; rotation and restoring 7d unread require explicit old versions; backups and multi-process nonce controls. **Not selected or approved** |
| Managed KMS with distinct access controls | Better audited key control, rotation, revoke and secrets separation | Provider availability, network latency, cost per operation, onboarding/integration; must present concrete provider and forecast for founder approval. **Not selected or approved** |
| Client-held E2EE | Can reduce server plaintext capability | Totally separate identity, safe reporting, abuse response and multi-device recovery design; conflicts with present server-side model. **Not part of this scope** |

Production minimum key requirements: distinct live/unread/recovery/cursor/presentation key purposes; keyId + version with controlled rotation and retain-old-key schedule **strictly within needed retention**; no key bytes in SQL/logs or Android; AEAD authenticated metadata stable; test crash/restart with envelopes pending; safe denied access on key loss; isolation of moderator/case encryption from ordinary chat; disaster recovery preserving privacy and consent boundaries.

**No subscription/payment/provider/secret creation is authorised by this document.** Current free QA baseline can remain while founder evaluates options. No price forecasts given without current vendor terms and usage model.

## 5. Recovery proof, accessibility and privacy UX

The B2b module emits a synthetic HMAC-signed proof with a five-minute lifetime when it decrypts an unread item. That proves receipt of a server-generated capability; **a malicious client can claim it displayed the text**. Proposed V2 Android protocol must distinguish receipt, human-facing display and final ACK in user copy.

Recommended UX:
1. Deliver unread only to the eligible current mutual recipient; avoid historical chat timeline and stale message previews in app switcher/notifications.
2. Explicit first-ACK after rendering/accessible presentation attempt, not automatically on fetch or SSE hint; server confirms immutable first acknowledgment.
3. Recovery capability is a **short transport-error recovery facility**, not an inbox. Hard bounds: before `first_ack+15m` AND before `accepted+7d`. An unread item delivered near the 7d hard cap receives at most the remaining few seconds.
4. A separate accessibility/offline test must validate slow TalkBack reading, background/foreground transition, two-device first ACK races, token loss after process kill, and degraded connectivity. Five-minute presentation proof TTL requires explicit future decision; do not adopt as final UX policy from tests.
5. On expiry, Block, End or key outage, show a redacted state without revealing old messages. No claim that revoking access prevents screenshots or content already viewed by recipients.

## 6. Rollback/no-data-loss plans, by stage

**R0: documentation/synthetic code** — Git revert and discard disposable PostgreSQL fixtures; no real data migration needed. Preserve tested B1/B2 code baseline.

**R1: later additive production-like QA schema, before new data** — feature flags OFF; leave additive tables intact pending forward repair; no destructive down-migration. Requires separate Neon backup/runbook approval.

**R2: private V2 encrypted writes exist** — disable V2 writer/reader, keep encrypted rows and safety evidence untouched for forensic consistency; fix forward, do not attempt to convert them back into legacy plaintext. Key loss may make content inaccessible; do not invent recovery.

**R3: old client deny activated** — if cutover fails, safe-deny/upgrade-required even for a rollback; **NEVER re-enable `GET /v1/conversations/:id/messages` on V2 rooms**. Cannot trade privacy for old APK compatibility.

**R4: case/retention cleanup later** — independently approved dry run, legal holds, backup retention, execution manifest, no deletion/revival of grandfathered legacy QA. Destruction requires explicit founder authority.

**R5: public safety** — stop new matching and revoke session/key route access without deleting evidence or bypassing reports, and preserve incident response capability.

## 7. Controls and authority

- Documentation PR merge is not engineering approval.
- B3a exact seven-path pure contract is the next **recommended** engineering permission. B3b separate, B3c separate, V2-07/08/09 separate, Android V2-10 separate, actual G1/V2-11 Neon/Render separate.
- R0 **phone/tablet** acceptance cannot be marked passed until user confirms devices and exact build; do not infer from CI.
- Full 138-case **What If?** must remain **V2-16 last**. Earlier security/privacy negative tests are obligatory at each gate and do not replace that final review.
