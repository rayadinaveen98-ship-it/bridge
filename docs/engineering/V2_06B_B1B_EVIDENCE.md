# Bridge V2-06B/B1b — Disconnected AEAD and In-Memory Key Evidence

**Current status: B1b IMPLEMENTED ON ISOLATED FEATURE BRANCH; FIRST CI, MERGE AND POST-MERGE VERIFICATION PENDING.**
**Authorization:** only the exact seven B1b paths named in [V2-06B/B1 Implementation Brief](V2_06B_B1_IMPLEMENTATION_BRIEF.md), [B1 Schema/Crypto Contract](V2_06B_B1_SCHEMA_CRYPTO_CONTRACT.md) and [B1a verified evidence](V2_06B_B1_EVIDENCE.md). No B2, live encryption, customer messages or deployment.
**Source baseline:** main@eb7419407693573d9c36d0cd7c831d8cdd599618 after B1a [PR #30](https://github.com/rayadinaveen98-ship-it/bridge/pull/30), independent V2-06A test-only [PR #31](https://github.com/rayadinaveen98-ship-it/bridge/pull/31) and docs [PR #32](https://github.com/rayadinaveen98-ship-it/bridge/pull/32). [Main CI #43837799189](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43837799189) SUCCESS in both matching and PG16 integration.

## Exact changed-file allowlist

1. apps/api/src/messaging/private_crypto.mjs — NEW disconnected Node crypto AES-256-GCM codec.
2. apps/api/src/messaging/private_key_contract.mjs — NEW typed versioned AAD encoder, ephemeral synthetic KEK provider and in-process wrap nonce registry.
3. apps/api/tests/v2/private_messaging/crypto.test.mjs — NEW pure crypto vectors, tamper, metadata- and purpose-binding, UTF-8 input tests.
4. apps/api/tests/v2/private_messaging/key_contract.test.mjs — NEW canonical AAD, test-only nonce guard, key separation/rotation/absence tests.
5. apps/api/package.json — ADD only named pure script test:v2:private-crypto, unchanged runtime/start/dependencies.
6. .github/workflows/foundation.yml — ADD only named matching job pure test step; existing PG16 B1a and all other steps preserved.
7. docs/engineering/V2_06B_B1B_EVIDENCE.md — THIS evidence, no roadmap expansion or live authorization.

**Strict exclusions:** No edits to migration SQL 0001–0008; old V1 API/HTTP/PostgreSQL/auth/SSE/outbox/start, policy, previous V2-04A/V2-05A/V2-06A/B1a source or tests, Android/Flutter, Render, Neon schema/roles/data, real data/keys, cloud KMS, paid packages, billing, retention delete, full R0 acceptance, B2/B3/other stages.

## Actual implemented contract and limitations

- **Auth-only synthetic content protection:** fresh CSPRNG 32-byte data encryption key (DEK) per single LIVE or UNREAD item. AES-256-GCM, 96-bit data IV, 128-bit integrity tag; versioned canonical **length-prefixed AAD** binds scope, policy, room, sender, recipient (UNREAD only), message ID, server-normalized epoch milliseconds and payload version. No ambiguous concatenated JSON.
- **Independent wrapped key:** generated per-item DEK is wrapped using an injected purpose-specific 32-byte **test KEK**, separate CSPRNG 96-bit wrap IV and 128-bit tag. Wrap AAD binds domain + original immutable data AAD + purpose + key identity/version. The DEK/key buffers and canonical plaintext bytes are zeroed in finally; the caller's original JS string cannot be zeroed and is never persisted here.
- **No real KMS/provider:** a manually populated in-memory keyring refuses missing, retired, invalid or purpose-reused KEKs. No hardcoded/default production key, env, filesystem persistence or cloud requests. The ephemeral nonce registry detects **same-process reused KEK-wrap IV** and rejects malformed IV. This is NOT a durable cross-process uniqueness guarantee or production rotation/storage solution. Production key custody, audit, backups, compromise, replay and global nonce safety require future review.
- **Strict validate/decrypt:** bytea data shape/length and suite/AAD version, canonical UUIDs/time, NFC UTF-8, bad tag, wrong room/actor/recipient/scope, key mismatch, malformed payload and invalid version all fail closed with generic private_crypto_unavailable error. No partial bytes or OpenSSL error details in result.
- **The actual service remains UNCHANGED:** module is not imported by apps/api/src/start.mjs, http.mjs, postgres.mjs or Android; no real key material, Postgres ciphertext write, decryption endpoint, network request or ordinary chat processing is activated. The existing B1a bytea structural tables and test fixtures are NOT retroactively encrypted.

**Not end-to-end encrypted:** Bridge server code could decrypt payloads in a future authorized runtime. B1b alone is not an audited production crypto subsystem, security certification, privacy cutover or user-facing encrypted messaging.

## Test traceability — PROPOSED until exact CI verified

| Criterion | Coverage candidate |
|---|---|
| C08-01,02 | NIST AES-256-GCM test vector, tagged synthetic roundtrip and canonical multilingual UTF-8 |
| C08-03,04,05 | AEAD ciphertext/tag/wrap/IV tamper, wrong AAD/purpose/room/sender/recipient/timestamp, key version/provider denial |
| C08-06,07 | independent LIVE vs UNREAD DEKs/IVs/purpose KEKs; wrap AAD domain separation |
| C08-08,09,10 | same-process nonce reuse rejection, 12/16 shape and random source, unambiguous canonical AAD and timestamp precision |
| C08-11,12,13 | encrypted item can't be relabelled; missing/retired keys, invalid UTF-8, invalid Buffer, too-large/empty content denial |
| C08-14,15,16 | no plaintext or keys in returned record/error; static runtime import exclusions, test-only separated provider |
| C08-17,18,19 | rotation/removal/key-loss fail-closed; named script; previous B1a and V2-06A test source unchanged |
| C08-20 | exact seven-file diff, matching + PG16 PR-head and post-merge main CI — PENDING |

**CI gate:** Both matching (new pure tests + all old matching/HTTP/policy/V2 suites) and postgres-integration (old V1/V2 + B1a schema/PG16 restore) must complete SUCCESS on the **exact final PR head**. Inspect named test counts and failure output; avoid inventing assertion counts. Verify exact seven-path diff. If any fails, repair inside allowlist or mark blocker, **DO NOT MERGE**. On approved and verified merge, separately confirm both main-branch jobs and record exact SHA/run.

## Remaining product/release blockers

- B2 trusted actor/peer, adult/safety eligibility and DB role/RLS integration, production confidential store adapter, atomic accepted-clock + outbox and 7-day recipient unread remains separately approved.
- Real key/KEK custody, multi-node uniqueness, rotation/restoration, permission boundaries, incident response and third-party security review remain unresolved. No paid providers or subscriptions approved.
- Old /v1/.../messages and all legacy Android surfaces must receive safe version/deny policy at G1/V2-11 before activating V2. Never roll back to unrestricted history replay.
- R0 physical phone/tablet acceptance OPEN. No real-user beta; no legal/moderator/identity gates passed. Comprehensive 138-case What If? review remains V2-16.
- Rollback B1b: revert the disconnected source+tests PR; no cloud migration or real user data rollback exists because none were touched.
