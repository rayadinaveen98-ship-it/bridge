# Bridge B3c-2R3B-2 — staged implementation and founder approval brief

**Status: DOCUMENTATION-ONLY PROPOSAL / ZERO PRODUCTION IMPLEMENTATION APPROVED.**
**Baseline:** `main@5b9e437422f946cb668affd9048e1d0ff07ce2ce`; PR #61 Gate L test laboratory merged, postmerge 53/53 PG18 TAP + five workflow families success. **Gate H HOLD.** Original V1 QA and all hosted roles/services remain unchanged.
**Related:** [production trust-boundary design](V2_06B_B3C2R3B2_TRUST_BOUNDARY_DESIGN.md), [V1 compatibility and writer audit](V2_06B_B3C2R3B2_V1_COMPATIBILITY_MATRIX.md), [Gate L/H decision](V2_06B_B3C2R3B1_GATE_SPLIT_DECISION.md), [R3B1 lab evidence](V2_06B_B3C2R3B1_EVIDENCE.md).

## Executive decision

The next work is **not an APK or hosted deployment**. Current known problems require validating a production-feasible independent actor-to-DB trust boundary and preventing older V1 clients from bypassing revocation controls. An unsafe but easy solution (copy the test-only 12-table-owner gateway) is rejected. The path is separate **offline proof → V1 firewall/writer integration → reviewed database role migration → controlled hosted canary → Android/device acceptance**. Each changes distinct trust boundaries and needs an explicit founder approval.

The documentation in this PR proposes the stages below, but does NOT grant approval to run any of them, change hosted credentials or amend the release roadmap without founder authorization. No paid KMS/signing provider is selected.

## Stage B3c-2R3B-2A — recommend as NEXT, disposable trust-boundary discrimination

**Goal:** On checked-in migrations `0001..0008`, verify an independent nonowner PostgreSQL 18 LOGIN can successfully execute a *truly authorized* fixed V2 command with role and RLS boundaries, while a holder of that runtime SQL credential cannot forge actor identity or escape the command. Compare production-reasonable candidates A/B (and C if neither is safe) without choosing a hosted issuer or SQL migration.

**Proposed exact SEVEN-file code allowlist (founder approval REQUIRED before touching any):**
1. NEW `apps/api/tests/v2/trust_boundary/role_fixture_pg18.mjs` — attested disposable PG18 + checked-in migration receipt, generated distinct actor/issuer/runtime/executor/migrator role identities and independent LOGINs; fail-closed cleanup. No hosted DSN.
2. NEW `apps/api/tests/v2/trust_boundary/actor_and_role.test.mjs` — two candidate RLS/command policy patterns, positive legitimate current access, forged actor/GUC/role/EXECUTE/owner/PUBLIC/GRANT denial.
3. NEW `apps/api/tests/v2/trust_boundary/capability_adversarial.test.mjs` — operation/target/transaction/expiry/replay/issuer/recipient/payload-digest binding, SQL credential theft simulation, key access denial, `search_path`/temp/function spoof, JWT rotation/revocation under synthetic IDs. **A synthetic signer is not by itself a certification**: require independent issuance/verification boundary.
4. NEW `apps/api/tests/v2/trust_boundary/legacy_writer_races.test.mjs` — exercise existing V1 writers and proposed V2 gate against shared Block/Keep/account/close/participant conditions; where source is not currently coordinated, **expect a FAIL/reproduced gap**, never a fake passing green test.
5. MODIFY `apps/api/package.json` — add exactly one `test:v2:trust-boundary:pg18` script; preserve previous scripts.
6. NEW `.github/workflows/bridge-trust-boundary-pg18.yml` — dedicated `postgres:18` disposable GitHub Actions proof with immutable loopback DSN, no secrets, checked Docker cluster system ID and independent nonowner users, no deployment.
7. NEW `docs/engineering/V2_06B_B3C2R3B2A_EVIDENCE.md` — decisions, negative cases, actual TAP, corrected/failing cases, independent final-head CI, cleanup, role grants and blockers. Never include actual account identifiers or credentials.

**STOP conditions:** Fixture cannot prove independent signer/DB trust, role lacks a safe row-scoped policy, an owner/SECDEF bypass remains, any forged actor succeeds, old V1 writer race is labelled safe without repro/remediation, missing CI attestation, accidental real DSN, or scope expands. A passing offline prototype never counts as Gate H production approval.

**Acceptance:** Explicit A/B comparison record; 100% of *required* deny tests passed for any candidate recommended; unaddressed attack cases are marked BLOCKED rather than omitted. Original R3B1 53/53 postmerge tests, PG16/18 roles, actual PG18 secure-schema proof, R3A unsafe negative control, Foundation matching+PG16 all still pass. Source diffs confined to these seven files. No production routes, original migrations, Android, Neon or Render touched.

**Important limitation:** With no production issuer/provider selected, stage -2A is a security **feasibility test**, not a deployable actor proof. A result `CANNOT_PROVE` is acceptable and should block any production selection rather than weaken tests.

## Stage B3c-2R3B-2B — V1 privacy firewall and compatible writer protocol

**Status: PROPOSED; NOT IMPLEMENTED; exact file allowlist NOT YET APPROVED.** Depends on -2A architecture review and frozen V1 preservation baseline.

- Introduce a V2-marker **database transactional guard** for every V1 entry point in the 24-case matrix. Preserve existing V1 QA if marker NULL/legacy and state/subject eligible; deny V2 marked room IDs for old GET/POST/SSE/Keep/vote/bootstrap/peer/connection listing without a timing/existence oracle.
- Reconcile `postgres.unblock` with safe transaction locking. Ensure old V1 Block remains available for user safety, account status/revocation actions cannot race V2, and unblocking never re-opens a Keep/room or restores old history.
- Choose a uniform lock protocol with explicit room/account/connection order and bounded waits. Existing V1 room-first paths and V2 mutex-first paths need deterministic mixed-worker deadlock tests. A global 714411 mutex may be a temporary compatibility fence but is not the final throughput design.
- Add network handler and underlying repository tests, pre-existing V1 QA regression, stream authorization/publish-time denial and payload-free outbox tests. Do not silently reroute existing V1 to V2 or enable premium/history.
- Produce a separate **exact file allowlist** after -2A evidence, request founder approval for production source changes, and do not merge until both V1 preservation and V2 safe-deny tests pass.

**Minimum B acceptance:** all F01..F24 matrix rows individually tested and classified; no V2 read, write, SSE, Convert or old-client user metadata leaks; V1 existing QA unaffected; no bypass by direct repository call; Block/Unblock races deterministic; reports still accepted safely; no unauthorized text in outbox. Do not claim physical Android acceptance.

## Stage B3c-2R3B-2C — production-capable role and command implementation

**Status: NOT AUTHORIZED; AFTER -2A and -2B.** An approved trust boundary must replace the test-only 12-table-owner gateway with a nonowner command executor and audited RLS/least-grant role. Requires explicit issuer/validator choice, no actor GUC spoofing, privilege review, transaction/locking and session reset tests.

- Code PR and additive SQL migration PR must be **separate** from actual hosted execution, with exact scope approval for each. Original `0001..0008` migrations never edited in place.
- Require independent runtime LOGIN, direct-SQL attacker tests (forged identities, elevated privileges, table reads, creation rights), `SECURITY DEFINER`/RLS/path catalog review, JWK or signer rotation/outage handling, explicit TTL/nonces/capability replay protection, private key placement and no source/CI secret exposure.
- Include production-like congestion/deadlock injection, bounded retry and idempotency; record throughput, tail latencies and error budgets. No R3B-38 certification without these tests.
- Do not reuse the disposable test credential names, generated HMAC secrets, ownership-transfer fixture, bootstrap simulator or environment ACK guard.

**Acceptance:** separate independent code review and no hosted deployment. Host-safe design must genuinely deny an arbitrary compromised SQL/runtime caller for another actor, not just exercise a signed mock.

## Stage B3c-2R3B-2D — hosted preservation, role migration and rollback

**Status: BLOCKED / NOT AUTHORIZED.** New founder approvals required for **(i) read-only hosted Neon/Render preflight** and separately **(ii) any role/schema/grant/credential/Render change**; approval for one is not approval for the other.

- Before any change, preserve privacy-safe metadata evidence for existing live V1 QA accounts/rows, migration ledger/checksum, grants and principal, a recoverable database state, service deployment SHA and operational test owners. Do not export PII, plaintext messages or secrets to public GitHub.
- Separate migrator and runtime credentials, add versioned migration(s) and permissions, verify after-step row counts and rollback in a *private synthetic canary*, keep V1 QA available. Never broadly change public grants to temporarily make tests pass.
- Rollback before V2 enablement can return to verified V1 service. After V2 privacy activation, a rollback must **not re-grant old read/write access to V2**; use safe-deny or forward-fix.
- Maintain Render autoDeploy disabled until explicit deployment approval. No contact with Neon service, no actual hosted data query, no live credential provisioning during stages -2A or -2B.
- Production age assurance, moderation, safety evidence and key custody have other independently approved work; this package does not waive them.

**Acceptance:** private evidence proves V1 QA preservation and reliable fail-closed rollback; least-privileged role actually in live process; independent hosted security and cross-worker negative tests; founder-hosted canary approval. This is the gate for R3B-42 and part of R3B-46, not a currently achieved result.

## Dependencies and release sequencing

| Gate | Precondition | Outcome when valid | Status |
|---|---|---|---|
| Gate L test-only source | PR #61 exact eight-file checks and postmerge CI | Synthetic lab on main | **IMPLEMENTED/TESTED** |
| -2A offline trust | Founder approves exact seven-file scope, proves identity and nonowner authorization | Candidate design evidence | PROPOSED |
| -2B V1 fence/race | -2A evaluated, separate scoped source approval | Old-client safe deny + writer compatibility | BLOCKED |
| -2C production command | Separate code/SQL and security review | Production-capable isolated implementation, not deployed | BLOCKED |
| -2D hosted cutover | Independent hosted preflight and mutation approvals | Controlled role/migration proof | BLOCKED |
| B3c-3 crypto / V2-07..09 | Key provider/cost/retention/evidence policy | Durable secure and safety lifecycle | BLOCKED |
| V2-10 Android / G1-V2-11 / V2-12..15 | Integration, abuse, scale, UI, operations, accessibility | Physical beta readiness | BLOCKED |
| R0 phone/tablet and V2-16 final 138-case What If? | All preceding gates complete | Release review by founder | OPEN / LAST |

## QA, security, operations and business quality thresholds

- No code review substitutes for a disposable test with **two independent real LOGINs** under PostgreSQL 18 and checked-in schema; never rely on owner `SET ROLE` or a static SQL mock for a security PASS.
- No V2 post, old-client SSE event, free history or unauthorized ciphertext leaks under all negative cases, including after token expiry, suspension/Block and while another writer commits. All errors must fail closed without data side effects.
- Memory/pool/transaction cleanup, bounded lock waits, safe outbox idempotency, steady-state latency, CPU/DB connection consumption and deployment rollback must be measured once realistic code exists. Do not invent SLO successes.
- Preserve role/branding and existing working behavior in unrelated Android/features. Record exact evidence (commit SHA, run IDs, TAP counts, redaction checks, environment status, physical tester sign-off).
- Minimize infrastructure cost: re-use disposable GitHub Actions PostgreSQL; **NO KMS/vendor/subscription/paid security platform** without a written cost/latency proposal and founder consent.
- Regulatory/privacy obligations, moderation, logging and user support are release requirements; a green PG18 test package is not revenue or store readiness.

## Requested next founder decision — not assumed

**If approved, authorize only B3c-2R3B-2A implementation exactly within the seven-file synthetic/disposable PostgreSQL 18 scope above.** Preserve original app, all V1 QA data, PR #63 (still draft until reconciled), Neon, Render, Android, 0001..0008 migration files, hosted user identities and every production secret. Verify new negative tests and all predecessor CI on exact PR HEAD before any Gate L-style merge; production Gate H and stages -2B/-2C/-2D remain independently gated.

This proposal deliberately does NOT ask to implement G1/V1 firewall, choose role providers, create production keys, run SQL against Neon, or publish an APK.

