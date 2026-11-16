# Bridge V2-06B/B1 — Exact Disconnected Schema + Crypto Engineering Brief

**Status: DRAFT FOR FOUNDER REVIEW — B1 SOURCE/SQL IMPLEMENTATION NOT AUTHORIZED.**  
**Prepared:** 2026-11-16.  
**Verified source baseline:** \`main@e18fc51d3de8522eb8e77d81f8eb475c1794694b\`, after documentation-only [PR #28](https://github.com/rayadinaveen98-ship-it/bridge/pull/28) merged and [post-merge Foundation #43832937538](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43832937538) succeeded for both matching and PostgreSQL integration.  
**Authority:** [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md); [Architecture V2](ARCHITECTURE_V2.md); [V2-06B security architecture](V2_06B_INTEGRATION_SECURITY_BRIEF.md); [Threat Model](V2_06B_THREAT_MODEL.md); [V2-06A certified evidence](V2_06_EVIDENCE.md).  
**Working design:** Option A (separate V2-only encrypted storage) advanced for **planning only**, with no approved real key vendor, schema execution or source code.

## 1. Why B1 is separate from the tested V2-06A code

- \`bridge_messages.body\` is **TEXT NOT NULL** in \`0001_bridge_foundation.sql\`; it contains existing **synthetic V1 text** and cannot be made confidential by adding a bytea column.
- \`0005_v2_delivery.sql\` references \`bridge_messages\` for both live payloads and unread copies. Those tables **cannot** serve as independent V2-only message storage without a legacy row.
- V2-06A's \`apps/api/src/messaging/repository.mjs\` is **disconnected synthetic code only**; it persists a fixed dummy marker and unencrypted bytes on disposable \`bridge_test\`, never real user content. DO NOT change or relax its database guard to make it production-ready.
- The existing migration runner \`apps/api/tests/v2/migrations/runner.mjs\` applies/checks **0004–0007 only**. Its existing regression and GitHub Actions restore checks expect **four** ledger records and **34** \`bridge_%\` tables. B1 must preserve these checks, not rewrite a historical certification.

**B1 outcome:** Prove that an entirely new, non-destructive V2-only metadata/ciphertext/unread schema can coexist with V1 and that a standalone deterministic crypto codec can encrypt/decrypt synthetic messages with authenticated integrity. No HTTP, real message delivery or hosted keys.

## 2. Recommended PR division — founder approval required for each

### B1a — additive V2-only schema, disposable PostgreSQL 16 ONLY

**Branch candidate:** \`feature/bridge-v2-06b-b1a-disposable-secure-schema\`  
**Exact proposed changed-file allowlist (8 paths):**

1. \`database/migrations/0008_v2_secure_messaging.sql\` — NEW additive SQL only.
2. \`apps/api/tests/v2/private_messaging/migration_0008_runner.mjs\` — NEW 0008-only checksum/ledger runner with existing disposable guard and runtime DB identity verification.
3. \`apps/api/tests/v2/private_messaging/schema.test.mjs\` — NEW comprehensive schema/constraints/RLS/legacy-preservation tests.
4. \`apps/api/tests/v2/private_messaging/backup_restore.test.mjs\` — NEW *disposable* post-0008 dump/restore verifier; it may use child process/docker only in CI approved test environment, never hosted credentials.
5. \`apps/api/tests/v2/private_messaging/fixtures.mjs\` — NEW synthetic-only fixtures and before/after SHA-256 manifest.
6. \`apps/api/package.json\` — ADD only \`test:v2:private-schema\` script; no runtime start or deps.
7. \`.github/workflows/foundation.yml\` — ADD **after all existing PG steps**, one separate B1a disposable-PG16 schema+backup test step; preserve prior tests, migration count=4/total tables=34 checks **as-is**.
8. \`docs/engineering/V2_06B_B1_EVIDENCE.md\` — NEW traceability and negative-result register.

**Implementation design constraint:** \`0008\` does not appear in old \`tests/v2/migrations/runner.mjs\`; the B1a **separate runner** applies 0008 after existing 0004–0007 tests and records checksum version \`0008\`. It refuses any address except explicitly acknowledged loopback \`bridge_test\`; uses a single transaction for SQL+receipt, supports hash-verified reapplication and rollback on injected failure. Never issue Neon or Render queries; no connection to \`BRIDGE_DATABASE_URL\`. Verify named SQL file on disk exactly once, reject modified checksum. The official unified, live migration workflow would be reviewed **later**, before a real deployment.

**SQL scope:** New \`bridge_v2_secure_messages\`, \`bridge_v2_secure_live\`, \`bridge_v2_secure_unread\` tables and their indexes/constraints, \`ENABLE ROW LEVEL SECURITY\`; no stored routines/triggers for live expiry, no real RLS app-role policy/grants or case-evidence backfill. Detailed proposed columns and invariant checks appear in [B1 Schema/Crypto Contract](V2_06B_B1_SCHEMA_CRYPTO_CONTRACT.md). At this stage PostgreSQL **tests** operate using only synthetic identities and private fixture text.

### B1b — disconnected authenticated cryptography and key-contract tests

**Branch candidate:** \`feature/bridge-v2-06b-b1b-disconnected-aead\`  
**Start only after B1a source/CI independently approved and verified. Exact proposed changed-file allowlist (7 paths):**

1. \`apps/api/src/messaging/private_crypto.mjs\` — NEW pure authenticated-encryption codec, **NOT imported** from current server entry point.
2. \`apps/api/src/messaging/private_key_contract.mjs\` — NEW in-memory purpose-specific key interface and strict AAD codec, no real key provider.
3. \`apps/api/tests/v2/private_messaging/crypto.test.mjs\` — NEW synthetic test-only crypto vectors, tamper, nonce, wrong key, metadata/scope failure.
4. \`apps/api/tests/v2/private_messaging/key_contract.test.mjs\` — NEW simulated key version/rotation/key absence, non-export/no-log behavior checks.
5. \`apps/api/package.json\` — ADD only \`test:v2:private-crypto\` script, no dependencies/start change.
6. \`.github/workflows/foundation.yml\` — ADD pure crypto test step; retain B1a and all older suites.
7. \`docs/engineering/V2_06B_B1_EVIDENCE.md\` — UPDATE exact head/CI and boundary.

**No B1a code edits during B1b without separate scope amendment.** Keys and plaintext in B1b are synthetic ephemeral in-memory material only; do not connect to any app endpoint, Neon, Render, Android or billing. No KMS subscription is approved or needed for this test-only stage.

## 3. Clear controls for B1 SQL

- **No legacy mutation:** \`0008\` must have only CREATE TABLE/INDEX and ENABLE RLS for its own new tables. No DROP, TRUNCATE, DELETE, UPDATE, ALTER existing 0001–0007 tables, grant to PUBLIC, data migration/backfill, stored bodies, sweeper, trigger or expiry job.
- **Metadata source:** Message rows reference *existing* V2-marked \`bridge_conversations\` and composite \`bridge_conversation_participants\`; no foreign key to \`bridge_messages\`. Application authorization against kind/role, membership, active relation, blocks and time remains a **future B2 requirement**.
- **Independent scopes:** LIVE ciphertext and recipient UNREAD encrypted copy store distinct per-item protected data. LIVE state/clock is not used to authorize an UNREAD envelope after segment closure. Neither is prospective premium history or safety evidence.
- **DB guard:** \`bridge_test\` + loopback + role \`bridge_test\` + explicit \`disposable-bridge_test-only\` ack; confirm actual DB name/user/server, no extra DSN options; refuse all cloud hosts.
- **RLS:** Enable on all three new tables, no grants/policies to public or hosted app. A synthetic non-owner role with temporarily granted SELECT inside a rolled-back disposable transaction must see zero rows with no policy. Note: test owner privileges/BYPASSRLS mean RLS must be assessed separately under runtime principal in G1.
- **Preserve QA:** Hashed four-message/one-room/two-slot synthetic fixture before and after B1a 0008 apply, forced rollback, reapply and restore; no live Neon fixture reads.
- **Retention:** No physical deletion, no worker. Proposed expires_at fields do not implement purge or lawful retention. Unread hard cap 7 days; LIVE expiry field is policy-bound and cannot itself create free history.

## 4. Clear controls for B1 cryptography

- Proposed primary primitive: Node built-in \`crypto\` **AES-256-GCM** authenticated encryption, 32-byte DEK, **96-bit unique IV per key**, **128-bit authentication tag**. Invoke \`cipher.setAAD\` before encryption and verify \`decipher.final()\` on decryption. Use Node 22 in CI, matching the API package engine.
- Generate a fresh **CSPRNG-derived DEK** for each LIVE ciphertext and a **different fresh DEK** for each recipient UNREAD copy; do not reuse a message DEK or nonce across scopes. DEKs are wrapped under **distinct purpose-scoped test KEKs** with authenticated encryption. Encryption keys, cursor HMAC keys and recovery token keys are purpose-separated.
- AAD must use deterministic, versioned, *length-prefixed* byte encoding binding policy version, storage purpose (LIVE/UNREAD), message ID, conversation ID, sender ID, recipient ID when unread, immutable accepted-at timestamp, payload format version. Never ambiguously concatenate strings or silently default a missing field.
- Persist in later design only ciphertext + IV + auth tag + wrapped DEK + separate wrap IV/tag + key ID/version and necessary identity/retention metadata; never plaintext or an unkeyed plaintext hash. Key material never in source, CI output, URL, DB or client.
- Fail closed if AAD differs, tag/ciphertext is altered, key version absent, ID/recipient/scope changed, ciphertext empty, nonce malformed, auth tag incomplete or payload too large.
- **No production KMS or real keys in B1b.** An ephemeral in-memory test keyring and failure-injection provider stub are enough. Actual KEK custody, operations, rotation, backup restore and spending approval belong to future B2/G1; do not infer provider support from local codec tests.
- 7-day unread, 15-minute ack recovery and 30-minute inactivity are approved **business windows**, but the exact \`min(first_ack+15min, accepted+7d)\` overlap is a **proposed tie-breaker awaiting founder confirmation**. No new runtime delivery token logic is authorized by B1.

Authoritative design aids: OWASP Cryptographic Storage Cheat Sheet; NIST SP 800-38D GCM (watch ongoing revision); Node.js \`crypto\` documentation. Security review must not claim cryptographic validation or FIPS certification.

## 5. B1a acceptance criteria — proposed, NOT YET TESTED

| ID | Mandatory acceptance |
|---|---|
| S08-01 | 0008 applied ONLY to explicitly acknowledged local disposable PG16 database and records exact checksum receipt |
| S08-02 | First apply creates exactly three new tables; 34 -> **37** \`bridge_%\` tables after 0008 (existing four-check suite still sees 34 beforehand) |
| S08-03 | Reapply same checksum is idempotent no-op; modified checksum rejected before DDL |
| S08-04 | Injected failure before ledger insert rolls back **all** of 0008, not half a schema |
| S08-05 | Existing 0001–0007 objects and \`bridge_messages.body NOT NULL\` remain unchanged |
| S08-06 | Existing 4-message/1-room/2-slot synthetic fixture SHA preserved across apply, rollback and reapply |
| S08-07 | New message ID, client ID and per-room sequence unique; sender must be a participant by composite FK |
| S08-08 | Secure-live row bound 1-to-1 with secure-message; missing/invalid FK rejected |
| S08-09 | Unread one recipient per message, relation/account/message references valid; outsider/duplicate invalid rows denied |
| S08-10 | Seven-day accepted-to-expiry maximum enforced by PG CHECK; malformed ack and state rejected |
| S08-11 | AEAD structural fields (12-byte IV,16-byte tag, nonempty ciphertext, key/version) constrained at SQL level; structural checks do not prove actual encryption |
| S08-12 | RLS flags ON on three new tables; no public grants/DB policies; non-owner default-deny verified under disposable role |
| S08-13 | New indexes support current room sequence, recipient unread lookup and expired payload inspection without unbounded history endpoint |
| S08-14 | After migration, disposable PG16 dump+restore yields same three new tables, constraints/indexes and legacy fixture hashes |
| S08-15 | Refuse Neon/nonloopback/invalid ack and wrong database principal before ANY DDL, and no hosted connection string read |
| S08-16 | Original V1/V2-01..06A matching/HTTP/security/PG16/rehearsal/backup suite green; only eight approved B1a paths |

**No fixture should contain actual user messages. No migration run should use a real Render/Neon secret.**

## 6. B1b acceptance criteria — proposed, NOT YET TESTED

| ID | Mandatory acceptance |
|---|---|
| C08-01 | AES-256-GCM test vector roundtrip with strict 16-byte authentication tag and 12-byte IV |
| C08-02 | Same normalized UTF-8 test plaintext safely roundtrips without being stored in a legacy column |
| C08-03 | Ciphertext tampering and tag alteration reliably reject |
| C08-04 | Wrong AAD field, scope, room, sender, recipient, policy version or accepted-at rejects |
| C08-05 | Wrong/missing key, version or key purpose denies without returning any plaintext |
| C08-06 | Different LIVE and UNREAD copies use distinct DEKs and nonces |
| C08-07 | Key wrapping/unwrapping uses independent KEK, distinct purpose-AAD, nonce and integrity tag |
| C08-08 | Reused wrap nonce or invalid nonce size rejected by key-contract guard (not merely assumed improbable) |
| C08-09 | CSPRNG random nonce generator and safe per-key volume/rotation plan documented and testable |
| C08-10 | Deterministic length-prefixed AAD codec rejects ambiguity, empty required values and illegal versions |
| C08-11 | Cryptographic integrity fails if encrypted data is relabeled to another message/recipient/scope |
| C08-12 | Missing/retired-version provider simulation fail-closes; key ID is metadata, never key bytes |
| C08-13 | Encrypt/decrypt input validation: malformed UTF-8, empty/oversized message, invalid Buffer/tag |
| C08-14 | No private keys, IV fixtures or plaintext appear in errors, structured logs, outbox or committed sources |
| C08-15 | Keyed/encrypted operations have no imports from hosted start/http/postgres or Android; no real keys or cloud calls |
| C08-16 | In-memory key separation for payload/wrap/cursor/recovery; no fallback to hardcoded production key |
| C08-17 | Key loss/simulated interrupted rotation has explicit tested denial semantics; no re-encryption of live data |
| C08-18 | Named pure crypto and existing B1a/database/legacy suites all pass at exact final PR head |
| C08-19 | Original V2-06A synthetic adapter remains unchanged and disconnected |
| C08-20 | Only seven approved B1b paths; post-merge main CI verification documented separately |

**Test gate:** Individual named test reports with exact assertion count, all CI jobs and exact SHA, not only a green aggregate. Run a security review that considers Node version compatibility, AEAD assumptions, AAD encoding and key lifecycle. B1a/B1b may be merged as **INACTIVE TEST-ONLY** after passing exact gates, but implementation and merging require separate founder approval. Their success never authorizes B2 or a live migration.

## 7. PR gates, risks, rollback and exclusions

**Before B1a:** founder explicitly authorizes exact eight-path code/SQL/test scope, CI costs (existing free workflow only), no live deploy, and detailed SQL file review. New migration only in source + disposable PG16; never apply 0008 to Neon.

**Before B1b:** verify B1a evidence and obtain separate founder approval of exact seven-path pure crypto/test scope, no third-party crypto packages/subscriptions and no real key source.

**Critical risks:** new table schema wrongly links to legacy \`bridge_messages\`; accidental runtime import of test adapter; test runner reaching cloud credentials; weak nonce/key design; misleading “encryption implemented” claims; RLS tests under owner-only role; lost-message semantics if future protected DB writes aren't atomic; compatibility of new schema with later V2-07 safety evidence and V2-09 consensual history. Keep integration in B2.

**Rollback:** B1a schema on disposable database discarded with test container; code PR revert only. B1b pure-source/test code revert only. No hosted rollback or live DDL reversal because none should occur. Future live DDL cannot be dropped without independent data-loss review.

**STOP RULES:** unexpected source files, failed legacy manifest, empty/insecure key material, unsatisfied negative crypto test, RLS exposure, contact with real Neon/Render, or any attempted migration/role change without distinct approval. Do not merge if exact final head CI fails.

**Still NOT covered:** authenticated HTTP actor mapping, app runtime principal/RLS, actual message-body encryption in hosted service, double-write migration, safe v1 reader cutover, free Android unread UI, retention purge, moderator/safety evidence, public adult verification, physical R0/G2 and final V2-16 What If? audit.

## Founder gate

**Proposed for next founder approval:** (1) approve **B1a only** on the eight exact allowlisted paths, new \`0008\` applied only to disposable PG16, no legacy changes; (2) request evidence/CI and separate approval before B1b crypto tests. B1b is **planned, not automatically authorized**. No Neon/Render/Android, live messaging, retention, billing or public beta.
