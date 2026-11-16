# Bridge B3c-2R — Least-privilege role design and non-destructive transition

**Stage status:** FOUNDER-APPROVED for architecture, documentation and disposable PostgreSQL 16/18 testing only. **Candidate role design; NOT approved for hosted application.**  
**Baseline:** main at `ad01d815ef1cd407ba50cb0b15df68412abf6b8e` (B3c-2 hosted audit), 17 November 2026.  
**Related:** `V2_06B_B3C_SECURITY_READINESS_BRIEF.md`, `V2_06B_B3C_ROLE_KEY_COST_MATRIX.md`, B3c-1 PG16 evidence, and the founder's PRIVATE hosted security certificate.

## Verified risk and explicit limitations

B3c-2 ran on an actual Render application pool checkout and returned a redacted `HOLD_V2`: the connected account bypasses RLS, can create roles/databases and owns Bridge tables (not a superuser). Hosted V2 tables do not exist. The diagnostic was disabled again; latest QA deployment was live. This is a **release blocker**, not evidence of a breach. No keys, user messages or secret values belong in this public repository.

Existing B3b-2 transaction tests prove synthetic business authorization under a disposable owner, and B3c-1 proves default-deny nonowner RLS under disposable PG16. **Neither demonstrates a production-safe authorized nonowner V2 path**. This B3c-2R experiment tests privilege boundaries with harmless canary tables. It does **not** test actual 0008 migrations on PostgreSQL 18, actual application row-level actor authentication, or hosted data migrations.

## Candidate separation of duties

| Candidate principal | Intended positive authority, AFTER future review | Explicit negative authority |
|---|---|---|
| `bridge_schema_migrator` | Schema ownership and reviewed, windowed DDL | Never used by normal HTTP pool |
| `bridge_v1_runtime` | V1-only operations for existing QA during a staged transition | No V2 secure ciphertext, case evidence or grants via V2 pool |
| `bridge_v2_runtime` | Explicit transaction-scoped authorized V2 current/unread operations | No SUPERUSER, BYPASSRLS, role creation, table ownership, schema DDL, historical V1 body, unrestricted ciphertext |
| `bridge_case_reviewer` | Case-scoped, audited evidence access in a later approved implementation | No ordinary free message history or V1/ V2 arbitrary reads |
| `bridge_retention_worker` | Approved expiry/delete manifests with legal-hold gating in a later phase | No unrestricted SELECT, no schema DDL, no unauthorized physical purge |

The actual test creates generated independent non-superuser LOGIN credentials for five canary roles, not these production names. OWNER, V1, V2, REVIEWER and RETENTION model distinct credentials and deny-by-default access. Migration role owns the canary tables; no production schema or permissions change. PostgreSQL 16 and 18 are checked in separate isolated GitHub Actions Docker services.

## Authorization policy still requires a design decision

**Do not add a `USING (true)` policy to make B3b-2 work.** A fixed `current_user` from one shared API pool is not an end-user identity. Untrusted `SET LOCAL bridge.actor_id` or `set_config` can be forged by a compromised SQL execution context. A SECURITY DEFINER function or owner-rights view can inadvertently bypass RLS. The matrix's explicit `id=1` canary SELECT policy merely demonstrates one-row RLS scope; it is **not an acceptable product policy**.

Before a future hosted V2 runtime is authorized, prepare a separately reviewed, signed-actor-to-current-transaction trust boundary, deny-safe pool checkout, safe search_path, explicit command/table permissions, independent negative tests for cross-actor ciphertext access, and no privilege escalation through views/functions. Keep legacy V1 read/write/stream firewall G1/V2-11 before exposing any V2 conversation IDs.

## Non-destructive migration and recovery proposal (NOT IMPLEMENTED)

1. **Preflight:** verify actual 0008/legacy schema, role ownership, grants, migrations, pool identities, secrets, connected client/version inventory and immutable recovery point. Snapshot redacted metadata, never copy actual QA records into the test harness.
2. **Staged credentials:** after separate approval create nonowner role(s) with no BYPASSRLS/DDL and explicit least-privilege grants; do not revoke V1 live rights first. Rotate credentials only in a controlled operation with rollback.
3. **Prove application authorization:** test V2 signed-actor, same-client locks, RLS policies and data boundaries using real PostgreSQL 18 disposable migrations and a nonowner pool. Fail closed on missing policy or inappropriate grant. No broad SELECT across users.
4. **Old-client privacy firewall:** implement versioned GET+POST/SSE/bootstrap/Keep/peer safe denial for V2 rows before any V2 ID can reach a V1 route. A "rollback" must not re-enable historical read access.
5. **Private canary:** only with separate approval, use synthetic accounts, short duration and explicit operator monitoring; check network auth, role identity after pool checkout, BLOCK/revocation races and current-only Android behavior.
6. **Rollback / forward-fix:** restore traffic to unaffected V1 QA only if no V2 conversation IDs or privacy cutover have been exposed. After cutover, fail closed or forward-fix rather than reviving V1 transcripts. Never erase QA data or downgrade permissions without a verified plan.

## B3c-2R disposable test acceptance

- Guard: `CI=true`, `GITHUB_ACTIONS=true`, separate explicit ACK, exact loopback URL, username/password/database, PG major 16 or 18 and independent Docker cluster system-ID attestation **before any role DDL**.
- Create only generated synthetic role/schema names and synthetic integer/opaque-byte rows. Confirm independent LOGIN identities and `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`.
- Validate V1-only, V2-only, reviewer, retention privilege denial; default-deny RLS even with table GRANT; scoped canary positive SELECT; owner FORCE RLS, DDL/SET ROLE denial, invoker-view boundary and untrusted actor-GUC spoofability.
- Ensure finally teardown drops every test role and schema, checks no residual generated names, and fails CI on incomplete cleanup. No production secrets, hosted query, code or schema migration.
- Preserve prior Foundation matching/PG16 test pipeline. New PG16 and PG18 matrix is additive; `workflow_dispatch` is for a separate disposable run, **not** permission to point tests at a hosted DB.

## Independent future approval gates

- B3c-2R results and exact PR review before any broader integration.
- Actual 0008 on disposable PG18 + actor-bound authorized nonowner V2 service and race proof, separately approved code scope.
- Hosted Neon role/grant/policy modifications and Render credential/env/deployment changes: **independent founder authorization required**.
- B3c-3 durable KEKs/provider/cost, G1/V2-11 network cutover, retention, billing, Android V2-10 and public beta are all separately gated.
- R0 physical device acceptance stays **OPEN**; final V2-16 138-case What If? audit stays **LAST**.
