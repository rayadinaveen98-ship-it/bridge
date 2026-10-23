# M1 database-backed service slice — October 23, 2026

## Implemented in repository
- Standalone loopback HTTP gateway with RS256 verification, bearer JWT claims, strict JSON body/identifier parsing and no public direct-table access.
- A PostgreSQL pool-backed service supporting supported-language bootstrap, preferences, transactional queue enrollment and one-to-one matching, polling and cancellation, messages, mutual-connection votes, blocks, report intake, conversation closure and connections list.
- **Actual query transactions** with explicit \`BEGIN/COMMIT/ROLLBACK\`, a temporary global advisory lock for matching, queue locks, unique per-account active slots and server-owned message sequences.
- Node test harness for auth/HTTP, rollback, rejected queue eligibility and report failures. Tests use injected fake clients: no live PostgreSQL validation is claimed.

## How to start in a dedicated internal lab (do not expose publicly)
1. Install Node 22+, PostgreSQL 15+, and install \`apps/api\` dependencies with \`npm ci\` once lockfile exists (or \`npm install\` in a disposable lab).
2. Manually review then apply \`database/migrations/0001_bridge_foundation.sql\` to a dedicated empty database. Review grants, RLS and retention before any real data.
3. Pre-provision **synthetic test accounts** via trusted database fixture, with known auth subjects and explicitly moderated languages. No self-asserted age flags: a genuine age-assurance provider and owner-approved moderation process are missing.
4. Configure \`BRIDGE_DATABASE_URL\`, \`BRIDGE_AUTH_PUBLIC_KEY_FILE\`, \`BRIDGE_AUTH_ISSUER\`, \`BRIDGE_AUTH_AUDIENCE\`. Use a properly scoped RS256 signing authority for test JWTs; do NOT commit private keys or real credentials.
5. Run \`node apps/api/src/start.mjs\`; binds loopback only. A managed reverse proxy, TLS and operational controls are not implemented.

## Known production blockers
- No operational age verification, moderator dashboard or on-call safety response.
- Basic real PostgreSQL integration and concurrent message-sequencing tests passed in [CI run 39931219488](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488); high-load/multi-worker stress and incident scenarios remain untested.
- Matching uses one global PostgreSQL advisory lock for reservations. This is deliberate correctness-first M1; throughput and deadlock behavior must be profiled/refactored.
- No user/device notifications, realtime fanout or online-presence validation.
- No per-account distributed rate limiting/abuse heuristics yet, and no private API production gateway.
- Session renewal/JWKS/key rotation, audit trail, retention schedules, data deletion and secrets policy remain to be implemented.
- The service does not provision accounts or bypass eligibility. Real users cannot sign up.
- Static/unit, fake-PG, and scoped real PostgreSQL CI integration tests have passed; these do **not** constitute production security assurance.

**No real users, payments or publicly reachable stranger chat until launch/safety gates pass.**
