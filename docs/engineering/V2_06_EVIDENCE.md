# Bridge V2-06A — Disconnected Scoped Messaging / Unread Evidence Register

**Status:** V2-06A ISOLATED SYNTHETIC ENGINE IMPLEMENTED / CI VERIFIED / MERGED; LIVE NOT ACTIVATED.
**Authorized activity:** Disconnected new messaging modules, synthetic disposable PostgreSQL tests, test-only scripts/CI and evidence. User-visible V2 messaging, crypto, deployment, real data, Neon schema, billing, Android and retention are **NOT** activated.
**Baseline:** docs PR #25 merged to main@18c80daa13881f012e816636234a5ee5128cd03b, with its post-merge [Foundation run #43824321563](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43824321563) PASS (matching and postgres). The [implementation brief](V2_06_IMPLEMENTATION_BRIEF.md) remains the governing scope.
**Previous stage:** V2-05A merged as PR #24, exact head CI and post-merge CI verified in [V2-05 evidence](V2_05_EVIDENCE.md).

## Intended source / test boundaries

| Path | Function |
|---|---|
| apps/api/src/messaging/scope.mjs | Pure V2 current-only LIVE and recipient-only UNREAD eligibility, 30m/7d; failure closed |
| apps/api/src/messaging/sequence.mjs | HMAC actor/session/scope-bound cursor and unique sequence helpers; test key only |
| apps/api/src/messaging/unread.mjs | Finite 7d envelope, idempotent acknowledged first-grant, hard-bound 15m recovery, digest check |
| apps/api/src/messaging/repository.mjs | *Explicitly disposable loopback* PostgreSQL adapter for metadata, constant synthetic marker body and non-encrypted bytea fixtures; no user message body or hosted route |
| apps/api/tests/v2/messaging/policy.test.mjs | Pure boundary, negative authorization, sequence/cursor, recovery |
| apps/api/tests/v2/messaging/postgres.test.mjs | Synthetic atomic accept / duplicate conflict / race / fail-injection / unread / legacy QA fixture |
| apps/api/package.json | Named pure/DB test-only scripts; no production start change |
| .github/workflows/foundation.yml | Add pure matching check and disposable PG16 check after migration/restore/regression |
| docs/engineering/V2_06_EVIDENCE.md | Stage status, test matrix, restrictions |

**Absolute exclusions:** No edits to existing apps/api/src/{http,postgres,auth,start,live,outbox}.mjs, policy kernel, V2-04A or V2-05A modules, SQL migrations 0001–0007, apps/mobile/**, live Render/Neon database/roles/data, production crypto keys, real paid plans, message purge or real-user access. No new installed dependencies or paid services.

## Actual implementation boundary

- **No actual encrypted messaging is implemented.** The adapter requires the acknowledged loopback bridge_test URL; it uses a fixed synthetic marker in the existing NOT NULL bridge_messages.body and test-only opaque bytea payloads. They are NOT encrypted and must **never** contain user messages, nor be exposed to a hosted/Android client.
- Test-only recovered token and cursor keys are explicitly supplied as in-memory bytes to disconnected tests; production secrets, key custody, rotation, escrow, versioning and data minimization remain unresolved.
- Transactional PostgreSQL operations run behind a common matching/Block advisory mutex; SQL row locks and DB clock after locks protect current eligibility. No actual HTTP caller authentication exists here.
- An accepted synthetic message appends one room sequence and an outbox event containing **IDs/sequence only**, not message content, while recipient-only unread envelopes are created only for direct conversations.
- Current LIVE reads and unread/recovery reads return **metadata only**: no bodies, ciphertext or cross-session transcript.
- The original QA four-message fixture and old V1 routes remain unchanged. Existing v1 endpoint still needs secure cutover in future V2-11. V2-03 migration source remains disconnected from real Neon.

## Test traceability (candidate, not certified before CI)

| Criteria | Available tests | Evidence gap |
|---|---|---|
| M06-01–06 current session / relation / block / outsider | policy + postgres | Genuine authenticated HTTP/SQL runtime role gate NOT tested |
| M06-07–09 unique message/idempotency/clock | policy + postgres | No real ciphertext/authenticated content hashing |
| M06-10–12 concurrent send and expiry | postgres | Lock-delay adversarial race and production cross-process proof still needed |
| M06-13–15 HMAC actor/room/scope cursor / D2 isolation | policy + postgres | Tombstone on actual post-purge/sequence gap not yet implemented |
| M06-16–18 recipient only / random denial | policy + postgres | No real unread bytes fetched, intentionally |
| M06-19–21 seven-day expiry / block / ended D1 delivery | policy + postgres | Separate revoked-hold and in-flight ack+block cross-transaction case pending |
| M06-22–24 acknowledge, idempotency and 15m recover | policy + postgres | No real foreground crash/Android persistence |
| M06-25–27 metadata-only outbox and duplicate retry | postgres | No live SSE propagation/notification; deliberately excluded |
| M06-28–29 rollback / four legacy QA messages | postgres | Multiple failure stage injection coverage should be expanded |
| M06-30 regression suite / allowed files | Foundation CI | Record exact PR-head and post-merge jobs before claiming PASS |

**Test requirements before merge:** All V2-06A tests and prior V1/V2-01–05 suites + disposable PG16 schema migration/restore tests PASS at the exact final PR head. Inspect changed-file allowlist. Review SQL, error surfaces, HMAC signing/test-key reliance, raw bytea fixture label and sample clock correctness. Any failure stays unmerged until repaired. Consider unresolved candidate M06 rows BLOCKERS to broader V2-06 scope certification; do not misstate partial coverage as full stage certification.

## R0, delivery, rollback

- R0 phone/tablet full acceptance **OPEN**. Actual two-device V2 behavior **not tested**.
- V2-06A may at most be classified DISCONNECTED/CI VERIFIED on passing merge checks; **NO live activation** is authorized.
- Revert the isolated feature PR and discard disposable bridge_test test rows to roll back; no live data rollback or deployment is needed.
- Future V2-06B live integration requires a separate founder-reviewed plan resolving legacy body storage, real encryption/key management, trusted identity/policy/runtime role, old-v1 read safe-deny and Android protocol. Never roll back a completed privacy cutover to unsafe historical replay.
- Comprehensive 138-scenario What If? final review remains deferred to V2-16.


## Code-head review and initial CI verification — 2026-11-16

**Tested code head (before this evidence update):** 8c6fb6af510f99609c7931f98c6aff38269bb588.

- [Foundation PR run #43825689701](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43825689701): **matching SUCCESS** and **postgres-integration SUCCESS** on the code head. Current isolated V2-06A pure script recorded **7/7 passing tests**; disposable PostgreSQL script recorded **17/17 passing tests** (nested tests plus parent, zero failures/skips).
- Baseline V1 HTTP/auth tests, V2-01 contracts, V2-02 policy, V2-03 migration/PG16 restore, V2-04A random, V2-05A Keep/direct, and design token validation remained in successful jobs.
- Explicitly covered: millisecond 30m/7d/15m boundaries in pure tests; role, mutual, eligible participant, blocked, outsider and source marker denial; HMAC cursor rejects wrong actor/room/scope; 2-device concurrent synthetic message sequence, duplicate/conflicting client ID, matching match-slot validation, atomic outbox metadata, recipient-only unopened/acknowledged inbox, repeated ack, one 15m recovery grant, previous D1 read denial, 7d finite envelope, simulated payload tombstone, synthetic failure rollback, source legacy QA fixture SHA preservation, and deliberate global mutex wait across expiry.
- Reviewed PR changed filenames: **9 paths** only — four new source modules, two synthetic tests, apps/api/package.json test scripts, .github/workflows/foundation.yml test steps and this evidence doc; forbidden existing V1/V2-04A/V2-05A/SQL/Flutter/Neon/Render paths unchanged.
- The synthetic adapter binds its injected pg.Pool connection string to exactly the acknowledged loopback database and refuses non-bridge_test URLs; **this is a test isolation guard, not a claim of runtime production access control**.
- **No real message confidentiality:** fixed dummy body in legacy NOT NULL text column; "ciphertext" fields contain raw synthetic fixture bytes and are **NOT encrypted**. There is no body delivery, human-device UI, live SSE, production key management, consented history, 7d purge worker, Neon migration or Render integration.
- **Unresolved live-stage gates:** V2 encrypted storage and keys, HTTP trusted identity/policy binding, scoped authorization and DB role/RLS on hosted service, stale v1 read safe-deny, actual Android client flow and hardware R0 acceptance, abuse/throttling, load/incident tests. Real 30-case end-to-end certification cannot be asserted by isolated CI; the specific 06A model cases above were exercised.

**Governance:** The test evidence update creates a new PR head. Only if BOTH matching/postgres CI pass again at that exact final SHA, with no changed file outside the 9 path allowlist, may V2-06A be merged as **INACTIVE ISOLATED ENGINE**. Verify post-merge main CI and record it. If any check fails, DO NOT MERGE. Do not automatically begin V2-06B, apply live migration or deploy.


## Final PR, exact merged main and post-merge CI certification — 2026-11-16

**Final implementation PR:** [#26](https://github.com/rayadinaveen98-ship-it/bridge/pull/26) merged at main **4bb43266c53436fbe6dc7c4707c76ae2903cf367**. Final PR head **fe4d7a766a069852efa0c3e23563b3229bc3212b**; [final PR-head run #43825963819](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43825963819) completed **SUCCESS**, with matching and postgres-integration **SUCCESS**; the matching branch push run #43825958279 also SUCCESS.
- **Post-merge Foundation run #43826103264:** [GitHub Actions](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43826103264) completed **SUCCESS** at exact merge SHA. Both **matching** and **postgres-integration** job conclusions SUCCESS. New pure messaging/unread step and disposable PostgreSQL messaging step both SUCCESS.
- Verified **9 approved paths only** in final PR diff; four new disconnected source modules, two new synthetic test files, package test scripts, additive CI steps, and scoped evidence document. Original V1 runtime HTTP/PG, V2-04A, V2-05A, all SQL migrations, mobile client, live infrastructure/data/roles and billing untouched.
- Final V2-06A classification: **ISOLATED SYNTHETIC ENGINE IMPLEMENTED / CI VERIFIED / MERGED / NOT LIVE**. Test fixture body is a fixed dummy marker; bytea copies are **not encrypted**; no live content access, no Android UX, no Neon V2 migration, no Render deploy.
- **R0 physical QA remains OPEN**, full M06 live-message/crypto/recovery integration is NOT certified, and final 138-case What If? audit is still scheduled for V2-16. Future integration V2-06B and V2-11 privacy cutover require a separate approved brief and cannot unmask generic V1 historic reads.
