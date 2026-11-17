# Bridge B3c-2R3B — atomic authorization architecture decision record

**Status:** PROPOSED architecture, founder-authorized **documentation/preparation only**. No R3B source code implemented or production role chosen.  
**Source of truth:** `main@0b3e4998697907033d7307ba95b0bb1326484cef`, 17 November 2026; B3c-2R3A PR #58 and certification PR #59 merged.  
**Safety gate:** **HOLD_V2**. Real Render DB pool sampled with owner/BYPASSRLS; PostgreSQL 18 prototype policy has reproducible revocation gaps. Hosted V2 schema is absent. This is NOT evidence of a live V2 breach.

## Why this new architecture is necessary

Existing disconnected B3b-2 PG16 code demonstrates signed actor mapping + eligible actor row lock + message transaction, checks live conversation and peer eligibility, Block and connection state for message operations, and rechecks token expiry before COMMIT. B3c-2R2 proves independent nonowner LOGIN and row scoping in PostgreSQL 18 with a synthetic signed actor HMAC and temporary RLS policies. **These are two different test systems, not one secure integrated data path.** B3c-2R3A reproduced 15/15 expected demonstrations that the test-only RLS still exposes prior LIVE after suspension/Block/closed room etc., and permits a blocked actor to INSERT. PASS there means *the prototype is unsafe*, not fixed.

### Non-negotiable user-facing privacy invariant

- Random anonymous session expires after **30 minutes of inactivity**, resetting only on truly accepted messages according to V2 policy. Mutual Keep creates a separate free direct conversation; former random transcripts never become direct history.
- Free users have **no previous-message timeline**. Only currently active, authorized session messages may be read under current LIVE policy. Future premium history requires independent mutual prospective consent, not retroactive resurrection.
- Independently bounded direct UNREAD may remain up to **7 days**, but every access rechecks mutual relationship, actor/peer eligibility, Block and revocation. ACK/recovery do not create free history or revive expired/revoked delivery.
- Safety evidence has a **separate purpose/role and retention authority**; revoking chat may preserve eligible evidence while denying any ordinary message read.
- A single uniform caller denial (`resource_unavailable`) must not reveal whether a target exists, is blocked, is suspended, or belongs to someone else.

## Trust boundary: design decision and competing options

**Rejected:** Directly GRANTing the API role broad table SELECT/INSERT with sender-only/recipient-only RLS; mutable actor GUC as identity; `USING (true)`; app pool with table ownership/BYPASSRLS; broad owner-rights views; reusing B3c-2R2 test-only SECURITY DEFINER/HMAC function unchanged. The PG18 red team shows this is unsafe.

**Option A — narrow database command gateway (preferred for an offline R3B-1 proof, NOT a production authorization):**
- An independent `bridge_v2_runtime` LOGIN is NOT table owner, not superuser, and has NO BYPASSRLS/DDL/role creation; it can invoke only reviewed, narrowly scoped commands with static search_path and fixed SQL, not arbitrary table reads. The gateway is owned by a distinct, minimal **authorization executor**, not a superuser or general migration owner; private tables and function privileges must be enumerated and independently audited.
- JWT verification in the trusted API is **necessary but alone insufficient** for untrusted database SQL: a procedure taking an arbitrary `actor_id` is spoofable by anyone who can issue SQL with the runtime credentials. Production proposal must independently bind the verified JWT/subject, command, conversation/envelope, expiry, transaction and role to an unforgeable, replay-resistant proof verified inside the DB trust boundary, OR use an independently vetted external authz service with equivalent scoped claims. No client-controlled GUC or bearer token without cryptographic verification.
- The database procedure must check the **current locked account, peer, participant, Block, relationship and room state** on every operation. No general `SELECT *` or dynamic SQL; revoke PUBLIC EXECUTE, audit every grant, enforce safe search_path and no ability to invoke the underlying owner to alter policy. Returning ciphertext/metadata must happen only within the same authorized command. Parent DB permissions must avoid function-based permission laundering.
- This is a *candidate design requiring threat-model review*. Never call the experimental signing key or SECDEF code in B3c-2R2 a production credential solution.

**Option B — invoker RLS plus independently validated user context:** direct table access behind comprehensive policies. It has more query flexibility but requires complex permission chains to accounts/Blocks/membership and easily creates information leakage via joins, views or functions. Do not select this without a demonstrated policy design and cross-user/phantom-row tests.

**Decision now:** Prepare tests to discriminate A and B; do **not** approve a production SECURITY DEFINER function, JWT/HMAC format, migration or secret provider yet. Optimize for minimal auditable grants, cost and maintainability rather than shortcuts.

## Transaction, writer protocol, and lock-order proof

**Important:** Account `FOR SHARE` / relationship `FOR UPDATE` alone does *not* protect against inserts of a new Block row, departures, or independently executing V1 writers. To serialize absence of Block, **every** new/legacy Block/revocation/account/relationship/participant writer must coordinate through the same gate. Without this, the integration must remain offline or conservatively deny until the old-client firewall is in place.

Proposed R3B-1 disposable protocol (to validate, not yet deployed):
1. Validate signature, issuer, audience, expiry and operation/path **before any data operation**. Do not accept actor UUID or credential selector from request bodies as authorization.
2. Acquire exactly one DB transaction/client. Begin with existing `pg_advisory_xact_lock(714411)` **for all participating V2 operations and synthetic lifecycle writers**. This global mutex is conservative for proof and may be a throughput bottleneck; benchmark before hosted scaling. Do not claim V1 writers already take it.
3. Resolve the signed subject to its immutable account binding inside the trusted boundary. Preliminary conversation/envelope/relationship lookup may supply peer IDs **only for subsequent locking**, not as a grant or response.
4. Lock the two account rows in **canonical UUID order**, actor included, with a lock mode that conflicts with status/deletion updates; establish an ordering across peer accounts, relationship, room, participants, direct segment and envelope. Avoid independent subsystems taking these locks in reverse order. Re-read and compare preliminary keys after acquiring locks. Never rely on a stale preflight decision.
5. Under the same transaction, verify both accounts active/age/safety/deletion; two distinct active participants and correct sender/recipient; no Block in either direction; relationship not ended; room/segment state, policy and deadlines; UNREAD state/recipient/7d expiry; and revoked/ack constraints. Use DB `clock_timestamp()` **after locks**, never device clock or stale transaction `now()`.
6. Execute precisely one of send / current LIVE / recipient UNREAD / first ACK / bounded recovery; return only minimal authorized fields. Original V1 plaintext, V1 history and unrelated current or earlier direct segments must remain inaccessible.
7. Recheck signed identity expiry and relevant revocation predicates before COMMIT; if any check fails, **ROLLBACK entire atomic operation**, including encrypted metadata, LIVE, UNREAD, outbox, counters and ACK state. Independently prove error paths and client release clear all transaction-local claims.
8. Revocation writers take the same synchronization before updating Block, accounts, Keep, direct room/segment, and participant state. Authorize negative races in both orderings: revocation commits first -> operation denied; operation commits first -> subsequent reads denied. No third state allows an unauthorized commit.

**Open blocker for R3B-2:** Old V1 POST Block/Keep/SSE/broadcast may bypass the proposed mutex. Until all legacy writers are fenced or migrate to compatible locking, the above proof does **not** establish real hosted atomicity. A future non-destructive integration must audit and cover every writer entry point. G1/V2-11 old-client firewall remains separately gated.

## Operation-level authorization

| Operation | Required live protection | Allowed payload | Never allowed |
|---|---|---|---|
| SEND | signed eligible actor, eligible peer, active V2 room/relationship/segment, no Block; acceptance clock | minimal accepted receipt; transactional LIVE/UNREAD | V1 plaintext, other actor write, after expiry/Block |
| CURRENT LIVE | same current active room, active participants, no Block | bounded current conversation including both sender and recipient | old random/direct transcript, unbounded free history |
| UNREAD | eligible recipient + peer, mutual active connection, matching current envelope identity and <=7d, no Block | recipient envelope only | arbitrary sender/recipient inbox, revoked/expired |
| FIRST ACK | same validated envelope, one irreversible first acknowledgement | minimal token/receipt | ACK replay to extend window, other actor ACK |
| RECOVER | same eligible recipient, active relationship, bounded recovery token, <=15m from first ACK | only original bounded envelope | timeline revival or expiry bypass |
| REPORT | separate case-specific authorization and evidence retention | approved safety evidence manifest | normal chat history via ordinary role |

## Permission and migration requirements

- Runtime: `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`, no table ownership, no unrestricted `SELECT`, `SET ROLE`, schema DDL or general key access. Separate schema migrator, case reviewer and retention worker. Audit `PUBLIC`, inherited grants, sequence privileges, default privileges, views, functions, `search_path`, RLS `FORCE`, and role memberships.
- **No live role swap** of legacy `BRIDGE_DATABASE_URL`: R0 V1 tables enable RLS without policies and a nonowner login could break existing QA. Keep migrations `0001..0008` non-destructive; never backfill or modify QA message rows during this offline work.
- No functional KMS/encryption keys in this stage; sample cryptographic data in tests remains synthetic and is not evidence of E2EE or deployed at-rest encryption.
- Production key/cost selection, Neon DDL/grants, Render env/credentials/deployments, Android UI, payment and launch each require independent approval.

## Stop conditions for any promotion

**Do not merge a production integration** if the runtime can query another actor's ciphertext, change arbitrary actor context, retain access after Block/suspension/closure, bypass the 30-minute policy, reuse earlier direct/history, commit a write after a stronger revocation wins, read safety evidence via messaging, or if legacy writers can race around the gate. Tests passing against synthetic policy alone is not enough. R0 physical signoff remains OPEN; final V2-16 138-case What If? review LAST.
