# Bridge B3c-2R3A evidence ledger

Status: OFFLINE PG18 RED-TEAM GAP REPRODUCED; 15/15 NODE TAP PASS AT FIRST CODE HEAD, FINAL EVIDENCE-HEAD CI PENDING. NOT REMEDIATED, NOT HOSTED.
Baseline: main 629697fe68f3af9f0542ccd172c53e71ad4bac40.

Exact six paths:
1. apps/api/tests/v2/privileges/b3c2r3_revocation_gap.test.mjs (NEW)
2. .github/workflows/bridge-revocation-gap-pg18.yml (NEW)
3. apps/api/package.json (one script added)
4. docs/engineering/V2_06B_B3C2R3_GAP_MATRIX.md (NEW)
5. docs/engineering/V2_06B_B3C2R3_EVIDENCE.md (NEW)
6. docs/ROADMAP.md (append-only)

Acceptance checklist:
- [x] Existing PG18 fixture attested CI-only loopback URL/account/ACK, major version and independent Docker cluster ID before DDL
- [x] Applied actual checked-in migration files 0001–0008 to disposable PG18; 37 Bridge tables and five checked migration receipts
- [x] All seven categories of privacy-gap reads reproduced in disposable PG18; BOTH Block directions confirmed, and each field reset in test fixture (KNOWN GAP)
- [x] Blocked user INSERT permitted under sender-only synthetic RLS; test transaction rolled back and original two seeded metadata rows remained (KNOWN GAP)
- [x] Revoked UNREAD and unsigned/no-context access still denied; no raw V1/case/history access through restricted test role
- [x] Exact six-file diff at code head 4001791f41bd5f91896b25d2acec20a8a3f109f2; existing Foundation and PG16/18 role matrix passed on same first PR-head run
- [ ] New evidence revision needs independent exact-head CI before merge. All FOUR workflow families passed on first code head 4001791f; see run IDs below.

Interpretation: A passing red-team test means the prototype policy is UNSAFE to deploy. B3c-2R3B remediation and hosted least-privilege migration remain separate founder-gated stages. V2 stays HOLD.

## Real first-code-head evidence (2026-11-17)

- [Red-team PostgreSQL18 #43945625737](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625737): **15/15 TAP PASS**, 13 nested checks and two parent tests; 0 failure, 0 skipped. **Interpretation: every affected security gap was SUCCESSFULLY REPRODUCED, not fixed.** The synthetic 0008 sender-only/recipient-only policy continues to expose LIVE after account suspension/eligibility/age revocation, Block, leaving, ending and close, and permits a blocked metadata write. Test signed transaction rolls it back.
- [B3c-2R2 actual PG18 predecessor #43945625587](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625587): SUCCESS. [B3c-2R PG16/18 role-isolation #43945625731](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625731): **both PG16 and PG18 jobs SUCCESS**. [Foundation #43945625611](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/43945625611): matching and disposable PG16 integration **both SUCCESS**.
- Red-team test uses **real checked-in 0001–0008 SQL and fake ciphertext-shaped bytes, not actual encryption**, plus a one-time generated synthetic PG18 service; all roles/functions/policies/rows remain disposable. The workflow never receives production secrets, Neon URLs or user data.
- The old disconnected B3b-2 implementation already checks account and Block state in owner-authorized PG16 transactions. The reproduction **does not imply that code is insecure**; it shows that the newer nonowner SQL prototype is missing equivalent current-eligibility enforcement. Do not transplant the RLS prototype into live service.
- **Mandatory next B3c-2R3B gate:** design an independently authenticated nonowner transaction path where signature/actor mapping, both accounts, participants, Block, room and connection state, expiry and read/write policy all share a single transaction and coherent lock order, including Block/revocation writers. Explicit negative race tests must fail closed before any hosted cutover; founder review of exact implementation paths and role privileges required.
- Hosted Render still runs V1 QA under owner/BYPASSRLS; no hosted V2 SQL is active, no live data exposed by this lab finding. R0 phone/tablet QA and G1 old-client firewall open, B3c-3 durable keys pending; V2-16 final What If? last.
