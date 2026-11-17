# Bridge B3c-2R3B-2A — PostgreSQL 18 trust-boundary feasibility evidence

**Status: TESTED / DISCONNECTED PG18 / DRAFT-UNMERGED / HOSTED GATE H = HOLD_V2.** **28/28 new TAP** on reviewed implementation head `6160829ceedb204d0b033040b1b645206166f133`; five predecessor workflow families GREEN. The proposed least-privilege design remains **NOT production-certified**.
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

## Verified implementation-head CI evidence (2026-11-17)

**Audited implementation head:** `6160829ceedb204d0b033040b1b645206166f133` on [draft PR #67](https://github.com/rayadinaveen98-ship-it/bridge/pull/67), exact seven-file change scope. The dedicated new negative tests report **28/28 TAP**, zero failures. This evidence-only update creates a newer commit; **reverify all CI on its final SHA before any merge**, and do not mistake an earlier code-head success for final-head verification.

| Workflow / implementation head | Run | Evidence |
|---|---|---|
| B3c-2R3B-2A restricted PG18 PR | [44071286005](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071286005) | **28/28 TAP**, zero fail/cancel, SUCCESS |
| B3c-2R3B-2A restricted PG18 branch | [44071277930](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071277930) | **28/28 TAP**, zero fail/cancel, SUCCESS |
| R3B-1 atomic predecessor | [44071286198](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071286198) | SUCCESS (prior 53/53 offline suite preserved) |
| R3B-2 actual schema PG18 | [44071286027](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071286027) | SUCCESS |
| R3B-2 PG16/18 restricted roles | [44071285917](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071285917) | Both role jobs SUCCESS |
| R3A explicit unsafe revocation negative control | [44071286025](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071286025) | SUCCESS means former gap remains intentionally reproduced |
| Foundation matching and PG16 integration | [44071277912](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/44071277912) | Both jobs SUCCESS |

**New TAP breakdown:** 2 top-level tests including nested A/B/negative-control subtests, 28 assertions reported by Node's TAP runner. All tested unauthorized SQL access, role elevation, forged op/actor/target/recipient/digest/nonce/transaction/expiry, replay, Block/room/participant revocation were denied on the **fixed metadata command**. Additional tests `TB-C08..TB-C10` verified post-issuance Block denial followed by safe recovery/replay denial, attacker-created temporary table and `search_path` spoof resistance, and synthetic JWT key rotation/expiry rejection. This is **not** a hosted per-token revocation service or a production signing-provider test. The A model's forged-GUC read is an EXPECTED UNSAFE REPRODUCTION, not a safe result. The V1 plaintext POST and uncoordinated Unblock are also EXPECTED UNSAFE REPRODUCTIONS, not firewall passes. A total of 28 TAP successes must **not** be interpreted as 25 production privacy guarantees.

**Test run diagnostics:** The three additional checks were appended within the existing seven-file allowlist and passed in final implementation-head CI. An initial nested Node-test scheduling mistake timed out; corrected without changing security assumptions. A later assertion attempted to inspect an intentionally private issuer schema directly and correctly received PostgreSQL 42501; privilege inspection was moved to the disposable administrator catalog while retaining runtime permission-denied assertions. These intermediate red CI attempts are not hidden or counted as success.

**Attestation/cleanup:** Existing PG18 fixture independently verifies one Docker postgres:18 container, same PostgreSQL cluster system identifier, fixed loopback URI, PostgreSQL major, CI+ACK, real 0001..0008 checksums, 37 checked-in tables, five migration receipts and three secure RLS tables before test role DDL. Generated role connections, scratch policies/schemas and synthetic key are cleaned up. The command executor owns **no** checked-in table; unrestricted SQL LOGIN has no secure ciphertext/history grants. Tests use generated synthetic IDs exclusively.

## Explicit GATE H HOLD and next work

- **CANNOT CLAIM production safe authorization**: locally held test HMAC issuer key, non-production SQL command for metadata read only, executor context SELECT policies `USING(true)`, and old V1 writers missing common lock/marker deny remain unacceptable for hosted V2.
- **BLOCKED:** R3B-38 production throughput/deadlock/retry, R3B-39 V1 writer coordination/F01..F24 tests, R3B-42 preservation/hosted role cutover, R3B-46 integrated runtime+Android. No live key custody, real signing authority, persistent per-JWT denylist, encryption, SSE isolation or premium history certified.
- **Next, independent founder approval:** B3c-2R3B-2B exact V1 privacy firewall and writer coordination file scope, followed by -2C production issuer/nonowner SQL role + -2D hosted read-only preservation/migration reviews. Keep final 138-case V2-16 What If? last.
- **Do not merge or deploy under this evidence update.** PR #67 remains draft; no hosted data/query/migration, source route, Android, real credential, or payment touched.
