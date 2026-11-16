# Bridge V2-06B — Privacy / Trust-Boundary Threat Model

**Classification:** PROPOSED; evidence-informed review document only, not completed penetration testing or compliance certification.
**Baseline:** main@d6d3267c88810e40a3529bfda3de64e2a13e4708. Linked [V2-06B Integration Security Brief](V2_06B_INTEGRATION_SECURITY_BRIEF.md), [V2-06A evidence](V2_06_EVIDENCE.md), [Architecture V2](ARCHITECTURE_V2.md), [Product Invariants V1](../product/PRODUCT_INVARIANTS_V1.md).
**Service reality:** Private synthetic Android + Node.js Render QA + Neon; V2-06A is an isolated PG16 synthetic engine and has no actual encryption or hosted messaging. No public beta; no verified age assurance, staffed moderation or release authorization.

## Assets, trust boundaries and attackers

**Protected assets:** message plaintext, live session authorization, mutual pair identity, recipient-only unread, safety-evidence snapshots, participant-account linkage, server signing/encryption keys, historical QA test fixture, audit/retention records, login tokens, operator secrets and user privacy rights.

**Boundaries:** Android <-> TLS/API; request token <-> trusted subject; Node process <-> app runtime DB role; DB owner/migrator <-> least-privilege runtime; session/relationship <-> per-message LIVE; recipient unread <-> separate delivery scope; delivery outbox/SSE <-> authorized body fetch; backup/restore <-> deletion/revocation ledger; private QA <-> public beta.

**Threat actors/conditions:** third-party room-ID guessing; stale or modified Android client; blocked former participant; compromised/test account; stolen JWT; database dump attacker; app runtime compromise; operator/secrets exposure; intentional and accidental key reuse; offline/disconnected clients; racing requests; backup restore that revives expired/private data. Don't assume all threats can be defeated through encryption alone.

## Threats, mitigations and gates

| ID | Attack / failure | Consequence | Proposed control | Evidence required / stage |
|---|---|---|---|---|
| TH-01 | Guess or recycle room ID through generic /v1/.../messages | Unauthorized prior conversation replay | V2-only data store plus V1 marker/version gate and safe-deny on stale clients | Complete endpoint inventory; negative old/new API test; V2-11 |
| TH-02 | Client forges actorId, connection, adult verification or approval | Cross-account reading/impersonation | Signed token -> subject -> database account; central policy and locked participant/relationship checks | Policy and HTTP+PG deny matrix; B2/G1 |
| TH-03 | One-sided Keep or stale vote/expired source reused | Unwanted mutual or access | Two current Keep votes; atomic V2-05A Keep; same mutex and server time | Cross-stage Block/Keep/expiry race tests; B2 |
| TH-04 | Existing V1 message body stores real V2 content | SQL/backup/plaintext exposure | Dedicated V2-only metadata/ciphertext tables; no real body on V1 path | DDL tests, SQL-only read review; B1 |
| TH-05 | 0005 bytea fixture mistaken for real encryption | False confidentiality guarantee | Established AEAD with explicit nonce/tag/AAD/key lifecycle and tamper tests | Cryptographic vectors and key review; B1 |
| TH-06 | Reused AES-GCM nonce or swapped encrypted ciphertext scope | Confidentiality/integrity compromise | Nonce generation and per-key limits; message+room+recipient+purpose AAD; no key sharing with cursor HMAC | Collision/usage bounds and replay/tamper tests; B1 |
| TH-07 | Secret key checked into repo, leaked to logs, stored with DB or retained after compromise | Bulk decryption | Secret boundary, versioned key IDs, separate privileges, redacted logs, rotation/incident procedures, planned envelope encryption | Review key lifecycle and disaster recovery; B1/B2 |
| TH-08 | Render runtime role can bypass RLS or use elevated DDL | DB-wide read/write blast radius | Distinct non-owner/no BYPASSRLS runtime, RLS and app policy, separate migration identity | Founder-approved runtime role evidence, no secrets disclosed; G1 |
| TH-09 | At-least-once SSE or crash duplicates consume unread or reset 30m timer | Duplicate UI/misleading session state | Unique message ID/idempotency, outbox hints only, cursor/dedup and ack-after-present | Concurrent send, crash/retry, lock-delay tests; B2/V2-10 |
| TH-10 | Closed direct room contains undelivered recipient message | Either lost message or illicit old-room transcript | Separate recipient encrypted unread copy; no room navigation; 7d cap | D1-close then unread test, hard expiry and no history access; B2/V2-10 |
| TH-11 | Stale block/unmatch under in-flight send/ack | Messages delivered after safety revocation | Shared advisory/row lock order and fresh DB authorization on each body fetch | Block vs send/ack/End concurrency tests; B2/G1 |
| TH-12 | Archived local Android cache, logs, notification preview or OS backup | Free previous history reappears | Minimal client cache lifetime, encrypted device secrets where appropriate, exclude automatic backups and previews, clear on revoke | Physical phone+tablet OS kill/reinstall/backup checks; V2-10/G2 |
| TH-13 | 15m recovery credential remains valid after revocation/7d | Protected bytes exposed | Digest-only storage, recipient+envelope+version binding, expire at min(ack+15m, accepted+7d), block/revocation overrides | Token security and timing tests; B2/V2-10 |
| TH-14 | Report token relies on already-purged ordinary content | False promises/evidence loss | Separate V2-07 safety snapshot while content exists; restricted audit/legal hold independent of free history | Report close/24h/7d cases; V2-07 |
| TH-15 | Backup restore revives deleted/expired/blocked content | Privacy breach and stale account access | Reapply revocation/deletion ledger before recovered data is addressable; staged restore acceptance | DR and deletion policy tests; V2-08/V2-12 |
| TH-16 | Green isolated CI mistaken for secure deployed application | Premature launch | Separate source, integration, physical, privacy, operational and legal signoffs | Known SHA and signed gate inventory; R0/G1/G2/V2-16 |

## Proposed guardrails for each security review

### Confidentiality
- Verify that a DB-only attacker sees only ciphertext/necessary metadata, not plaintext. Be explicit that a compromised app runtime with keys can decrypt: this is **server-side at-rest encryption**, not E2EE.
- Verify that ciphertext decryption binds exact message metadata and purpose; fail closed on missing key, bad tag, wrong scope or wrong recipient.
- Verify no real message bytes in the existing bridge_messages.body, V1 SQL query results, analytics, exception logs, OpenTelemetry traces, SSE, push or test fixtures.

### Authorization
- Verify account status, membership, block, relationship, valid session and authoritative clock at the moment of each operation under locks. Authenticated ID alone is insufficient.
- Test guessed UUIDs, wrong pair, replayed signed cursor, stale password/token, device reinstall and multiple devices. Return uniform unavailable errors for protected resources.
- Verify RLS under the **actual runtime principal** after a separately approved role inspection and against non-owner roles, not only as an owner in disposable PostgreSQL.

### Retention and integrity
- Separate immediate logical denial from future physical purge and restricted incident evidence. Seven-day unread is not a seven-day chat-history feature.
- Acknowledge after presentation; a crash before ack must remain safely recoverable; replay after ack capped at fifteen minutes and seven days from acceptance. No indefinite token regeneration.
- Migrate only new V2-synthetic rows under explicit migration approval; existing four legacy QA message bytes and original room remain unchanged.
- Backup/restore and encryption key loss recovery must not reauthorize records that were already deleted/revoked.

## Release stop rules

STOP rather than deploy when any of these is true:
1. A prior/ended random or direct transcript is reachable through V1, V2, SSE or Android cache.
2. A DB dump or log contains real V2 plaintext content.
3. An outsider or blocked peer can fetch ciphertext plaintext or recipient unread by guessed ID.
4. A migration rewrites legacy QA messages/rooms/slots, or attempts physical deletion without founder approval.
5. The service uses a privileged runtime role without documented authorization and read-scope review.
6. Cryptographic key custody and restore/rotation rules are unresolved or test-only fixture bytes are mislabeled encrypted.
7. Device QA, abuse response, actual adult eligibility, moderator operations, privacy/legal controls or final V2-16 release gate are missing for public beta.

## Decision log

- **Proposed, not approved:** independent V2 private store, server-side AEAD, key-purpose separation, no E2EE claim.
- **Still open:** provider/key custody and costs, explicit nonce construction, detailed 0008 DDL, old-client safe cutover, exact ack-boundary tie breaker, real DB principal audit, Android cache policy and runbooks.
- **No security certification performed here:** this is a threat model and required-test map. Real implementation and penetration tests await separately scoped authorization.

Guidance checked 2026-11-16: OWASP Cryptographic Storage Cheat Sheet, NIST SP 800-38D, OWASP API Security Top 10 API1.
