# Bridge B3c-2R3A — revocation gap red-team and atomic-security plan

Status: APPROVED offline-only V2 continuation. THIS STAGE DOES NOT REMEDIATE THE GAP.
Baseline: GitHub main 629697fe68f3af9f0542ccd172c53e71ad4bac40.

The prior disconnected PG16 B3b-2 domain layer has account status, peer eligibility, Block, room and relationship checks, including some lock/race tests. The newer B3c-2R2 disposable PG18 SQL policy validates sender-only LIVE and recipient-only UNREAD but DOES NOT check age, suspension, Block, leaving participants, closed rooms or ended connections. That synthetic policy is not deployed in hosted QA.

The new executable test asserts that each gap currently exists in disposable PG18 using original checked-in 0001-0008 schema and fake ciphertext-shaped rows. PASS means the gap was successfully REPRODUCED; NEVER interpret PASS as demonstrating privacy safety. Both-direction Block, account suspension, age verification removal, safety restriction, member exit, direct connection ending, conversation closure and blocked INSERT must be recorded. Existing revoked-UNREAD and unsigned-session denial controls remain negative safety checks.

The actual Render runtime still has owner/BYPASSRLS privileges and hosted V2 tables do not exist. This is a release blocker but NOT evidence of a current V2 data breach.

Future B3c-2R3B must select and formally review one production trust boundary that verifies JWT actor-to-account mapping, locks both accounts and peer/room/relationship in deterministic order, synchronizes Block/account state writers, checks token expiry before commit, and restricts all LIVE/UNREAD/ACK/RECOVER/send operations within the same trusted transaction. A custom actor GUC is not identity; SECURITY DEFINER/owner views can bypass RLS. Never promote the B3c-2R2 synthetic HMAC verifier or broad table policies to production. Validate old V1 GET/POST/SSE/Keep firewall before any V2 ID becomes externally reachable.

Exact six-file scope: new isolated PG18 red-team test, new isolated workflow, add one npm script, this design, a separate evidence ledger and append-only docs/ROADMAP.md. No production app code, migrations, Android, Neon, Render, QA users, keys, paid providers or hosted grants/roles in scope. Any actual role/credential migration and V2 activation need separate founder authorization. R0 real-device acceptance open; final V2-16 138-case What If? LAST.
