# Bridge B3c-2R3A evidence ledger

Status: TEST IMPLEMENTATION CANDIDATE, CI UNVERIFIED.
Baseline: main 629697fe68f3af9f0542ccd172c53e71ad4bac40.

Exact six paths:
1. apps/api/tests/v2/privileges/b3c2r3_revocation_gap.test.mjs (NEW)
2. .github/workflows/bridge-revocation-gap-pg18.yml (NEW)
3. apps/api/package.json (one script added)
4. docs/engineering/V2_06B_B3C2R3_GAP_MATRIX.md (NEW)
5. docs/engineering/V2_06B_B3C2R3_EVIDENCE.md (NEW)
6. docs/ROADMAP.md (append-only)

Acceptance checklist:
- [ ] Loopback-only, ACK and independent Docker PostgreSQL18 cluster attested before DDL using existing B3c-2R2 fixture
- [ ] Real checked-in migrations 0001–0008 tested on disposable PG18
- [ ] Suspension, missing age check, safety revocation, both Block directions, participant exit, relation ended and room closed still permit LIVE (KNOWN GAP)
- [ ] Blocked write still permitted in existing synthetic policy and rolls back in fixture (KNOWN GAP)
- [ ] Revoked UNREAD and missing signed actor continue to deny
- [ ] Exactly six changed files; existing Foundation and PG16/PG18 role tests pass
- [ ] Final PR-head jobs verified; merge only on green CI; no hosted changes

Interpretation: A passing red-team test means the prototype policy is UNSAFE to deploy. B3c-2R3B remediation and hosted least-privilege migration remain separate founder-gated stages. V2 stays HOLD.
