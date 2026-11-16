# Bridge B2 — Key Custody, Identity and PostgreSQL Privilege Decision Record

**Status:** ARCHITECTURE OPTIONS UNDER FOUNDER REVIEW. **No live key vendor, real secret, Neon role inspection, migration or Render modification is authorized.**  
**Current baseline:** main@7ca0865b18abdfd123fb28dc58a4f720d50385f6.  
**Companion:** [Exact B2 implementation brief](V2_06B_B2_IMPLEMENTATION_BRIEF.md), [B2 threat matrix](V2_06B_B2_THREAT_AND_ACCEPTANCE.md), [B1b synthetic crypto evidence](V2_06B_B1B_EVIDENCE.md).

## 1. What is actually implemented

- B1b provides AES-256-GCM encryption/decryption in **new disconnected Node modules**. These are pure synthetic tests with a manually injected in-memory test keyring. Each copy uses a new 32-byte DEK; its wrapping key is purpose-specific and provided by a stub; same-process KEK wrapping IV reuse is rejected by an ephemeral registry. Caller scope and metadata are authenticated as AAD. **No durable key store or service integration exists.**
- B1a 0008 defines RLS-enabled V2 secure-message metadata/LIVE/unread tables on the GitHub branch and **disposable PG16 CI only**. RLS with no active policy means nonowners ordinarily cannot read, but database owners can bypass RLS unless FORCE RLS and permissions are governed. This is not evidence of safe current Render runtime roles.
- Hosted V1 API still uses a PostgreSQL pool `BRIDGE_DATABASE_URL` in `apps/api/src/start.mjs`; actual `current_user`, grants and RLS bypass on the live Render principal are **not verified** by this B2 document.
- Product authentication uses signed bearer subject mapping; production age assurance/policy acceptance are **not proven** by synthetic QA `age_verified_at` and `safety_eligible` fixtures. Never trust client JSON claims.

## 2. Candidate encryption key custody

| Approach | Pros | Risks and gaps | Status |
|---|---|---|---|
| **A. Ephemeral test-only in-memory KEK** | Free, simple, supports deterministic isolated B2a/B2b PG16 tests with injection | Keys disappear on restart, cannot recover messages, no role separation or audit, test IV registry isn't durable | **APPROVED FOR SYNTHETIC TESTS ONLY** by existing B1b code scope; do not deploy |
| **B. Hosted environment secret with server-managed versioned KEKs** | May be low cost and workable for limited *synthetic QA-only* prototype | Host compromise leaks KEK; env backups/rotation/old versions/audit/availability; same operator may control DB+keys; restart/multinode nonce controls still required | PROPOSED subject to threat-model review; no real key or hosted activation approved |
| **C. Managed KMS/Secrets service with audited role separation** | Better key lifecycle, access control, rotation and audit potential | Per-operation/network/hosting charges, outages, credential setup, vendor lock-in, operational engineering | PROPOSED for future real-user operation only; **requires explicit provider/cost/security approval** |
| **D. Client-held end-to-end encryption keys** | Changes server visibility and threat model | Major identity, recovery, safety reporting, lawful moderation, multi-device and key-verification redesign; not current product contract | NOT PART OF B2, do not market E2EE |

**Recommendation now:** Keep B2a/B2b isolated with a synthetic in-memory provider; author a future production key-custody design decision with budget, restore/rotation rehearsals and threat-model approval before any HTTP or real-user activation. Do **not** install paid cloud/KMS now.

**Minimum future production secret contract:** distinct LIVE and UNREAD KEK purpose/version, protected key reference storage outside ciphertext DB, no key bytes in logs/client/fixtures, zero fallback keys, authenticated DEK wrapping, recovery under controlled server identity, retirement/rotation evidence, incident revocation, consistent backups/recovery and operator access audit. A compromise of server runtime may expose content: do not claim E2EE or absolute anonymity.

## 3. Nonce and timestamp integrity

- **Per-payload DEK:** fresh 32 random bytes per new unique LIVE/UNREAD item; each data AES-256-GCM IV 12 random bytes and 16-byte tag. Fresh DEK per item sharply limits IV reuse risk, but this is **not proof** of global uniqueness in operation.
- **Per-KEK wrap IV:** also 12 random bytes, **must never be reused for the same actual KEK material**, including when labels/versions change. B1b's in-memory registry rejects duplicate IVs only in one test process; B1a SQL UNIQUE(kek_id,kek_version,wrap_iv) is *structural only* and does not coordinate same key across machines/old aliases. Reject identical KEK bytes under a new purpose/version and design durable uniqueness/usage budgets before hosted rollout.
- **Failure mode:** a simulated provider outage or wrong tag must leave the transaction rolled back, with no message row, outbox hint, unread copy or incremented clock.
- **Canonical acceptance timestamp:** sample DB `clock_timestamp()` **after locks**, convert exactly once to integer UTC epoch milliseconds, write this canonical value to both message/unread accepted_at and AEAD AAD; test equality after PostgreSQL serialization and replay. A client-supplied timestamp must never determine expiry or authenticated AAD.

## 4. Hosted role separation — future design only

| Role | Intended allowed access | Denied access |
|---|---|---|
| **Migration owner** | Versioned schema DDL after founder approval, restore rehearsal and audit | Used as the runtime web/API identity |
| **API runtime nonowner** | Only required transactions and scoped secure-message metadata/ciphertext rows under server authorization + vetted RLS policies | SUPERUSER/BYPASSRLS/DDL, raw unrestricted other-account data, case-evidence reviewer, retention erasure |
| **Retention worker nonowner** | Future bounded leased jobs under distinct policy and retention authorization | Chat/API session identity, unrestricted case review or schema owner |
| **Case reviewer** | Specific case grant, purpose, read audit, restricted evidence store | Ordinary conversation/history and plaintext without case grant |
| **Synthetic CI DB owner** | Disposable fixture/migration/restore test control | Any access to Neon/Render real credentials or live users |

**No live privilege assertion in B2.** The existing inspected Neon owner has elevated rights, but that does **not** establish Render's runtime current_user; do not infer it. Separate later founder-approved **read-only** evidence collection should capture `current_user`, `session_user`, `rolsuper`, `rolbypassrls`, `rolcreatedb`, `rolcreaterole`, row security flags, actual grants, `pg_has_role`, and scoped select denials, **redacted with no connection string/password in logs**. This audit is not performed here.

**Note:** RLS enabled with no policies makes new B1a tables inaccessible to a nonowner by default; B2a's synthetic owner test access is **NOT** a production access model. Do not weaken RLS or add broad policies to get B2 working on hosted DB.

## 5. External authorizer and old-client privacy firewall

- Every future HTTP V2 request must bind cryptographically verified bearer subject to **trusted server-side account ID**, not caller-provided actorId/role/premium/age/policy flags.
- Under the same transaction, re-read account/other participant, bilateral mutual, block, session, acceptance time and eligibility; authorize the exact operation (RANDOM_LIVE_SEND, DIRECT_LIVE_READ, UNREAD_DELIVER, etc.) using V2 policy with server-derived context.
- The persistent source of genuine adult eligibility, policy acknowledgment, moderation status, revocations and real account roles must be reviewed and tested. Synthetic QA `age_verified_at` is not public assurance.
- No V2 message body can appear in old V1 `GET /v1/conversations/:id/messages`, V1 SSE, bootstrap, peer, connections, notifications, logs or Android caches. **Old-client privacy enforcement is an API/backend gate (B3/G1/V2-11), not a UI-only change.**
- After V2 cutover, fallback is explicit private safe-deny/upgrade-required; never restore broad old V1 replay.

## 6. Additional important schema coupling

B1a `bridge_v2_secure_messages` IDs **do not reference** legacy `bridge_messages`, deliberately preventing plaintext coupling. However `bridge_report_evidence.source_message_id` (`0007_v2_evidence_retention.sql`) and `bridge_history_items.message_id` (`0006_v2_history.sql`) still reference **legacy** `bridge_messages(id)`. Do not write a fake V1 body merely to satisfy these FKs; do not offer safety evidence/history over new V2 content until separately approved additive linking/schema design, independent encryption purposes, audit and physical retention tests. Existing report semantics must remain available under future V2-07 by explicit scope.

## 7. Review/approval record

| Item | Decision |
|---|---|
| B2a synthetic-only use of ephemeral key provider | Recommended only; **new B2a source approval still required** |
| Real key provider / external subscription | UNSELECTED / NOT APPROVED |
| Real secret creation/rotation/storage | NOT STARTED |
| Hosted database principal and least-privilege enforcement | UNVERIFIED / NOT AUTHORIZED |
| Hosted V2 message API, old V1 safe cutover | NOT STARTED / G1 founder approval required |
| Android V2 and phone/tablet physical acceptance | NOT STARTED / R0 OPEN |
| Optional premium history | Separate V2-09 bilateral consent; no payments authorized |
| Final 138-scenario What If? | V2-16 LAST |

No live inspection, source change, secret, paid service or cloud migration is performed by this document.
