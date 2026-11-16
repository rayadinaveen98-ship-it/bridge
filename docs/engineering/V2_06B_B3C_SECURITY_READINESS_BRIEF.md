# Bridge V2-06B / B3c — Production Security Readiness Brief

**Status: SECURITY PLANNING ONLY / NO SOURCE IMPLEMENTATION OR HOSTED INSPECTION AUTHORIZED.**  
**Date:** 2026-11-16. **Verified baseline:** `main@3d4f71036b7dc7231175959bee14f1a7104b0ee6`; [Foundation #43898590922](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43898590922), matching and disposable PG16 integration SUCCESS.  
**Predecessor:** B3b-2 [implementation PR #47](https://github.com/rayadinaveen98-ship-it/bridge/pull/47) and [evidence PR #48](https://github.com/rayadinaveen98-ship-it/bridge/pull/48), 29/29 new TAP results, isolated local test-keys and SQL. **NOT DEPLOYED.**  
**Companions:** [B3c role/key decision and cost matrix](V2_06B_B3C_ROLE_KEY_COST_MATRIX.md), [B2 key/privileges record](V2_06B_B2_KEYS_AND_PRIVILEGES.md), [B3 release gates](V2_06B_B3_SECURITY_RELEASE_GATES.md), [B3b-2 final evidence](V2_06B_B3B2_EVIDENCE.md).

## 1. Source-driven findings — distinguish source facts from live facts

**Verified from repository source, not live infrastructure:**
1. `apps/api/src/start.mjs` starts hosted V1 through `new pg.Pool({connectionString: process.env.BRIDGE_DATABASE_URL,max:5,...})` and `createPostgresService(pool,...)`; it may provision two synthetic Cloud QA accounts. It does **not** import the B3b-2 private atomic facade. **Current actual Render role name, login privileges, Neon database grants, session identity and RLS bypass flags are unverified.**
2. V2 migration `database/migrations/0008_v2_secure_messaging.sql` enables RLS on `bridge_v2_secure_messages`, `bridge_v2_secure_live` and `bridge_v2_secure_unread` but defines no user-facing RLS policies. It is source and disposable-PG16 test material only, **not applied to hosted Neon**. Owner/BYPASSRLS exemptions, effective GRANTs, and per-operation row scope still require controlled design; **RLS enabled** is not a production isolation certificate.
3. `apps/api/src/messaging/private_crypto.mjs` implements synthetic AES-256-GCM with a **new 32-byte DEK per payload**, fresh 12-byte data/wrap IVs, separate 16-byte tags, versioned purpose-bound AAD. `private_key_contract.mjs` has separate LIVE/UNREAD ephemeral test KEKs; the wrap-IV reuse registry is **per test process only**, neither globally coordinated nor durable. A restart loses the in-memory KEKs and nonce history; there is no production restore path.
4. B3b-2 `apps/api/src/v2/private_atomic_facade.mjs` binds synthetic RS256 subject to an eligible DB actor and encrypted send/current LIVE/unread/ACK/recovery in **one** guarded PG16 transaction, including a final token-validity check before COMMIT. This does not activate hosted routes or prove hosted DB roles.
5. `apps/api/src/postgres.mjs` still contains legacy V1 plaintext `bridge_messages.body` reads. The V1 `block()` uses advisory mutex 714411, while `unblock()` and other update paths do not yet share a certified V1/V2 lock protocol. **G1/V2-11 old-reader/writer firewall and full revocation races remain release-blocking.**
6. V2 `bridge_report_evidence.source_message_id` / `bridge_history_items.message_id` use legacy `bridge_messages` FKs; do not fabricate plaintext legacy messages to join V2 secure records. V2-07/V2-09 secure-ID linkage is independently gated.

**Unverified, not to be guessed:** actual hosted `current_user/session_user`, role membership and `rolbypassrls`, RLS policy effectiveness, database owners, connection pooling behavior, secret provenance, backups, multi-instance hosting, service permissions, real auth key source, age assurance, live V2 schema or data, real KEK or HMAC rotation, and actual user latency/cost.

## 2. B3c trust boundaries, owners and decisions

| Asset or boundary | Required design | Denied authority / stop condition |
|---|---|---|
| Schema migration owner | Privileged DDL only in an approved isolated change window | Never normal Render runtime login |
| V1 legacy API | Current QA behavior preserved until G1 privacy cutover | Never allowed to read/modify V2 rows or become V2 fallback |
| V2 API runtime | **Separate nonowner least-privilege principal**, only the bounded transactions and vetted policies/functions needed for authorized V2 operations | No `SUPERUSER`, `BYPASSRLS`, object ownership/DDL, broad cross-account history, case review, user-defined SQL |
| Retention worker | Separate narrow delete/lease authority under approved manifest and legal hold rules | Not authorized by B3c; no live purge |
| Case reviewer | Independent case-scoped evidence access with actor/purpose audit | No ordinary free-message history or unrestricted ciphertext dump |
| DB backup/recovery | Noninteractive, auditable, encrypted; restore rehearsal and tombstone replay | No permanent access to plaintext keys and no silent reappearance of deleted messages |
| Encryption service/key custodian | Distinct LIVE/UNREAD wrapping key purposes/versions, isolated key access, controlled rotation and custody | No key values in database, logs, client, GitHub Actions or app build |
| Token/HMAC purposes | Distinct cursor, presentation, recovery, and signing/verification keys with stable versions and rotation | Never reuse KEKs as HMAC keys or accept arbitrary client role/actor claims |
| Operators | Named least privilege, emergency break-glass approval, separation of duties, audit evidence | No one unattended process can migrate/erase/review/decrypt unrestricted data |

**Foundational design choice remains open:** A separate API runtime role must be proven by a real, redacted read-only audit *after founder approval*. Even with RLS and a separate role, application-level B3b-2 authorization is still mandatory. A mutable `SET LOCAL app.actor_id` value set by the same privileged app session is **not** intrinsically authentic; a policy relying on it must be threat-modelled and supported by trusted subject mapping, restricted function execution, SQL-injection negative tests and rollback cleanup. Avoid `SECURITY DEFINER` shortcuts and broad policies before independent review.

## 3. Four proposed B3c sub-gates — separate approval, no stage drift

**B3c-0 (this PR) — design & source-of-truth reconciliation, docs only**
- Record baseline SHA, source-derived privilege/key risk inventory, threat model, choices, cost assumptions, rollback and 20 acceptance checks.
- Compare existing B2/B3 docs with current B3b-2 evidence. Propose *one next small implementation gate*, not an unspecified series of hosted edits.
- **Exit:** documentation PR exact four paths, final push+PR both Foundation jobs green and independent main CI. **No B3c code or live access.**

**B3c-1 — recommended NEXT, founder approval required, synthetic authorization proof only**
- Prepare an exact source/test path brief *after this document* for **disposable PostgreSQL 16 nonowner vs owner grants/RLS and denial tests**. Use local temporary synthetic roles/permissions in disposable test DB only. Demonstrate:
  - Owner privilege may bypass RLS; separate nonowner with no `BYPASSRLS` is denied by default without table policy, even if table `SELECT` is granted.
  - No accidental grant via `PUBLIC`, inherited role, schema ownership or `SECURITY DEFINER`; no data exposure through legacy API tables, views or functions.
  - **An authorized path is not yet defined**: study whether explicit narrow functions vs scoped RLS policies are appropriate *without claiming a test-owner facade is a production role model*. Existing PG16 B2 fixtures and legacy QA still PASS.
  - Rehearse reversible role/policy tests only within fresh acknowledged `bridge_test`; never add `GRANT`, `ALTER ROLE`, `FORCE ROW LEVEL SECURITY` or migrations to Neon.
- **Exit:** exact approved file scope + negative table/view/function tests, failure/rollback evidence, final SHA CI green. NO hosted connection.

**B3c-2 — read-only *real hosted principal* evidence, DIFFERENT founder approval**
- Only with founder approval and permitted access, inspect the *actual Render runtime pool* principal and a redacted Neon grant/RLS policy inventory. We must not assume the Neon owner identity is the runtime identity.
- Read-only observations: `current_user`, `session_user`, relevant `pg_roles` attributes and role membership, effective schema/table/function grants, table owner, `relrowsecurity`, `relforcerowsecurity`, policies, runtime connection origin and redacted server version. Verify session context after pool checkout. Use a **purpose-built, nonsecret redacted report** (role pseudonyms when needed), no connection strings, SQL values, messages or JWTs. Querying hosted data is NOT part of this stage.
- **Stop** on unexpected owner/superuser/BYPASSRLS, accidental V2 exposure, missing privileges, wrong database, or unknown runtime principal; record blocked with remediation options. No `SET ROLE`, `CREATE ROLE`, `GRANT`, `ALTER TABLE`, migrations, production writes, or deploy.
- **Exit:** signed founder-reviewed role map, redacted evidence, remediation plan and explicit new approval for ANY live change.

**B3c-3 — production key/provider decision and offline recovery contract, DIFFERENT founder approval**
- Select a provider and budget only after forecast, legal/data-location/availability, real latency, operations, and confidentiality requirements are reviewed. Test with simulated provider or approved sandbox key first; do not create paid keys or services by default.
- Design durable versioned LIVE/UNREAD KEK use plus separate cursor/presentation/recovery HMAC and JWT signing lifecycle, deterministic key lookup by stored ref, new-write key rollover, previously accepted unread decryption until the permitted deadline, strict denial on missing/retired/compromised key, safely auditable rotation, restart/recovery and key destruction after applicable retention/legal hold. Test cross-node wrap-IV uniqueness/operation limits, no duplicate KEK material under aliases; single-process nonce registry is insufficient.
- **Transaction design:** don't hold a PostgreSQL account/room lock during unbounded network KMS operations. Fail closed on provider timeout, retry uncertainty, rollback and key-version race. Avoid plaintext appearing in logs/caches/notifications; auditable key use should contain refs/purposes/operation counts, not bodies or key bytes.
- **Exit:** founder-approved price/provider choice, threat model, synthetic/sandbox recovery/rotation proofs and separate exact integration PR. No Render/Neon activation here.

## 4. Proposed B3c acceptance register (IDs are NOT measured test counts)

| Gate | Acceptance |
|---|---|
| C03-01 | Real Render principal UNKNOWN until separate audit; no inferred identity |
| C03-02 | No RLS bypass by intended V2 nonowner role; owner/superuser risk measured |
| C03-03 | No `PUBLIC`/inherited privilege grants unexpected read/write |
| C03-04 | All ordinary free users denied former D1/random transcript |
| C03-05 | Separate V1/V2 principal/route firewall policy defined |
| C03-06 | Account/Block/unblock/restriction writer locks have explicit order |
| C03-07 | Distinct LIVE/UNREAD KEKs, purpose and monotonic version rules |
| C03-08 | Distinct cursor/presentation/recovery HMAC secrets and signing key |
| C03-09 | Durable KEK retention resolves pending 7-day unread after restart |
| C03-10 | FirstACK+15m recovery remains bounded by original 7 days |
| C03-11 | Rotation: new encrypt only, prior eligible decrypt only |
| C03-12 | Suspected compromise: revoke/deny and incident recording; no false "recovered" content |
| C03-13 | Cross-node GCM wrap-IV uniqueness and usage budget have durable proof |
| C03-14 | AEAD AAD and canonical DB acceptance timestamp preserved |
| C03-15 | One signed actor + B2 operation remains single transaction; no unbounded remote KMS lock |
| C03-16 | KMS outage/timeout/partial rotation or DB failure rolls back without side effects |
| C03-17 | No KEK/HMAC/private signing key or plaintext in DB/logs/CI/app |
| C03-18 | Backup and restore preserve allowed pending content without reviving erased history |
| C03-19 | Provider fees, retry overhead, latency, regions, compliance and operational spend reviewed |
| C03-20 | R0 physical phone/tablet OPEN, V2-16 final 138-case What If? LAST; no public release |

**These are acceptance targets, not a claim of passing tests.** G1/V2-11 old-client GET+POST, SSE, bootstrap/Keep/peer version firewall and actual network tests remain nonnegotiable even if all B3c security design gates are later satisfied.

## 5. Threat-driven go/no-go policy

**P0 / Block hosted V2:** unverified runtime owner/BYPASSRLS; RLS policy relying on untrusted actor context; unrestricted V1 history/old-client fallback; key version absent or rotated away while unread still eligible; duplicate GCM wrap IV under same material; plaintext/keys in log or SQL; unbounded KMS wait inside locked transaction; report/history FK workarounds that insert fake V1 messages; no safe-deny on token/account/Block failures.

**P1 / Require remediation before canary:** missing key-use/audit trace without secrets, unclear recovery SLA, backup restore incompatibility, cost runaway risk, policy functions/views broader than documented, lack of session pool isolation, no staged rollback procedure.

**No hosted rollback to unsafe history:** if a future cutover is attempted, safe-deny old read/write and forward-fix; never reactivate unrestricted legacy history. Retention deletion remains separately authorized and irreversible. No production role/key changes or payments are part of B3c planning.

## 6. Approval decision requested after docs-only CI

Next recommended founder authorization is **B3c-1 offline/disposable nonowner privilege and RLS adversarial proof**, with a separate exact file list that must be written and approved before source implementation. B3c-2 read-only hosted audit and B3c-3 vendor/key choice require independent founder decisions. Do not silently combine these stages.

**R0 hardware acceptance: OPEN. V2-16 comprehensive 138-case What If?: LAST.** No real-user matching, public beta, paid provider, production key creation, Neon/Render inspection or deployment is authorized by this brief.

### Current authoritative reference sources

- [NIST SP 800-38D AES-GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final) — IV uniqueness and AEAD design; 2007 recommendation currently accompanied by a revision planning note.
- [OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html) and [Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) — custody, separation, key retirement and rotation.
- PostgreSQL RLS role/policy rules to validate in disposable PostgreSQL 16; no hosted role inspection performed.
