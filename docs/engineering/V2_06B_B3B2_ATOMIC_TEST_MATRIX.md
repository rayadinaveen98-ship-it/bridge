# Bridge B3b-2 — Atomic Auth + Private Messaging Security/Race Matrix

**Status:** PROPOSED ACCEPTANCE SPECIFICATION / NOT IMPLEMENTED / NOT TESTED.  
**Baseline:** `main@110c5eaf29edaa2b45fa34a1b51c46d48778d3e1`, [CI #43879606406](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43879606406) matching+PostgreSQL SUCCESS.  
**Scope owner:** [B3b-2 exact ten-file brief](V2_06B_B3B2_IMPLEMENTATION_BRIEF.md).  
**Test environment:** **disposable PostgreSQL 16 `bridge_test`, ephemeral RSA and AES/HMAC fixtures ONLY**. The test names below are acceptance IDs, not recorded passing test results.

## 1. What must become atomic

The transaction must encompass:
1. Verified synthetic JWT `sub` -> exactly one DB account under B3b-1 advisory lock **714411** and `FOR UPDATE`.
2. Current account eligibility and the proper partner's eligibility/Block/relationship state, protected by correctly ordered account/room/relationship locks.
3. B2a write and idempotency; or B2b active room LIVE read; or recipient-only finite UNREAD list / ACK / recovery.
4. For writes: independently authenticated per-item AES-GCM and DEK wrapping, V2 metadata and LIVE row, direct-only recipient envelope, body-free outbox and **only new accepted-message** expiry update.
5. Last in-transaction token-expiry/eligibility check before commit when additional locks or cryptographic processing may have crossed the expiration boundary; any failure rolls back, no plaintext or token exposed.
6. **One checkout, one BEGIN, one COMMIT/ROLLBACK** owned by the B3b-1 adapter. A test-only facade invoking old B2's independent `pool.connect()` must be a HARD FAIL.

**Proof boundary:** transaction ordering can be verified in disposable PG16. It cannot certify real Render database grants, all V1 account writer lock protocols, actual adult assurance, late user-device delivery after commit, real KEK custody or old APK behavior. Full joined server/client verification remains later G1/V2-11 and V2-10.

## 2. Case matrix (28 proposed IDs, no claim of tests passing)

| ID | Scenario / fault injection | Required observable outcome |
|---|---|---|
| AT03-01 | Signed ephemeral RS256 subject A dispatches direct V2 SEND | One atomic accepted receipt for A, no account/client actor mix-up |
| AT03-02 | Modified request supplies `actorId=B`, role=admin, premium or `auth_subject=B` | Reject before B2; no writes or leaks; A identity strictly from JWT+DB |
| AT03-03 | Forged/wrong algorithm, issuer/audience/expired JWT, or missing bearer | Uniform denial; no B2 DB state changed |
| AT03-04 | Account A becomes restricted or subject changes while waiting on mutex | Re-read locked DB identity, deny; no message/receipt |
| AT03-05 | Token passes admission then expires while waiting for room/peer lock or crypto | Final DB-clock expiry check denies and rolls back before commit |
| AT03-06 | Actor's `safety_eligible=false` or `deleted_at` set before transaction acquires lock | Deny all five protected operations |
| AT03-07 | Partner's `status`, age or safety eligibility revoked before SEND/READ | New state wins; no protected payload transmitted |
| AT03-08 | Partner account UPDATE races with an already-authorized operation | Explicit consistent ordering: committed revocation before auth denies; update during held row lock waits; no deadlock |
| AT03-09 | Synthetic identity subject A re-assigned to unrelated DB account B | Old A token cannot operate as B, even with valid signature |
| AT03-10 | Falsified random/direct stored scope, outsider room UUID, stale old-client ID | Deny without disclosing room existence or falling back to V1 body |
| AT03-11 | Valid current random first SEND at 29:59 idle | Accept new unique message; only then advance 30m server-owned deadline |
| AT03-12 | Duplicate clientMessageId, poll, LIVE read or ACK on active room | No second message, no sequence gap, and no idle deadline extension |
| AT03-13 | Direct SEND into D1 under active mutual Keep | Insert metadata, authentic LIVE ciphertext, separately encrypted 7d recipient UNREAD, body-free outbox; **zero V1 plaintext rows** |
| AT03-14 | Failure injected after V2 message metadata insert | Identity + DB rollback leaves no secure row/outbox/clock changes |
| AT03-15 | Failure injected after LIVE/UNREAD encrypt and DB insert | All associated rows roll back atomically, no partial recipient envelope |
| AT03-16 | Failure after event outbox append but before 30m clock update | Roll back outbox, receipt and ciphertext; no hidden accepted message |
| AT03-17 | Authenticated A/B LIVE read in open active current random or direct room | Only current LIVE page with actor+room HMAC cursor, no previous-session result |
| AT03-18 | Read old D1 after End; open D2 for free; replay D1 cursor into D2 | D1 read denied; D2 starts empty; no transcript import or cross-room cursor |
| AT03-19 | Stranger/other actor, sender as recipient or guessed secure message/envelope ID | Uniform denial; no plaintext or existence oracle |
| AT03-20 | A sends direct message then D1 closes but mutual relation survives | B alone may access eligible finite recipient UNREAD; no D1 history pagination |
| AT03-21 | Recipient sees unread and supplies valid synthetic presentation proof | First ACK stored once with one immutable timestamp and digest-only recovery capability |
| AT03-22 | Recovery at firstAck+14m, then at exactly +15m; original 7d expiry earlier | Allow only strictly before `min(firstACK+15m,accepted+7d)`; later deny |
| AT03-23 | Original accepted+7d reached with unread state or unacknowledged proof | No delivery/recovery; no automatic extension or previous timeline |
| AT03-24 | Either-side Block/unmatch/end relationship committed while request queues | Deny subsequent read/write/ACK/recovery, no resurrection on unblock |
| AT03-25 | Invalid AEAD tag, wrong KEK/version, forged cursor/proof/capability | Fail closed with no partial plaintext, no V1 fallback, and rollback when needed |
| AT03-26 | Two-device concurrent ACK for one recipient envelope | One immutable first ack; same bounded recovery eligibility; no 15m window extension |
| AT03-27 | Instrument `pool.connect`, `BEGIN`, `COMMIT/ROLLBACK`, client IDs and mutex | Single transaction/client for each facade call; no nested preflight and no B2 second checkout |
| AT03-28 | Legacy QA synthetic four-message hash + all original CI suites + exactly ten file diff | Historical fixture identical; prior B2a/b, B3a, B3b-1, B1/V1/PG16 migrations all pass; no hosted imports |

## 3. Mandatory concurrency experiment design

- **Lock-order negative experiment:** hold mutex 714411 on connection 1, begin verified V2 SEND on connection 2, change account eligibility or Block on connection 3 before mutex release, then release. Expect the newly committed restriction to deny. Do not use fixed sleeps as the sole proof; use PostgreSQL transaction gates / observable lock acquisition when possible.
- **Peer-row experiment:** keep a real verified op inside the B3b-1 callback while a separate disposable PG transaction tries to restrict its peer. With approved `FOR SHARE`/row-lock order, the UPDATE must not commit until the protected operation completes, or the operation must deny if the update won first. Confirm no unbounded waits or deadlocks.
- **Expiry experiment:** issue a short-lived *synthetic* signed JWT and gate a DB row lock until token expires. A second token check must be performed after the final wait and before COMMIT; verify no ciphertext/sequence/outbox/ACK state was committed.
- **Two-device ACK experiment:** both synthetic devices hold the *same recipient identity* and different concurrent callbacks; one acknowledgment succeeds first, the other sees original first-ack timestamp. Subsequent token must not renew the deadline.
- **Failure experiment:** inject failure after each durable write boundary in B2a and after B2b state mutation. Verify exact before/after database counts and original room deadline. Errors must be redacted.
- **Content secrecy experiment:** inspect only disposable test records and event payloads, never real Neon. Verify no plaintext in V1 `bridge_messages.body`, V2 outbox JSON, API-analogue error serialization, cursor, notification or DB event data. Tests must not print RSA private key, KEK or plaintext in CI logs.

**Limitation of simulated lock tests:** A queued operation that commits before a later Block may already have supplied plaintext; no design can revoke text seen or captured by a recipient. Product promise is server-enforced denial once a Block is authoritative, not retrieval of previously viewed content.

## 4. Code-review/release checklists

**Provenance:** facade verifies subject internally and passes only its locked DB-owned actor ID into the B2 inner worker. No network-usable arbitrary callbacks, no dynamic SQL table names, no new bypass in `acceptSynthetic` or `readCurrent`. The existing B3b-1 `private_subject_adapter.mjs` must remain unchanged unless the founder explicitly expands scope.

**Privacy:** after D1 End, no ordinary history; recipient UNREAD up to 7d only while eligible; firstAck+15m recovery does not become a browsable history archive. No premium entitlement/consent shortcut. Safety report evidence is separate.

**CI:** named `test:v2:atomic-private:db` added only for disposable postgres-integration job; zero failed or skipped new tests. B3b-1 pure JWT and 28 prior new TAP outputs, B3a pure 25, B2a/B2b and every old test remain in workflow. Count actual TAP rather than equating 28 labels to 28 test blocks. Final PR branch push and PR event both jobs green on exact final evidence HEAD, then independent merged main CI.

**Change control:** this plan authorizes no source. Exactly ten file path approvals are required from founder before implementation. Stop on any additional DB migration, GitHub secret change, Render/Neon inspection/writes, live key requirement, Android edit, retention deletion or billing action.

## 5. Beyond B3b-2

**Separate gates** remain:
- B3c: real Render DB principal/RLS and key custody/provider/rotation (redacted audit and budget approval before any hosted change).
- V2-07: reporter-bound 7d post-end tokens, secure message/case evidence linkage and reviewer controls; no leaked ordinary history.
- V2-08: dry-run-only retention manifests, explicit later deletion approval.
- V2-09: ₹0 test entitlements, bilateral prospective 90d premium history model; billing separate.
- V2-10: approved Android V2 interaction/empty/error/offline/reader/back-up design and device QA.
- G1/V2-11: actual V1 GET+POST history/old-client safe-deny, SSE/bootstrap/peer/Keep/version gate, approved additive Neon/Render canary, no unsafe rollback.
- V2-12..15: retention activation, public age assurance and staffed safety operations, optional sandbox billing, invite-only adult beta readiness.
- **R0 physical phone/tablet acceptance OPEN. V2-16 complete 138-case What If? audit FINAL.**

No public release, E2EE claim or product subscription is supported by B3b-2 tests alone.
