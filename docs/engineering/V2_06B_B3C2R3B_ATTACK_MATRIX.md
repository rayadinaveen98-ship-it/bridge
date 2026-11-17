# Bridge B3c-2R3B — adversarial acceptance matrix (proposed)

**Status: TEST DESIGN ONLY. All checks OPEN until implementation and independent CI.**  
Synthetic signed JWTs, generated PostgreSQL18 credentials, checked-in migrations 0001–0008; no hosted endpoint.  
**A PASS in R3A means a known UNSAFE gap was reproduced. A PASS in R3B MUST mean the corresponding operation was DENIED or safely serialized. Never confuse these outcomes.**

## Actor identity and role isolation (R3B-01..09)

| ID | Scenario | Required acceptance |
|---|---|---|
| 01 | Missing, malformed, expired, wrong issuer/audience/signature JWT | deny before any secure SQL |
| 02 | Signed A token with request parameter actor=B | deny; no trust in caller UUID |
| 03 | Account subject reassigned or deleted between preflight/lock | deny, no mutation |
| 04 | Forged/tampered/expired/replayed custom actor context | deny without metadata/ciphertext |
| 05 | Signed actor tries SET ROLE, schema DDL or owner-only query | SQL denied; no grants |
| 06 | Runtime role cannot SELECT old `bridge_messages.body` or general history | privilege denied |
| 07 | Runtime role cannot read case evidence or key material | privilege denied |
| 08 | Different pooled user after COMMIT/ROLLBACK sees prior actor context | no leakage; default deny |
| 09 | Caller-supplied SQL/search_path/function/OID or dynamic table identifier | rejected; fixed SQL and privilege boundaries |

## Current LIVE and actor/peer status (R3B-10..19)

| ID | Scenario | Required acceptance |
|---|---|---|
| 10 | A and B eligible in active random session | both may read only current session |
| 11 | Mutual Keep direct D1, former random room | current D1 only; no legacy random transcript |
| 12 | New direct D2 after D1 expiry | D2 only; no D1 timeline |
| 13 | Account A suspended/restricted/deleted after old LIVE exists | deny A immediately at next transaction |
| 14 | Peer B suspended, safety-ineligible or age no longer verified | deny both ordinary LIVE reads |
| 15 | Actor A age/safety restriction while old LIVE exists | deny without ciphertext |
| 16 | B blocks A, or A blocks B | deny subsequent LIVE reads both directions |
| 17 | Participant left/removed; room closed/expired | deny, old payload not revived |
| 18 | Relationship ended, direct segment closed | deny LIVE, avoid previous-session fallback |
| 19 | Unknown conversation or wrong user | uniform unavailable; no enumeration metadata |

## WRITE, UNREAD and recovery (R3B-20..29)

| ID | Scenario | Required acceptance |
|---|---|---|
| 20 | Authorized SEND in active session | one accepted transaction with coherent counters/LIVE/UNREAD |
| 21 | Blocked SEND attempted after Block commits | deny + rollback all secure/outbox/counters |
| 22 | Expired random 30m idle (no accepted message refresh) | deny; no timer extension |
| 23 | A attempts sender=B or recipient=C | deny forged sender/cross-relationship envelope |
| 24 | Eligible B reads unread envelope from A in current active mutual Keep | recipient only, max 7 days |
| 25 | Block, suspension, Keep end or departure after UNREAD creation | deny subsequent inbox/ACK/recover; evidence separate |
| 26 | Expired, revoked, acknowledged, misbound UNREAD | no unauthorized envelope recovery |
| 27 | First ACK and later repeated ACK | first immutable, repeated cannot extend recovery |
| 28 | Valid recovery <=15m from first ACK and within 7d envelope deadline | bounded original recipient only |
| 29 | Expired recovery token, changed device proof, other actor envelope | uniform denial, no timeline revival |

## Atomicity, races and operational durability (R3B-30..40)

| ID | Concurrent/operational scenario | Required acceptance |
|---|---|---|
| 30 | Block writer commits BEFORE pending SEND obtains mutex | deny SEND, zero accepted write |
| 31 | SEND commits BEFORE Block writer obtains mutex | writer waits; next LIVE/UNREAD denied |
| 32 | Account status restriction races with current LIVE | consistent serialization, no stale access after revocation commit |
| 33 | Peer status/deletion races with ACK | one safe ordering; revocation winner prevents ACK |
| 34 | Participant exit races with SEND/READ | no stale participant access after exit commits |
| 35 | Relationship end races with UNREAD recovery | revocation safely wins or next attempt denied |
| 36 | Token expires while locks/crypto/write hooks delayed | rollback before commit; no ciphertext/outbox |
| 37 | Failure after metadata; after LIVE; after UNREAD; after outbox | full rollback, no partial records or counter changes |
| 38 | Lock acquisition order and deadlock under >=2 independent clients | deterministic order and bounded retry, never fail open |
| 39 | Old V1 Block/Keep/GET/POST/SSE writer does not participate in mutex | **EXPECTED BLOCKER**, do not claim hosted atomicity |
| 40 | Restricted role insufficient grant for a requested operation | deny, never retry under superuser/owner |

## CI and release acceptance (R3B-41..46)

| ID | Certification | Required acceptance |
|---|---|---|
| 41 | PG18 disposable cluster + exact DB/role/ACK before DDL | independent attestation; remote DSN refused |
| 42 | Original SQL migrations/ledger and previous physical QA record preservation | no migration changes; synthetic DB only |
| 43 | New tests and R3A negative control both run | corrected deny and documented old gap remain distinguishable |
| 44 | Existing Foundation PG16 and PG16/18 role matrix + actual PG18 proof pass | no regression on exact PR head |
| 45 | Exact eight-file implementation scope and no HTTP/start/Android import | diff and import fence verified |
| 46 | Later hosted role, keys, legacy firewall, R0 and What If? | separately gated; **NOT DONE** by offline test |

**Acceptance line:** B3c-2R3B-1 can be called TESTED only if all implemented cases pass and documented hold items remain explicitly open. Do not claim R3B-2 or hosted completion from this matrix. Evidence is a test plan, not a CI result.
