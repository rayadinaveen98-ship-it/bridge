# Bridge B3c — PostgreSQL Role, Key Custody, Rotation, Costs and Failure Matrix

**Status: PROPOSED SECURITY/COMMERCIAL DECISION RECORD ONLY. No real provider selected, no live Neon/Render inspection, no keys created, no spend approved.**  
**Date:** 2026-11-16. **Repository baseline:** `main@3d4f71036b7dc7231175959bee14f1a7104b0ee6`, [Foundation #43898590922](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43898590922) both jobs SUCCESS.  
**Prerequisite:** [B3c security readiness brief](V2_06B_B3C_SECURITY_READINESS_BRIEF.md), [B2 key/privilege decisions](V2_06B_B2_KEYS_AND_PRIVILEGES.md), [B3b-2 synthetic evidence](V2_06B_B3B2_EVIDENCE.md).

## 1. Accountable distinction: test, hosted inspection, and actual user security

| State | What would be known | Allowed activity | Not allowed from this document |
|---|---|---|---|
| Current B3b-2 | Synthetic signed actor + test-only in-memory KEKs and one PG16 transaction; 29 new TAP results passed | Offline code review, documentation, disposable DB test planning | Claim production role, key recovery, hosted V2 or end-to-end encryption |
| B3c-1 candidate | Disposable PG16 nonowner RLS and GRANT denials, actual test-client current_user, owner bypass demonstrator | Only after separate founder approval of exact tests/files | Any Neon/Render query/change or broad new policy |
| B3c-2 candidate | Read-only **actual Render runtime connection's** redacted role and Neon grant/policy inventory | Only after distinct permission, no stored secrets or user row reads | Modify DB, touch QA records, Rotate/SET ROLE/GRANT, deploy |
| B3c-3 candidate | Approved key provider, formal version/nonce/restore contract, synthetic or separately approved test sandbox | Only after explicit budget/provider+source approval | Create paid account/service, real secret, activate hosted message storage |
| G1/V2-11 | Actual safe old-client V1 GET/POST/SSE behavior and V2 canary | Separate private-QA release authorization | Public release without R0/G2/V2-16/real adult safety gates |

## 2. Proposed least-privilege role decision (NOT applied)

| Principal | Required positive powers | Absolute denied/negative proof |
|---|---|---|
| `bridge_schema_migrator` (candidate) | Only reviewed DDL and migration receipts within approved window | No use as normal API connection; no user-facing shared credential |
| `bridge_v1_runtime` (candidate) | Existing V1 private QA only until separate cutover | No SELECT/INSERT/UPDATE on V2 secure tables or evidence/history |
| `bridge_v2_runtime` (candidate) | Explicit scoped secure message and unread operations, policy-enforced read/write within signed actor transaction | No SUPERUSER/BYPASSRLS, table ownership, DDL, arbitrary cross-user SELECT or case-evidence access |
| `bridge_case_reviewer` (candidate) | Explicit case-only reviewer authorization/audit | No ordinary live/free chat browsing |
| `bridge_retention_worker` (candidate) | Future exact expiring jobs scoped to approved manifest and legal hold | Not an app runtime identity, no broad ALTER/DROP; no live delete authorized |
| `bridge_ci_disposable` | Local PG16 fixture schema/migration/restore | No hosted secrets/roles, no remote connections |

**Source fact:** 0008 declares `ENABLE ROW LEVEL SECURITY` for V2 tables but NO active policies or hosted grants. Nonowner default denial is intended yet not enough for functional hosted access; owner/superuser/BYPASSRLS exemptions must be explicitly tested. Never add a blanket `USING (true)` policy. `FORCE ROW LEVEL SECURITY` changes owner behavior and belongs to a separately approved migration if chosen.

**Read-only future audit inventory (illustrative, NOT EXECUTED):** actual runtime `SELECT current_user, session_user`; role attributes `rolsuper,rolbypassrls,rolinherit,rolcreaterole,rolcreatedb`, role membership, per-table/sequence/function `has_*_privilege`, `pg_class.relowner,relrowsecurity,relforcerowsecurity`, policies via `pg_policies`, schema USAGE and altered default privileges. Assess search_path, cross-schema functions, views (security invoker vs definer), row context resets in pools, and accidental `PUBLIC` privileges. Use redacted report only; no user data, tokens, passwords, connection strings or raw DB dumps.

**Critical design fork:** Backend authorization and SQL RLS are separate, complementary checks. B3b-2 already establishes a trusted identity transaction in a synthetic owner-only test; introducing a nonowner runtime requires selecting and proving precisely scoped RLS or reviewed stored-function privileges. Do NOT copy the CI owner role to Render or weaken RLS to make API calls succeed. If a separate `bridge_v2_runtime` connection pool is required, design must include V1/V2 transaction-safe routing, lock order and graceful old-client safe-denial at G1.

## 3. Versioned key inventory and rules (NOT deployed)

| Purpose | Synthetic current state | Required before any real V2 data |
|---|---|---|
| LIVE AEAD DEK | Fresh 32-byte CSPRNG DEK/item, 12-byte data IV, 16-byte tag | Per-message unique material and canonical, server-owned AAD; do not reuse DEKs as global keys |
| UNREAD AEAD DEK | Independently generated, recipient-only copy, original max 7d | Old purpose/version must remain decryptable **only while legitimately eligible**, not create free history |
| LIVE wrapping KEK | In-memory test provider; versioned ref, GCM wrapping | Durable custody separate from DB, versioned key ref, key-use counter, cross-process nonce uniqueness/usage budget |
| UNREAD wrapping KEK | Independently keyed from LIVE, in-memory | Distinct purpose key and version; no fallback to LIVE; restore 7d envelope until expiry/ack rules |
| Cursor HMAC | Ephemeral B2b secret | Purpose-specific and versioned; bind actor+room/scope, short safe overlap for in-flight cursors |
| Presentation proof HMAC | Ephemeral 5-minute synthetic TTL | Separate purpose, replay/ack rules; 5-min TTL **NOT approved as public product UX policy** |
| Recovery token HMAC | Ephemeral; hashed DB token | Separate purpose, immutable first ACK, hard `min(firstACK+15m,accepted+7d)`; never persistent history |
| JWT signing | V1 key material, B3b synthetic ephemeral RSA test signer | Real issuer/verification lifecycle, independent key separation, algorithm and expiry enforcement |
| Case evidence and prospective premium history | Legacy 0006/0007 FKs point to V1 message table | **Different encryption purposes, access and retention**, decided in V2-07/V2-09, not B3c |

**Rotation ordering:** (1) approve and register new purpose/version key, prove availability on every authorized processor; (2) switch new ENCRYPT only after registration; (3) preserve old DECRYPT only for still eligible rows and legal holds as approved; (4) rewrap or retire with exact manifest and verified restore; (5) revoke compromised material promptly, fail closed and record limitations; (6) destroy only after all authorized copies and backup/legal rules permit. No silent retroactive resurrection or key destruction that strands permitted unread. A key-provider outage must not cause fallback encryption with a weaker/default key.

**GCM nonce risk:** B1b's per-process `createTestWrapNonceRegistry()` and SQL uniqueness by `(kek_id,version,iv)` do NOT prevent reuse across aliases, runtimes, cross-region instances or restored copies of the same actual KEK. Future key issuance must bind immutable material identity/version, enforce usage budgets, coordinate nonce claims durably or use a provably unique per-key construction, and test crash/restart/multi-node/rollback. NIST GCM rules and OWASP guidance are the review baseline.

**Availability vs privacy:** A locked-down service must show recoverable authorized unread within the original seven-day deadline after restart, while forbidding expired/revoked/blocked histories. Neither "zero data loss" nor "always decrypt" overrides safety denial or a legitimate deletion. If an old KEK is lost, fail safely and explain the operational incident; don't promise impossible recovery.

## 4. Low-cost architecture candidates — NO DECISION/ACTIVATION

| Option | Expected incremental third-party fee | Primary advantage | Main problem / founder gate |
|---|---|---|---|
| A — Current ephemeral in-memory test provider | $0 new KMS | Already tested, zero vendor complexity | **STRICTLY synthetic CI**. Restart loses keys; no production use |
| B — Versioned secret stored in existing hosting secret environment | May be $0 new vendor charge, hosting plan not audited | Small integration surface, low per-item latency | Host compromise exposes KEK, weak separation/audit, backup and rotation difficult, cross-node nonce risk. **Not recommended as default for public users** |
| C — Managed software KMS, two separate key purposes | Published storage+operation costs below | Better custody/rotation/audit and separated management | Cross-cloud latency, egress, KMS availability, provider permissions, invocation volume. **Preferred direction for future real-user architecture, not selected** |
| D — Managed HSM / external KMS or client E2EE | Custom/usually higher ops cost | Stronger isolation or new threat model | May require redesign of reporting, multi-device recovery, jurisdiction; separate roadmap, no purchase |

### Official published illustrative rates checked 2026-11-16

**Google Cloud KMS SOFTWARE**: [pricing](https://cloud.google.com/kms/pricing) lists approx **USD $0.06 per active key version/month** and **$0.03 per 10,000 symmetric cryptographic operations** (billing eligibility and free Autokey conditions differ; billing signup is required). KMS requests do not include Node/Render CPU, network egress, logging, storage, taxes or FX.

**AWS KMS**: [pricing](https://aws.amazon.com/kms/pricing/) lists **USD $1 per customer-managed key/month** and example **$0.03/10,000 symmetric key requests**, with a **20,000 requests/month** general free tier subject to exclusions; managed key rotations may increase recurring monthly key charges. Actual region, request class, CloudTrail, retries, egress, secret access and taxes can change the quote.

### Cost illustration — deliberately simplified, not projected demand or a quote

Scenario: ALL messages are mutual direct messages; 2 distinct LIVE/UNREAD copies are encrypted per message; assume an architecture making **2 KMS wrap/encrypt API requests per new message** and **1.5 decrypt/unwrap requests per message on average** (not 1.5 users, simply aggregate operations per message). Two active Google SOFTWARE key versions or two AWS customer-managed symmetric keys, no extra version, no KMS sign/verify, no retries. Google estimate excludes optional Autokey allowances; AWS includes eligible first 20k free symmetric operations.

| Direct messages/month | KMS calls/month (=3.5 × messages) | Google software KMS illustrative/month | AWS KMS illustrative/month |
|---|---:|---:|---:|
| 10,000 | 35,000 | **$0.23** | **$2.05** |
| 100,000 | 350,000 | **$1.17** | **$2.99** |
| 1,000,000 | 3,500,000 | **$10.62** | **$12.44** |

Google = `2*$0.06 + calls/10,000*$0.03` (not claiming a free tier). AWS = `2*$1.00 + max(0,calls-20,000)/10,000*$0.03` for eligible symmetric operations (rotation increments excluded). USD rounded two decimals, subject to provider region/pricing changes. **This is ONLY a marginal KMS invoice illustration**, not Bridge's full monthly hosting/security cost and not a decision to use 3.5 cloud operations per message.

**Architecture risk exceeds per-call fees:** Direct KMS requests inside every locked B3b-2 PG transaction add network wait, deadlock/latency pressure and outage coupling. Candidate design should prepare/wrap outside critical locks when safely possible, bind cryptographic outputs to server-derived message metadata and DB accepted-at, and prove no stale recipient/clock after KMS call; no partial commit and no nonce reuse on retry. A two-tier short-lived worker KEK cache reduces network operations but expands key exposure in host memory and complicates rotation; evaluate explicitly. We do not have usage profiles, KMS region, real cloud account access or SLA budget, so no accurate operating-cost or break-even forecast can yet be approved.

**Approval threshold:** present measured latency p50/p95/p99, realistic request rate and peak, key-version count, backup/recovery runbooks, actual billed currency/region, annual/quarterly commitment, logging, egress, failover and key-access audit before founder selects a provider or incurs charges.

## 5. Threats and required demonstrations before hosting

| Scenario | Fail-safe expected result | Gate |
|---|---|---|
| API DB role is owner/BYPASSRLS | BLOCK canary, design least-privilege runtime | B3c-2 read-only actual audit, separate approval |
| No policies on V2 table but API has table grants | Nonowner default deny; do not bypass | B3c-1 disposable negative tests |
| `PUBLIC`/inherited role/view/function leaks V2 data | Deny and remove only in separately approved change | B3c-1/2 |
| KMS request succeeds but DB transaction rolls back | No accepted message; any unused wrapped DEK treated as unreachable; retry idempotency proven | B3c-3 offline provider simulation |
| KMS key version rotates midway through active D1/7d unread | New writes use current key; eligible old unread continues under specifically retained old version | B3c-3 rotation/recovery rehearsal |
| Lost old KEK, emergency compromise | Safe denial, incident/audit, no fabricated plaintext or fallback | B3c-3 incident plan |
| Duplicate wrap nonce under same real material after restart/multi-node | Globally prevented/denied; never rely solely on test process `Set` | B3c-3 nonce design |
| Cross-purpose key use or HMAC key reused as KEK | Deny by purpose/capability, not just naming convention | B3c-3 |
| V1 GET/POST queries a V2 conversation UUID | Privacy-safe deny **before V2 exposure**, no old reader fallback | G1/V2-11 |
| Client lies about age, role, premium, sender or first display | DB/issuer source authoritative; fake presentation never extends read/recovery window | V2-10/13 + G1 |
| Key audit/telemetry shows plaintext, key bytes or JWT | P0 fail; redact and fix before rollout | All gates |
| Disaster recovery reloads deleted/expired content | Tombstones and legal holds applied, no resurrection | V2-08/12 separately approved |

## 6. Proposed next actionable decision — no spend

Recommend **B3c-1 disposable PG16 role/RLS denial rehearsal** first. It is a low-cost, high-information answer to a concrete unknown about PostgreSQL ownership and how V2 can execute without an owner role. Prepare and get founder approval of its exact path allowlist before source tests. Only after this should we request founder approval for **B3c-2 actual hosted read-only role inspection**. Do NOT activate a paid key provider until the cost/risk/latency model is reviewed and the founder accepts B3c-3.

**R0 physical phone/tablet acceptance OPEN. Final V2-16 comprehensive 138-case What If? review LAST.**

### External references (not evidence of Bridge's hosted setup)

- [Google Cloud KMS official pricing](https://cloud.google.com/kms/pricing), checked 2026-11-16.
- [AWS KMS official pricing](https://aws.amazon.com/kms/pricing/), checked 2026-11-16.
- [OWASP Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html) and [Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html), key lifecycle guidance.
- [NIST SP 800-38D AES-GCM](https://csrc.nist.gov/pubs/sp/800/38/d/final), IV construction and authenticated-encryption guidance.
