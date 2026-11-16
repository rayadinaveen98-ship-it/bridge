# Bridge B1 — Proposed V2-Only Schema and Cryptographic Data Contract

**Status: PROPOSED SPECIFICATION; NO SQL OR CRYPTO IMPLEMENTATION.**  
**Applies to:** [B1 Implementation Brief](V2_06B_B1_IMPLEMENTATION_BRIEF.md), [V2-06B Security Brief](V2_06B_INTEGRATION_SECURITY_BRIEF.md), [V2-06B Threat Model](V2_06B_THREAT_MODEL.md).  
**Baseline:** main@e18fc51d3de8522eb8e77d81f8eb475c1794694b.  
**Product constraints:** free current-only LIVE; 30-minute newly-accepted-message idle; independently addressed 7-day UNREAD; 15-minute recovery after first acknowledgment; free mutual reconnection; no old transcript or random history; no actual key management provider approved.

## 1. New-table contracts, NOT executable SQL

These proposed columns and checks are to be implemented as **one new numbered migration 0008** after exact founder authorization, with no modification to existing migrations 0001–0007.

### A. bridge_v2_secure_messages — encrypted message index only

| Field | Proposed type and constraint | Notes |
|---|---|---|
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | Not present in bridge_messages |
| conversation_id | uuid NOT NULL REFERENCES bridge_conversations(id) ON DELETE RESTRICT | Random or fresh direct V2 room; never copy old source |
| sender_id | uuid NOT NULL | Must be actual participant |
| client_message_id | uuid NOT NULL | Sender-supplied **idempotency** key; not authentication |
| sequence_number | bigint NOT NULL CHECK (>0) | Transactional per-room unique sequence starting at 1 |
| policy_version | varchar(40) NOT NULL CHECK (= 'bridge-v2') | Must be V2-marked |
| accepted_at | timestamptz NOT NULL | Server DB clock **after locks** at acceptance |

**Required FKs/uniqueness:** FOREIGN KEY (conversation_id, sender_id) REFERENCES bridge_conversation_participants(conversation_id, account_id) ON DELETE RESTRICT; UNIQUE (conversation_id, sequence_number); UNIQUE (conversation_id, sender_id, client_message_id). Index room+sequence for authorized CURRENT-room fetch only. No body/text, ciphertext, private plain hash or archive fields in this index.

**Future B2 access requirements, not SQL guarantees:** verify room is V2-marked/current/OPEN, server time < idle deadline, current valid random match slots or active mutual/direct relation, both accounts eligible and no block. Existing V2-06A metadata guard is **not** a production identity source.

### B. bridge_v2_secure_live — one authenticated ciphertext blob per message

| Field | Proposed type / check | Notes |
|---|---|---|
| message_id | uuid PRIMARY KEY REFERENCES bridge_v2_secure_messages(id) ON DELETE RESTRICT | 1:1, independently removable ciphertext row |
| ciphertext | bytea NOT NULL, 1–16384 bytes | Real only after later B2 approval; fixture data only in B1 |
| data_iv | bytea NOT NULL length 12 | 96-bit AES-GCM message-data IV |
| data_tag | bytea NOT NULL length 16 | 128-bit integrity tag |
| wrapped_dek | bytea NOT NULL nonempty | Per-message 32-byte DEK encrypted under KEK; never plaintext DEK |
| wrap_iv | bytea NOT NULL length 12 | Must not repeat for the same KEK/version |
| wrap_tag | bytea NOT NULL length 16 | Integrity on wrapped DEK |
| kek_id | varchar(128) NOT NULL nonempty | Nonsecret identifier; no key material |
| kek_version | int NOT NULL CHECK >= 1 | Rotation, wrong-key failure |
| cipher_suite | varchar(32) NOT NULL CHECK (= 'aes-256-gcm-v1') | Explicit protocol suite |
| aad_version | smallint NOT NULL CHECK (= 1) | Canonical AAD format version |
| encrypted_at | timestamptz NOT NULL | Server clock; not chat accepted-at |
| retention_due_at | timestamptz NULL | Future V2-08 policy only; not a live purge scheduler |

Use purpose-specific LIVE KEKs and a UNIQUE (kek_id, kek_version, wrap_iv) constraint. No SQL crypto/decrypt stored procedures; plaintext is never stored. If an approved future retention process deletes this ciphertext row, secure-message metadata remains to advance the **authorized current-session sequence** using a tombstone; logical deny is immediate when session closes. No B1 deletion executed.

### C. bridge_v2_secure_unread — per-recipient separately encrypted envelope

| Field | Proposed type / check | Notes |
|---|---|---|
| id | uuid PRIMARY KEY DEFAULT gen_random_uuid() | Opaque envelope identity |
| message_id | uuid NOT NULL REFERENCES bridge_v2_secure_messages(id) ON DELETE RESTRICT | Direct message only, enforced in later B2 adapter |
| connection_id | uuid NOT NULL REFERENCES bridge_connections(id) ON DELETE RESTRICT | Active mutual scope |
| recipient_id | uuid NOT NULL REFERENCES bridge_accounts(id) ON DELETE RESTRICT | **Only intended recipient** |
| accepted_at | timestamptz NOT NULL | Must match source accepted time in B2 transaction |
| expires_at | timestamptz NOT NULL | accepted_at < expires_at <= accepted_at + 7 days |
| state | varchar(16) NOT NULL ('unread','acknowledged','expired','revoked') | Default unread |
| first_acknowledged_at | timestamptz NULL | Immutable when first set |
| recovery_token_digest | bytea NULL / exactly 32 bytes | Digest only; never raw token |
| ciphertext | bytea NOT NULL, 1–16384 bytes | Separately encrypted recipient copy |
| data_iv, data_tag | bytea NOT NULL lengths 12 and 16 | Independent from LIVE blob |
| wrapped_dek, wrap_iv, wrap_tag | bytea NOT NULL, nonempty / lengths 12,16 | Independent per-copy DEK/IV |
| kek_id, kek_version | varchar(128), int >=1 | Purpose-specific UNREAD KEK, not LIVE |
| cipher_suite, aad_version | fixed suite/version | Authenticated per-recipient AAD |
| created_at | timestamptz NOT NULL DEFAULT clock_timestamp() | Metadata-only |

**Required uniqueness and checks:** UNIQUE(message_id,recipient_id); UNIQUE(kek_id,kek_version,wrap_iv); CHECK (expires_at>accepted_at AND expires_at<=accepted_at+interval '7 days'); CHECK (first_acknowledged_at IS NULL OR first_acknowledged_at>=accepted_at); CHECK (state <> 'acknowledged' OR first_acknowledged_at IS NOT NULL); CHECK (recovery_token_digest IS NULL OR octet_length(recovery_token_digest)=32); CHECK encrypted fields length/purpose. Index (recipient_id,expires_at,accepted_at,id) WHERE state='unread'. No index or API permitting previous-session transcript lookup by conversation ID.

**Important limitations:** A SQL FK cannot by itself establish that recipient is the *other member of this exact active pair*, nor that source is a direct room or accepted_at matches immutable message metadata; those are **transactional B2 authorization invariants** and negative tests. B1 SQL must not introduce a trigger that silently reads or modifies V1 rows.

## 2. Scope and tombstone rules

| Resource | Eligible during live session | Eligible after session close | Physical lifetime / release gate |
|---|---|---|---|
| Secure message metadata | Only the authorized **CURRENT** room/participant | No free history; metadata inaccessible to ordinary users | Future retention/audit policy |
| LIVE ciphertext | Current authorized OPEN/unexpired room only | Denied immediately, even if encrypted bytes remain | Future V2-08 dry run / V2-12 deletion approval |
| UNREAD ciphertext | Only intended eligible mutual recipient | Yes, while active mutual and <7 days; never through source-room route | Future separate unread cleanup |
| Ack recovery capability | After first successful presentation only | Max 15m, not beyond original 7d, and blocked pair denied | Capability digest, no regenerated TTL |
| Safety case evidence | Never ordinary message route | Restricted independent report/evidence policy | V2-07/08 future legal/safety gates |
| Optional premium history | Not part of B1 | Bilateral prior consent + prospectively permitted, separately gated | V2-09 future |

**Tombstone:** Authorized LIVE pagination may emit only id, sequence and tombstone/status metadata for a currently active conversation after an approved ciphertext removal, never previous-room bodies; advancing a cursor is not permission to fetch ended D1 or random content.

## 3. Schema-owner / runtime isolation

- All new tables: ENABLE ROW LEVEL SECURITY; NO public grants or policies in B1. No BYPASSRLS runtime role. Do not claim live runtime RLS is verified.
- Existing disposable bridge_test is typically an owner/superuser, so owner-only tests are insufficient. In disposable PG16, establish a transaction-scoped synthetic nonowner role and narrowly grant SELECT solely to demonstrate RLS default deny; rollback that grant/role mutation in test fixture before exit.
- Do not issue GRANT/REVOKE to Neon, Render, existing roles or any deployed principal. Separate future G1 role audit must use explicit founder approval and redacted current_user/session_user privileges.
- Restrict B1 runner to the same strict loopback/DB/ack checks as existing V2-03; new numbered migration checksummed in bridge_schema_migrations only on disposable PG16. No live migrations or automatic PostgreSQL DDL.

## 4. Cryptographic envelope contract — synthetic tests only

**Encryption:** AES-256-GCM with a fresh 32-byte DEK per **independent** LIVE payload or UNREAD recipient copy, secure random 12-byte IV, and 16-byte tag. Wrap DEK with a distinct purpose-specific KEK and independent random 12-byte wrapping IV /16-byte tag. Key wrapping must authenticate the purpose and DEK identity and use a unique IV for a particular KEK version.

**Authenticated-data format (candidate v1):** Domain separator "bridge:v2:private:1"; exact number and order of fields, each as a big-endian length-prefixed UTF-8 byte string (not ambiguous concatenated JSON):
1. policy_version = "bridge-v2"
2. purpose = "live" or "unread"
3. message_id = canonical lowercase UUID
4. conversation_id = canonical lowercase UUID
5. sender_id = canonical lowercase UUID
6. recipient_id = canonical lowercase UUID for UNREAD; empty sentinel for LIVE
7. accepted_at = immutable UTC epoch milliseconds with strict integer canonicalization
8. payload_version = "1"

The **data AEAD** binds all eight fields, so ciphertext swapping across account/room/purpose/time must fail. The **DEK-wrap AEAD** binds the above bytes plus a separate purpose "wrap", KEK id and KEK version. Encode no untrusted keys, no arbitrary field order, and no plaintext content in AAD. Current session closure or retention_due_at is mutable and **not** AAD-bound.

**Key interface:** `testKeyProvider.getKek({purpose,keyId,version})` injected as an in-memory stub; throw on missing/retired key. This does **not** imply real cloud key isolation. No provider/network calls in B1. Use cryptographically secure randomBytes() for DEKs/nonces, never Math.random() or UUID as symmetric key. Protect against known nonce reuse for the same KEK with per-key counter or test-only uniqueness registry plus DB unique constraint; later B2 must review multi-node/key volume bounds.

**Failure semantics:** Reject altered ciphertext/tag/IV/AAD, invalid UTF-8, malformed metadata, wrong key scope and forbidden lengths; never return partial plaintext on auth failure. No debug logs or caught-error messages containing keys/bytes. Use separate signing keys for future cursors/recovery, never repurpose encryption KEK.

**Recovery boundary:** The exact tie-breaker min(first_ack + 15min, accepted_at + 7d) is still **proposed** and needs explicit founder confirmation before live API behavior; B1 crypto is unaffected.

## 5. Known integration dependencies and conscious omissions

- **B2 future**: trusted signed token -> server account; true adult/safety eligibility, two-way blocks and participant relation; lock ordering shared with V2-04A/V2-05A; V2-02 policy source; atomic accepted-clock/sequence/encrypt/outbox+UNREAD; idempotency conflict from authorized decryption rather than plaintext hash; no private event payload.
- **G1/V2-11 future**: old V1 /messages, /events, /peer, /connections, bootstrap, block/close/vote and every Android cache/backup/read path must be safe-denied or equivalently policy-gated for V2 IDs. Existing QA fixture remains under specific compatibility rules. After privacy cutover rollback safe-deny/forward fix only.
- **V2-07/V2-09 future**: safety snapshot retention and prospective two-party consented history need separate authorization and independent purpose/key scopes; this B1 schema is not free history or case evidence.
- **V2-08/V2-12 future**: no cleanup worker or purge triggered by B1. Backup/restore must eventually replay deletion ledger before serving restored ciphertext.
- **Public beta**: real adult assurance, safety response, legal review, independent security testing and V2-16 final 138-case What If? audit remain required.

## 6. Open implementation decisions — do not conceal

1. Exact cryptographic key wrapping strategy in the supported Node 22/OpenSSL environment: authenticated 256-bit KEK AES-GCM wrapping or standard AES Key Wrap, with independent purpose keys and well-defined AAD. **Proposed default here is AES-GCM wrapping** for consistent testing; founder reviews before B1b.
2. Production key storage/provider and cost are **not selected**; B1 uses ephemeral synthetic key material only.
3. Secure-unread state retention after physical ciphertext deletion: future deletion ledger/purge policy must not leave accessible stale recovery capabilities. No B1 actual delete.
4. Cross-table uniqueness of KEK wrapping IV: enforce distinct KEK purpose between LIVE and UNREAD plus unique in each table; production key lifecycle review required.
5. Compatibility with future case-evidence and history tables: B1 metadata primary key is new, so V2-07/V2-09 will require new purpose-specific references or additive linking; **do not repurpose existing legacy-message FKs**.
6. RLS policy grants and nonowner account context: no live role or policy implementation now.

## 7. Security/reference sources (for later reviewers)

- OWASP Cryptographic Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
- NIST SP 800-38D and NIST's announced revision: https://csrc.nist.gov/pubs/sp/800/38/d/final and https://csrc.nist.gov/News/2024/nist-to-revise-sp-80038d-gcm-and-gmac-modes
- Node crypto API AES-GCM AAD/tag handling: https://nodejs.org/api/crypto.html

**Exit:** B1a and B1b have separately approved exact file allowlists and test gates. Passing them yields only test-isolated schema and pure crypto readiness — never hosted V2 deployment approval.
