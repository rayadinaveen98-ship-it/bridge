# Bridge B3c-2R2 — actual V2 0008 schema / PG18 restricted-actor proof

**Status:** FOUNDER APPROVED FOR DISPOSABLE PROOF ONLY; PROPOSED TEST PACKAGE / no live activation.  
**Baseline:** `main@2fd4ec5a0303c260284e38ad6fdfa059cc950508` (B3c-2R closed).  
**Security boundary:** the actual Render runtime owner/BYPASSRLS remains **HOLD_V2**; this stage neither remedies nor deploys it.

## Scope and purpose

The prior B3c-2R role tests proved five synthetic role classes on generated canary tables. This distinct B3c-2R2 adds the **actual existing checked-in 0001–0008 SQL migration chain** on a fresh, attested **disposable PostgreSQL 18** GitHub Actions service. It uses the real `bridge_v2_secure_messages`, `bridge_v2_secure_live` and `bridge_v2_secure_unread` tables with nonowner SELECT+INSERT privileges and **temporary, non-production RLS policies**. These policies exist ONLY in the throwaway CI database. All messages are synthetic; BYTEA shapes are **NOT encrypted** and must never be marketed as confidentiality.

### Trust experiment (not product implementation)

1. Generate a fresh ephemeral **RS256 test JWT** using Bridge's existing `verifyBearer` for validation. A test-only internal application helper derives the actor UUID from `b3b-disposable:<uuid>`; no caller-submitted arbitrary actor ID is accepted. No endpoint.
2. In the same independent nonowner LOGIN transaction, collect the PG18 transaction ID and sign the test actor, expiry and `session_user` using an **ephemeral test-only HMAC key**. The key is stored in a restricted, generated, private schema owned by a separate non-superuser test principal. It is not a production key custodian.
3. Test-only RLS policies require a fixed-search-path, nonowner-owned `SECURITY DEFINER` verifier to authenticate the signed, transaction-scoped claim. Its sole use of elevated rights is to read this private synthetic key; it cannot read application messages. PUBLIC EXECUTE is revoked within the same creation transaction; only the test app login can invoke it.
4. Prove with real 0008 tables: allowed sender-only metadata/LIVE and recipient-only UNREAD; no cross-user SELECT, impersonated INSERT or forged/expired/replayed GUC access. Runtime cannot read `bridge_messages.body`, accounts, case evidence or the signing key and cannot `SET ROLE` to an owner.
5. Verify five migration receipts, 37 public `bridge_*` tables, original RLS flags and schema FK/CHECK behavior; guarantee teardown of temporary policy/grants/schema/roles in the destroyed CI service.

**Critical caveat:** a signed session GUC is useful for a *threat-modelled prototype*, not self-proving production user identity. The privileged signer is part of the trusted application boundary; compromised server secrets and signed-context theft/reuse during the same transaction are outside this test. The verifier is a review target for function privilege escalation, SQL injection, transaction retry and pooling. HMAC equality, token expiry rechecks and account/Block writer synchronization are NOT production certified. Do not copy these policies/funcs into Neon.

## Strict controls

- Exactly one GitHub Actions `postgres:18` service on a fresh `bridge_privproof` database, loopback `127.0.0.1:5432`, fixed non-secret disposable admin credential, `CI=true` and `GITHUB_ACTIONS=true`, separate `BRIDGE_B3C2R2_ACK`. Before any DDL, assert the DB/login/PG18 version, superuser fixture, and the immutable system identifier matching the single isolated Docker service. Remote, alternate credentials, SSL parameter or wrong ACK fail **before connecting**.
- Existing migrations 0001–0008 are read directly from the repository and applied in test transactions. No original SQL or migration runner changed. Existing Foundation PG16 jobs and B3c-2R PG16/18 role matrix remain intact.
- Clean up generated RLS policies, grants, private function, schema and roles explicitly; fail on residues. CI service is disposed independently after jobs.
- No real tenant records, hosted credentials, Neon, Render, Android, R0 testers, billing, API routes, backups or physical deletion in scope.

## Remaining separate approvals / release gates

- Actor eligibility, participant membership, Block/unblock and account writer races enforced *atomically* under a nonowner V2 API transaction, with real durable key custody and strict role grants on all referenced tables.
- Production-suitable trust-boundary review without privilege escalation or arbitrary actor-context changes; transaction time/expiry, pooled-session cleanup, replay and SQL injection adversarial tests.
- Separate founder authorization for any Neon DDL/role/grant, Render runtime credential/env/deploy, old-client cutover or paid key provider. **HOLD V2 remains in effect.**
- R0 real phone/tablet acceptance open. B3c-3 durable key-provider selection, V2-07..16 and final 138-case What If? are later stages.

**Implementation allowlist (exactly seven files):** two NEW test/fixture files under `apps/api/tests/v2/privileges/b3c2r2_*`, one additive package script, one NEW GitHub Actions PG18 workflow, NEW design/evidence documents and an APPEND-only `docs/ROADMAP.md`. No `apps/api/src/**` or `database/migrations/**` changes.
