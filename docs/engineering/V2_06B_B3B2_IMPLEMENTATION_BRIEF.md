# Bridge B3b-2 — Atomic Signed-Identity + Private-Messaging Integration Brief

**Status:** DESIGN / EXACT SCOPE PROPOSED; CODE NOT APPROVED OR IMPLEMENTED.  
**Prepared:** 16 November 2026.  
**Verified baseline:** `main@110c5eaf29edaa2b45fa34a1b51c46d48778d3e1`; [Foundation CI #43879606406](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43879606406) **matching SUCCESS, PostgreSQL-integration SUCCESS**. [B3b-1 PR #44](https://github.com/rayadinaveen98-ship-it/bridge/pull/44) merged; its final evidence [PR #45](https://github.com/rayadinaveen98-ship-it/bridge/pull/45) merged and certified. No hosted code/deployment changed by that closure.  
**Companions:** [B3b-2 test/race matrix](V2_06B_B3B2_ATOMIC_TEST_MATRIX.md); [B3b-1 brief](V2_06B_B3B_IMPLEMENTATION_BRIEF.md); [B3b-1 evidence](V2_06B_B3B_EVIDENCE.md); [B3 security gates](V2_06B_B3_SECURITY_RELEASE_GATES.md); [Product Invariants](../product/PRODUCT_INVARIANTS_V1.md).

## 1. Goal and verified implementation gap

B3b-1 `apps/api/src/v2/private_subject_adapter.mjs` already verifies ephemeral signed RS256 synthetic JWTs, acquires the V2 advisory transaction mutex **714411**, resolves the current `bridge_accounts.auth_subject` via `SELECT ... FOR UPDATE`, checks active/age/safety/deleted flags and rechecks token expiry using PostgreSQL `clock_timestamp()` after lock acquisition. It invokes a trusted **internal test-owned callback** `work(client,{actorId})` before COMMIT.

B2a `apps/api/src/messaging/private_repository.mjs` still implements `acceptSynthetic` as an independent `withV2ConnectionTx(pool,...)` call. B2b `private_delivery_repository.mjs` similarly wraps `readCurrent`, `unreadInbox`, `acknowledge` and `recover` in independent transactions. Merely calling B3b-1 first and then one of these methods loses the verified actor's lock/transaction boundary and can produce TOCTOU authorization races.

**B3b-2 objective:** Demonstrate an **internally dispatched, single-transaction synthetic flow** from a verified signed subject through one DB-owned account and current peer/session/Block checks to encrypted write, current-LIVE read, finite direct UNREAD, first acknowledgment and bounded recovery. All against acknowledged disposable PostgreSQL 16 only. Existing test-only legacy B2a/B2b method names, behaviors and tests must remain working.

**This is NOT permission to wire the hosted V1/V2 HTTP service, apply migration 0008 to Neon, purchase keys, create APKs or declare production security.**

## 2. Engineering choice: one transaction, no nested checkout

**Preferred, lowest-risk design:** reuse B3b-1's already-verified transaction/callback rather than adding an outer HTTP facade that opens two transactions.

```text
Internal synthetic test request
  └─ fixed operation name + signed synthetic Authorization token
      └─ createDisposableSubjectAdapter(...).withVerifiedActor(...)
          ├─ strict loopback bridge_test / actual DB + 0008 receipt guard
          ├─ BEGIN -> advisory mutex 714411 -> actor SELECT FOR UPDATE
          ├─ DB clock-based JWT expiration recheck
          └─ verified internal callback on SAME PostgreSQL client
              └─ fixed, internal op switch; actorId ONLY from trusted callback
                  ├─ B2a acceptInExistingTx(client, trusted actor, payload)
                  ├─ B2b readCurrentInExistingTx(client, trusted actor, cursor)
                  ├─ B2b unreadInboxInExistingTx(client, trusted actor)
                  ├─ B2b acknowledgeInExistingTx(client, trusted actor, proof)
                  └─ B2b recoverInExistingTx(client, trusted actor, capability)
              └─ COMMIT or ROLLBACK (single owner, single client)
```

The exact internal method names above are **design placeholders**, not currently present. The implementation must choose stable names and prevent any new method from independently calling `pool.connect()` / `BEGIN` / COMMIT. A single transaction owner is B3b-1. No nested `withV2ConnectionTx`; no before-commit actor lookup followed by an after-commit B2 call. The public facade API must NOT accept `actorId`, `trustedActor`, auth subject, account status, premium role, encryption keys or transaction client from a caller.

**Proposed synthetic facade** `createDisposablePrivateAtomicFacade(pool,{authentication,writerKeys,readerKeys})` exposes one server-owned method `dispatchSynthetic({authorization,operation,payload})` with a **closed operation allowlist** (`send`, `live`, `unread`, `ack`, `recover`). The exact request DTO is test-only; no HTTP endpoint, User-Agent selector or client protocol is approved. Only internal test harness code chooses the operation; never execute an arbitrary callback supplied through a network payload. Fail closed for unknown keys/op names and invalid wire shapes.

### Lock and time requirements

- Lock **global mutex 714411 first**, then B3b-1's actor row under `FOR UPDATE`, then conversation/relationship and other peer state by a documented consistent order. B2a/B2b must read both participant account states with **appropriate row locks** (deterministic ID order) before the privacy-sensitive decision/side effect, not rely on an unlocked snapshot. This must be evaluated against existing V1 Block and unrelated account status writers for deadlocks and stale eligibility.
- The existing V1 `postgres.mjs::block()` already takes mutex 714411; `unblock()` does not. Synthetic row locks and V2 mutex will demonstrate particular ordered cases but **do not prove all hosted V1 account/revocation paths are safe**. Do not claim global linearizability after B3b-2. A later explicit G1/V2-11 network and writer audit is mandatory.
- B3b-1 verifies token expiry at admission and AFTER waiting for mutex/account row lock. The new test facade MUST additionally re-verify that same signed token using the authoritative PostgreSQL clock **after the inner B2 operation, immediately before the callback returns for COMMIT** (any expiry means rollback). This also covers waits on conversation/peer locks and crypto execution after the first recheck. No client `nowSeconds` or account flags; correct token semantics are assessed before the commit boundary.
- Existing B2a/B2b `lockedContext` / `authorizedLive` / `authorizedEnvelope`, sequence/UNREAD and HMAC cursor/proof implementation remain the policy source of truth. Refactor them as **same-client reusable inner workers** with no logic changes except necessary peer-lock hardening. Avoid duplicated authorization logic in the new facade.
- Transaction rollback covers **the full operation** (identity, room auth, metadata, ciphertext, recipient unread, event outbox, session deadline, acknowledgment). Incorrect token, Block, end, expired room, bad DEK/tag, key loss, cursor/ack/recovery tampering or injected DB failure must never leave half-committed rows.
- A decrypted response may be returned only after the transaction commits and current checks pass. After a response has reached a device, no server can revoke already-seen plaintext or prevent a screenshot; do not overclaim "instant" post-delivery revocation.
- Avoid holding locks for remote KMS calls or network I/O. The synthetic in-memory AEAD is synchronous; any future hosted KMS/provider latency needs separate design. Backoff/deadlock/timeouts must fail closed with bounded resource use.

## 3. EXACT proposed B3b-2 implementation allowlist — ten files

| # | Path | Scope |
|---|---|---|
| 1 | `apps/api/src/v2/private_atomic_facade.mjs` | **NEW** test-only fixed-operation dispatcher combining B3b-1 signed actor callback with B2a/B2b same-transaction inner operations. No HTTP/start imports or private keys from env |
| 2 | `apps/api/src/messaging/private_repository.mjs` | **MODIFY ONLY:** factor current `acceptSynthetic` internals into reusable, already-locked PostgreSQL-client work; preserve all existing B2a public behavior, AES-GCM/idempotency/canonical clock/outbox logic. Add no cloud keys or independent transaction in inner operation |
| 3 | `apps/api/src/messaging/private_delivery_repository.mjs` | **MODIFY ONLY:** factor `readCurrent`, `unreadInbox`, `acknowledge`, `recover` into already-locked client workers; preserve existing B2b methods, secrets, time/expiry and current-only/no-history semantics; strengthen peer-account row locks in shared helpers if tests require |
| 4 | `apps/api/tests/v2/identity/atomic_fixtures.mjs` | **NEW** ephemeral RSA + AES/HMAC fixture composition, synthetic actor/room factories and guarded PG16 snapshot counters; reuse original B2 fixtures without changing them |
| 5 | `apps/api/tests/v2/identity/atomic_write.test.mjs` | **NEW** signed-auth actor-to-B2a write, idempotency, no old V1 body, transaction count, rollback, expiry and Block tests |
| 6 | `apps/api/tests/v2/identity/atomic_delivery.test.mjs` | **NEW** signed-auth current-only LIVE, D1/D2 isolation, recipient UNREAD, first ACK, recovery 15m∩7d, sender/stranger/other-actor and forged-cursor/proof tests |
| 7 | `apps/api/tests/v2/identity/atomic_races.test.mjs` | **NEW** subject/account/status/Block/end/expiry races; adversarial client attempted actor injection, re-auth after lock wait, single-transaction PG16 assertions, key/tag loss and unchanged old fixture |
| 8 | `apps/api/package.json` | **ADD ONLY** named `test:v2:atomic-private:db` runner. Preserve all existing scripts/dependencies |
| 9 | `.github/workflows/foundation.yml` | **ADD ONLY** PG16 test step after B3b-1; keep matching, old migrations, V1, B1/B2 and B3a/b-1 steps unchanged, no hosted secrets/deploy permissions |
| 10 | `docs/engineering/V2_06B_B3B2_EVIDENCE.md` | **NEW** required acceptance, actual Node TAP counts/failed/skipped, lock/rollback traces, exact PR SHA/CI and scope-gate/unknown-risk ledger |

**Every other file is excluded from this implementation approval candidate**, including `private_subject_adapter.mjs`, `auth.mjs`, `http.mjs`, `postgres.mjs`, `start.mjs`, `live.mjs`, `outbox.mjs`, `direct_repository.mjs`, `scope.mjs`, `private_crypto.mjs`, B2a/b original test files, SQL migrations 0001–0008, Android/Flutter, Neon/Render resources and schema/data/roles, GitHub Actions deploy files, production RSA/KEK/HMAC keys, paid integrations, retention, case/history linkage and billing.

If these ten paths prove insufficient, **STOP and seek founder approval for a separate scoped adjustment.** In particular, do not silently edit the existing `withV2ConnectionTx` helper or B3b-1 identity source just to make a failing test pass.

## 4. Acceptance and test gates

The companion matrix defines scenarios `AT03-01..AT03-28`; they are **design acceptance IDs, not a promise of 28 independent Node tests**.

Nonnegotiable:
1. Signed synthetic RSA token drives **every** protected send/read/unread/ack/recover operation; wrong claims/subject/body `actorId` never selects the account.
2. A *single* checkout, BEGIN, 714411 mutex, account row lock, B2 scope checks and COMMIT/ROLLBACK owns each facade operation. Instrumented spies prove no nested checkout or separate preflight. Existing B2a/b standalone methods still work and retain their original tests.
3. Both participant account eligibility and Block/End conditions checked from current protected DB state at the authorized point; account status/subject token expiration while queued must deny with no message effect.
4. Unique accepted random/direct message advances only the correct V2 room 30-minute clock once; duplicates, polling, LIVE reads, ACK and recovery do not extend it.
5. Free Keep relation supports later D2 at zero price **without ever copying or exposing D1/random transcripts**. Direct UNREAD is independently encrypted and recipient-specific, originally bounded to seven days; first ACK is immutable and recovery ends at the earlier of firstAck+15m or original seven-day expiry.
6. When a Block/End/relation revocation has committed **before** authorization, all relevant operations deny. A lock-held operation can serialize before a concurrent block; test ordering and do not claim already-delivered bytes are retractable.
7. Transaction fault injection after metadata, ciphertext, UNREAD, event outbox, clock and ACK must roll back all affected rows and restore same valid session state; error responses redact actor/room/keys and avoid V1 plaintext fallback.
8. All tests use acknowledged loopback `bridge_test` PostgreSQL 16 and ephemeral injected keys only. Original four-message *synthetic test* fixture hash preserved, no external Neon/Render queries or writes.
9. No runtime import of the facade/B3b-1 adapter by `http.mjs`, `start.mjs`, `postgres.mjs`, `live.mjs`, `outbox.mjs` or Android; the main hosted V1 routes are **unchanged and still unsafe for V2 IDs** until a later firewall stage.
10. Exact ten-file PR diff; final HEAD push+PR matching and postgres-integration success, no skipped new tests; independent postmerge `main` CI and evidence. No merge if a privacy or race claim lacks proof.

### Acceptance red flags

- A token preflight commits before B2 starts a new transaction.
- A new `actorId` request field or client-provided `trusted` object controls who may read/write.
- Connection A and connection B are used for identity and message acceptance in the same claimed operation.
- Original B2a/b tests pass but are silently bypassed by a second independent SQL implementation.
- Missing peer lock allows a restricted peer to change status before the operation commits, while the suite claims unconditional revocation safety.
- Signed cursor or recovery token leaks into SSE, logs, outbox, V1 history or notification payloads.
- Test-only five-minute presentation-proof freshness is represented as an approved real-device UX policy.
- Any Neon schema application, Render deploy, real key purchase/provider selection, Android build/change or destructive retention occurs without separate founder approval.

## 5. Security and release status after passing this stage (conditional)

Even if B3b-2 passes, correct status is **DISCONNECTED SYNTHETIC FULL-TRANSACTION PRIVACY CONTRACT IMPLEMENTED + TESTED**, not private cloud deployment, not production KMS/age assurance and not E2EE. Real B3c key/runtime-role review, V2-07 case-evidence links, V2-08 retention, V2-09 optional prospective history, V2-10 Android, and **G1/V2-11 old-V1-read/write/SSE firewall and controlled private canary** remain separate.

The R0 founder physical Android phone/tablet acceptance is **OPEN** and must not be marked complete from GitHub CI. Complete 138-case What If? remains **V2-16 LAST**, while per-package security-critical negative tests stay mandatory now.

## 6. Next founder decision

**Proposed, NOT approved:** Authorize B3b-2 implementation **only** within the ten paths above, for a disconnected same-transaction synthetic JWT→V2 encrypted-write/read/unread/ACK/recovery facade and disposable PostgreSQL 16 races. Require exact diff/CI evidence before merge; prohibit all hosted HTTP, Neon, Render, Android, real keys, billing and retention changes. Keep B3c, G1 and physical R0 separately gated.

This B3b-2 brief and companion matrix are **documentation deliverables**, not approval to write source.
