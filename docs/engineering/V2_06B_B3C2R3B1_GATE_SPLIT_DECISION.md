# Bridge B3c-2R3B-1 — proposed split of offline merge acceptance from hosted V2 activation

**Decision state: PROPOSED / FOUNDER REVIEW REQUIRED, NOT APPROVED, NOT MERGED.**  
**Date:** 2026-11-17  
**Current authoritative source:** \`main@e3aa65517a5aae2c593170cf1d334b43599897f8\`; B3c-2R3B-1 [draft PR #61](https://github.com/rayadinaveen98-ship-it/bridge/pull/61) at \`5692082a2444eaa1b0373df5a2b67e4d91c5789a\`.  
**Evidence:** [B3c-2R3B-1 evidence on PR #61](https://github.com/rayadinaveen98-ship-it/bridge/blob/feature/bridge-b3c2r3b1-disposable-atomic-pg18-20261117/docs/engineering/V2_06B_B3C2R3B1_EVIDENCE.md); [original eight-file implementation brief](V2_06B_B3C2R3B_IMPLEMENTATION_BRIEF.md); [original 46-area matrix](V2_06B_B3C2R3B_ATTACK_MATRIX.md).

## 1. What is actually complete

- PR #61 changes **exactly eight previously approved paths**: one disconnected synthetic authorization guard under \`apps/api/src/v2/security\`, three grouped test modules plus an attested PG18 fixture, one named package test runner, one PG18 CI workflow and one evidence ledger.
- The latest exact PR-head CI shows **53/53 Node TAP pass, 0 fail/skip** on isolated PostgreSQL 18, plus **four predecessor workflow families success**: Foundation matching + PostgreSQL 16, role isolation PG16/18, actual 0008 PG18 actor proof and R3A *unsafe gap* negative-control red team.
- The **46-area audit is not 46 discrete passed TAP cases**: **42 PROVEN inside the disposable model**, **2 PARTIAL**, **2 BLOCKED**, **0 OPEN**. The two partial are R3B-38 and R3B-42; two blocked are R3B-39 and R3B-46. Details below.
- This is **synthetic data and fake ciphertext shapes** in a disposable GitHub Actions PostgreSQL 18 service. No production AES key management or E2EE is demonstrated.
- PR #61 is currently **DRAFT, UNMERGED**, and hosted V2 is **HOLD**. Do not infer that green CI authorizes production or that a branch is deployed.

## 2. Founder decision to make — two *separate* gates

### Gate L — merge an isolated security **test laboratory** to main (proposed exception, NOT yet approved)

**Proposed narrowly revised acceptance rule:** PR #61 may be reviewed for a *repository-only* merge once (a) all implemented offline tests pass on its **exact final head**, (b) the exact eight-file allowlist and absence of live imports/deployment triggers are verified, (c) all 46 areas have a truthful individually classified disposition, (d) 2 PARTIAL and 2 BLOCKED requirements are explicitly **carried to Gate H, never called green**, (e) its synthetic secrets/roles/table-owner bypass are clearly marked test-only and blocked from hosted use, and (f) the founder gives **fresh, express authorization for this exact exception and merge**. PR #61 must remain draft and unmerged until that happens.

**This is a proposal to revise the founder's original "full security matrix before merging" condition.** The prior condition remains controlling unless the founder explicitly changes it. An approval to plan, document, test or continue is **not** an approval to change the gate or merge PR #61.

Mergeable-as-a-lab means only that **test infrastructure enters the repository**, not that V2 feature behavior is integrated or security certified. No operational release status advances from it. A merge does **not** grant permission to expose, import or reuse the synthetic guard in HTTP routes or deploy database functions.

**Required Gate L audit checklist (all must pass and be recorded before requesting the merge authorization):**
1. Recheck PR #61 final HEAD, exactly eight paths; preserve original SQL migrations, production API routes, Flutter/Android, hosted V1 behavior and existing QA records.
2. Confirm \`start.mjs\`, \`http.mjs\`, \`postgres.mjs\`, \`auth.mjs\`, live messaging and outbox workers do not import the test-only guard; no application route, migrator or hosted service executes its SQL.
3. Exact HEAD PG18 suite + all independent PG16/PG18 role, PG18 actual-schema, R3A known-unsafe negative control and Foundation checks PASS. Check build/CI provenance and non-skipped TAP results.
4. The guard's CI/ACK/exact loopback DSN are **defense in depth, not production authentication**: environment variables can be set by an operator. The disposable fixture's independent Docker cluster attestation is essential; no production URL/secrets permitted.
5. Call out the intentionally privileged synthetic \`SECURITY DEFINER\` test command owner: it temporarily owns **12** enumerated context/secure tables and can bypass ordinary RLS through ownership. This must NEVER be copied to a production role, migration or runtime pathway; separate production threat modeling required.
6. All synthetic temporary roles/functions/policies, DB ownership transfers and passwords are cleaned up in disposable CI; no hosted data, paid providers or actual production keys.
7. Confirm Render manual deploy remains disabled; **do not deploy merely because code is merged**, and maintain a documented revert path for a test-only source regression.
8. Record explicit disposition of R3B-38, 39, 42 and 46 as unresolved, a named owning future stage, and the fact the legacy old-client writer race is not protected by test-only global mutex.

### Gate H — permit production V2 hosted integration, canary or launch (**HARD HOLD**)

**Independent founder approval and security evidence required, regardless of Gate L:**

- **R3B-38 PARTIAL:** Current lab evidence uses three independently restricted logins for 18 concurrent sends with contiguous sequences, a 1.5-second fail-closed lock timeout and *zero* retry. It does **not** prove production deadlock freedom, bounded retry semantics, throughput, load envelopes, tail latency, multi-worker scaling or operator SLOs. Require a production-specific concurrency/deadlock/retry design, stress methodology and acceptance budget before any hosted claim.
- **R3B-42 PARTIAL:** Disposable migration receipts, fixture cleanup, unchanged existing SQL and no hosted changes were verified. This is **not** a certified non-destructive Neon migration with actual preserved QA records. Require separately authorized read-only preservation baseline, reviewed additive migration/backout, row-level before/after reconciliation, independent hosted checks and human sign-off. No hosted reads or modifications are authorized by this proposal.
- **R3B-39 BLOCKED:** V1 GET/POST/SSE/bootstrap/Keep/Block/account writers do **not** share the synthetic transaction mutex; must implement independently approved old-client firewall and writer-compatible transaction boundary or safe-deny. No partial V2 enablement while old clients can bypass new revocation.
- **R3B-46 BLOCKED:** Hosted principal is owner/BYPASSRLS-level according to previously approved read-only diagnostic, not least-privileged V2 runtime. Production actor-to-DB authorization must be redesigned **without the laboratory's owner-rights bypass**, separately certified. Durable KEKs/nonces/recovery and provider budget/operations, safety case retention, Android V2, R0 physical device certification and final **138-case V2-16 What If?** remain separate gates. The latter stays **last**.
- Additional release blockers (age assurance, moderation capability, data retention, user support, V2-07 onward, privacy policy and app-store readiness) do not vanish because B3c security code compiles.
- **No hosted Neon role/schema/data/grant change, Render environment variable/deploy change, Android patch, paid provider or real user rollout** is authorized by this document or a potential test-lab merge.

### Outcome labels to use consistently

| Outcome | Meaning | Current status |
|---|---|---|
| \`LAB_IMPLEMENTED\` | The approved eight-file disconnected package exists in draft PR #61 | **YES** |
| \`LAB_TESTED\` | PG18 53/53 plus all four predecessor workflow families green on exact PR head | **YES** |
| \`LAB_AUDITED\` | 46 areas explicitly classified (42 proven / 2 partial / 2 blocked), not passed by fiat | **YES** |
| \`LAB_MERGE_EXCEPTION_APPROVED\` | Founder explicitly authorizes revised Gate L and PR #61 merge despite deferred four areas | **NO** |
| \`LAB_MERGED\` | PR #61 actually merged and CI/repo commit recorded | **NO** |
| \`HOSTED_V2_SECURITY_CERTIFIED\` | All separate trust, compatibility, key and operational gates verified | **NO** |
| \`HOSTED_V2_RELEASED\` | Founder-approved deployment and production acceptance | **NO** |

## 3. Threat-model and quality review of the split

**Benefits:** avoids treating hosted QA/production migration as a precondition to storing *isolated test source*, while preserving a verifiable security evidence chain and creating smaller approval units. It keeps iteration inexpensive (GitHub Actions disposable Postgres) and avoids premature cloud-role changes.

**Risks:** \`apps/api/src/v2/security/disposable_atomic_guard.mjs\` lives under the normal source tree, so a future engineer might import it in production; the synthetic HMAC and owner-bypassing function could be mistaken for a valid security architecture. A passing 53-test suite is not a proof of zero vulnerabilities. Documentation or CI guards alone do not eliminate this risk. Require negative import tests and explicit review at each source PR; consider a later separately approved relocation into a test-only tree if ongoing maintenance demands it. Such relocation is **outside** PR #61's founder-approved eight-file scope.

**Recommended founder choice:** authorize only the **gate separation as a documented governance decision first**; then independently approve the *exact* PR #61 merge if the checklist passes. Do not auto-merge from this planning work. If founder declines to revise the original rule, leave #61 draft until all 46 areas are certified (which requires separately scoped hosted projects).

## 4. Execution gates after this proposal

1. **NOW — documented proposal:** inspect verified artifacts, publish this decision record and an append-only roadmap marker in a docs-only draft PR. No application changes, no hosted access, no merge of PR #61.
2. **Next founder decision:** approve or reject the revised \`Gate L\` and, separately, authorize or withhold a specifically referenced PR #61 merge. If approved, perform final SHA/CI/diff/guard audit, switch PR to ready and merge only if all checks pass. A failed check leaves it draft.
3. **Future architecture stage:** prepare exact scope for production-safe nonowner identity/authorization, existing V1 writer firewall, least-privileged role cutover, rollback and performance/deadlock testing. *Documentation only* until explicit new approval.
4. **Future hosted stage:** independently authorize Neon/Render read-only preservation inspection, then any carefully staged migration/deployment under separate approval. No silent expansion into hosted operations or Android.
5. **Later:** R0 physical acceptance and final V2-16 comprehensive What If? review; public launch gated by privacy, safety and operational readiness.

**This record does NOT amend the previously approved merge condition by itself. The founder decides whether Gate L supersedes that part of the former condition.**
