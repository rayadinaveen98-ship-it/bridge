# Bridge V2-06A — Disconnected Scoped Messaging / Unread Evidence Register

**Status:** IMPLEMENTED ON ISOLATED FEATURE BRANCH; CI AND CODE REVIEW **PENDING**.
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
