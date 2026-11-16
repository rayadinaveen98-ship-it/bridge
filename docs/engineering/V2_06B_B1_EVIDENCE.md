# Bridge V2-06B/B1a — Additive 0008 Secure-Schema Evidence

**Status: IMPLEMENTED ON ISOLATED BRANCH; CODE-HEAD CI VERIFIED; MERGE / POST-MERGE CI PENDING.**
**Authority:** [B1 implementation brief](V2_06B_B1_IMPLEMENTATION_BRIEF.md) + [schema/crypto contract](V2_06B_B1_SCHEMA_CRYPTO_CONTRACT.md); limited to B1a only. This is **NOT** B1b encryption implementation, B2 backend integration, Neon schema change, Render deployment, Android, retention or public beta.

## Baseline and exact scope

- B1 documentation [PR #29](https://github.com/rayadinaveen98-ship-it/bridge/pull/29) merged main@**2dbc96104b1195ff1c2f72d2bbd12c427866424b**. [Post-merge Foundation #43834790126](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43834790126): matching + postgres-integration SUCCESS.
- B1a adds **0008 only** to source as a new migration. The source never auto-runs in hosted server startup. The migration test runner is a separate deliberately restricted disposable-only entry point, not an amendment to the 0004–0007 certified runner.
- Existing CI runs V2-03 migration rehearsal and its **four-ledger/34-table** backup restore, V1 services and all V2-01–06A suites BEFORE new B1a tests, so it cannot silently invalidate previously certified source/baseline expectations.
- B1a runner requires exact loopback `postgresql://bridge_test:...@127.0.0.1:5432/bridge_test` or compatible localhost URI, explicit `disposable-bridge_test-only` acknowledgment, and checks actual DB/current_user/server address before DDL. It records/validates the 0008 SHA-256 in the disposable bridge_schema_migrations ledger within the same transaction.
- New tables: `bridge_v2_secure_messages` (immutable V2 metadata + author participant composite FK, unique sequence/idempotency), `bridge_v2_secure_live` (1:1 structurally valid AEAD *shaped* bytes), `bridge_v2_secure_unread` (message+recipient unique, hard <=7d expiry and ack/token checks). All ENABLE RLS with NO app grants or policies; a temporarily granted synthetic nonowner must see zero rows. No message body/plaintext or real crypto key source.
- *Important:* synthetic test bytea is **not encryption**. Real AES-256-GCM, key custody, rotation, AAD and actual confidentiality are future separately approved B1b/B2 gates. A FK on recipient cannot prove bilateral authorization; future B2 must enforce actor/relationship/direct-room/Block in a locked transaction.

## Exact eight permitted paths

1. `database/migrations/0008_v2_secure_messaging.sql` — NEW.
2. `apps/api/tests/v2/private_messaging/migration_0008_runner.mjs` — NEW.
3. `apps/api/tests/v2/private_messaging/schema.test.mjs` — NEW.
4. `apps/api/tests/v2/private_messaging/backup_restore.test.mjs` — NEW.
5. `apps/api/tests/v2/private_messaging/fixtures.mjs` — NEW synthetic only.
6. `apps/api/package.json` — named test-only runner.
7. `.github/workflows/foundation.yml` — appended disposable PG16 step after all previous checks.
8. `docs/engineering/V2_06B_B1_EVIDENCE.md` — this evidence.

No changes to 0001–0007, existing V1/V2-01..06A Node source/test files or Android/Render/Neon.

## S08 candidate acceptance — must not claim PASS until CI

| Test | Proposed behavior | Evidence source |
|---|---|---|
| S08-01 | guarded 0008 transaction, SHA-256 ledger receipt | schema.test / migration_0008_runner |
| S08-02 | 34 -> 37 `bridge_%` tables only after 0008 | schema.test |
| S08-03 | idempotent checksum reapply, altered checksum denial | schema.test |
| S08-04 | forced transaction rollback removes all 0008 objects | schema.test |
| S08-05 | original body NOT NULL; no old schema mutation | schema.test + prior migration suite |
| S08-06 | four-message, one-room and two-slot SHA manifest unchanged | schema.test, backup_restore |
| S08-07 | participant composite FK and unique current-room message sequence/idempotency | schema.test |
| S08-08 | live ciphertext structural shape and 1:1 FK | schema.test |
| S08-09 | unread reference FK and UNIQUE(message,recipient); B2 membership not claimed | schema.test |
| S08-10 | <=7d unread TTL, ack-state/timestamp and digest checks | schema.test |
| S08-11 | invalid AEAD structure lengths/suite/KEK version rejected | schema.test (NOT actual encryption verification) |
| S08-12 | RLS on, no public grants/policies; nonowner default deny and role rolled back | schema.test |
| S08-13 | metadata sequence, inbox and deferred-retention indexes | schema.test |
| S08-14 | PG16 full dump/restore and SHA of both legacy and synthetic V2 data | backup_restore.test |
| S08-15 | cloud host, wrong DB, missing ack rejected before DB connection | schema.test |
| S08-16 | all existing V1, V2-01–06A and previous PG16 migration/restore checks still PASS | Foundation CI |

**No automatic merge:** inspect failed tests, negative authorization assertions, SQL constraints and allowed path diff. Record exact final PR SHA/CI, and after a separately authorized merge record matching main SHA/post-merge jobs. Any failed safety test blocks merge.

## Exclusions, rollback, open gates

- NO actual user body encryption or decryption, no new runtime code imported into apps/api/src/start.mjs, http.mjs, postgres.mjs or old API; no live model change, cloud migration, keys/roles, paid provider or Android.
- **Rollback:** revert B1a PR and discard its disposable PG16 service. No rollback of live schema/data is required because none may be touched.
- R0 physical phone/tablet acceptance remains OPEN. B1b real test-only crypto and its separate approval remain pending. V2-07 report evidence, V2-11 old-client privacy-safe cutover and final V2-16 138-case What If? audit remain independently gated.


## B1a initial PR code-head CI certification (2026-11-16)

- **Source head tested:** d812c15253e23d668efd2d8ba345a0c4fb5edd1a. [PR Foundation #43836163547](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43836163547): BOTH matching and postgres-integration SUCCESS. [Same-commit branch push Foundation #43836030130](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43836030130): BOTH SUCCESS.
- **Actual test TAP result:** New B1a schema test file reports **16/16 Node tests passed**, zero failures/skips; synthetic PG16 backup-and-restore test file reports **2/2 Node tests passed**, zero failures/skips. These counts include the parent test wrapper; they must not be misrepresented as eighteen independent requirement IDs. S08-01–16 acceptance requirements are mapped to multiple nested test assertions plus the existing V1/V2 suites.
- Disposable PG16 steps confirmed expected pre-B1a **34 tables / 4 migration ledger** and post-0008 **37 tables / 5 ledger entries**; checksum reapply and forced transaction rollback, original four-message/room/two-slot SHA preservation, composite FK/sequence uniqueness, seven-day cap/ack/check structural validation, RLS default-deny under transient nonowner, and full-format PG16 dump/restore comparing both legacy and synthetic V2 fixture hashes.
- Scope verified against draft PR #30: **exactly eight paths**, identical to the allowlist above, with **NO** source changes to current HTTP/PG/auth, old migrations 0001–0007, V2-04A/V2-05A/V2-06A source, Android or real cloud deployment.
- **Important non-claims:** Test crypto-shaped ciphertext bytea is **not encrypted**; no actual AES-GCM codec, key wrapping/key custody, confidential delivery, real runtime RLS role/policies or recipient-pair authorization has been implemented. The schema intentionally lacks active production grants and policies. The B2 trusted adapter and B1b crypto are separate founder decisions.
- **Approval gate:** Update of this evidence creates a NEW PR head, so both matching and postgres-integration must pass again on the exact final head before merge. After merge, independently verify the matching/postgres jobs on exact merge SHA and record their evidence; if any CI fails, do not claim stage closed.
