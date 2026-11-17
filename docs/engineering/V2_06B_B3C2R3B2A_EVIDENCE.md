# Bridge B3c-2R3B-2A — PostgreSQL 18 trust-boundary feasibility evidence

**Status: IMPLEMENTATION CANDIDATE / CI NOT YET CERTIFIED / UNMERGED / HOSTED GATE H = HOLD_V2.**
**Founder approval:** Exact seven-file disconnected test scope only, 2026-11-17. No live user identity, hosted DB role/grant/env or Render deployment permitted.
**Baseline:** `main@58eee1236e587c06a6c62460d1eb79508b384c86`; existing PR #66 repository-only workflow merged, existing QA untouched.

## Exact approved seven-file change boundary
1. NEW `apps/api/tests/v2/trust_boundary/role_fixture_pg18.mjs`
2. NEW `apps/api/tests/v2/trust_boundary/actor_and_role.test.mjs`
3. NEW `apps/api/tests/v2/trust_boundary/capability_adversarial.test.mjs`
4. NEW `apps/api/tests/v2/trust_boundary/legacy_writer_races.test.mjs`
5. MOD `apps/api/package.json` (one additional test script)
6. NEW `.github/workflows/bridge-trust-boundary-pg18.yml`
7. NEW `docs/engineering/V2_06B_B3C2R3B2A_EVIDENCE.md`

## Candidate comparison, never a production decision

- **Candidate A / UNSAFE:** user-selected `SET LOCAL bridge.insecure.actor` and table-level RLS show a forged actor can read synthetic other-user rows. The expected successful adversary read is a **reproduced vulnerability**, not a privacy PASS. It applies to a throwaway probe table, **never** actual secure-message grants.
- **Candidate B / LAB FEASIBILITY ONLY:** independent PostgreSQL 18 nonowner LOGINs and a NOLOGIN command executor, without ownership of checked-in secure tables or context tables; the runtime obtains only EXECUTE on a fixed test command. The executor has limited SELECT grants with disposable RLS policies, validates a transaction/operation/actor/target/recipient/digest/nonce/expiry/session-bound HMAC via another role's SECURITY DEFINER verifier, checks current direct-session eligibility, Blocks and membership before metadata access, then applies room-scoped RLS to actual 0008 message metadata. Data bytes are never read/decrypted by this command.
- The issuer key is independently inaccessible to the SQL runtime LOGIN, **but it is synthetic and locally held by the test harness**. This does not demonstrate a separately deployed production signing service, real issuer authentication, production JWT rotation, real encryption/KMS, persistent replay store, large-scale throughput or a safe hosted role cutover.
- The NOLOGIN command executor's disposable context policies are broad `SELECT USING(true)` grants, while runtime lacks any direct SELECT. This is **not a vetted production least-privilege / row-scope design**; further -2C design review must reduce executor authority and audit functions/roles. Existing fixture's test owner-based RLS bypass is explicitly not used by the new executor role.
- Replayed capability and role spoof attempts must be denied, with actual independent connections and key-table privilege denial; this proves a constrained SQL credential boundary, not protection if the issuer is compromised.

## Legacy red-team gaps — expected FAIL under security acceptance

- `TB-L01`: unmodified legacy `createPostgresService(...).sendMessage` still writes plaintext to a V2-marked synthetic direct conversation. Test success **means the V1 firewall is MISSING**; block B3c-2R3B-2B until old-client routes are protected.
- `TB-L02`: legacy `unblock` commits without the common advisory mutex while it is held by another PostgreSQL session. Test success **means writer coordination is MISSING**. Multiwriter/producer races, LIVE/ACK, V1 SSE, Keep, bootstrap, admin writer pathways and the 24-case F01–F24 gate remain **BLOCKED/UNTESTED**.
- V1 test behavior is exercised in a synthetic throwaway database only; no existing hosted V1 QA data is modified.

## CI/evidence acceptance (to update from actual GitHub Actions)

- Enforce exact known localhost URL, CI + dual ACK, container-image PostgreSQL18 identity and **independent Docker system identifier** before any test DDL. The checked-in unmodified 0001–0008 migrations must apply with 37 tables, five migration receipts and three default-deny secure RLS tables.
- Record failing/denied negative cases and distinguishing positive cases with TAP numbers, exact PR SHA and runs. Fail on any forged actor access, privileged role inheritance, missing issuer key isolation, teardown error or false-green assertion.
- Confirm existing predecessor PG18 53/53 Gate L, PG16/18 role matrix, actual 0008 PG18, R3A deliberate red-team and Foundation CI remain green on final code SHA. Do not claim these pass in advance.
- Explicitly verify exact seven files, no imports in hosted `apps/api/src/start.mjs`, no original SQL migration changes, no Neon, Render, Android or QA data touches.
- **Exit state now: IMPLEMENTED_ON_BRANCH / TESTING_PENDING.** A passing isolated capability prototype is never `HOSTED_READY`; B3c-2R3B-2B/-2C/-2D and Gate H need separate founder approvals. PR remains unmerged until reviewed.
