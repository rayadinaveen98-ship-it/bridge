# Database integration test guide

\`apps/api/tests/postgres.integration.test.mjs\` is an opt-in **real Postgres** test using synthetic, pre-provisioned, internally age-eligible test accounts. The test can never be a substitute for production age-assurance verification or moderation.

## CI
GitHub Actions service container runs PostgreSQL 16 in an isolated \`bridge_test\` database, applies the V1 migration, and runs API tests with the \`pg\` driver. Workflow configuration is committed; both jobs passed in [GitHub Actions run 39931219488](https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39931219488).

## Locally
Create disposable database \`bridge_test\`, apply schema with \`psql\`, install \`pg\` under \`apps/api\`, set \`BRIDGE_TEST_DATABASE_URL\` containing \`bridge_test\`, then \`npm test --prefix apps/api\`.

Without this environment variable, the real DB test is **skipped**; all other tests run on built-in Node without Postgres. The test refuses non-test DB names and does not run against production.

## Coverage
- Strict supported-language eligibility; no preference order ranking.
- Auth-subject to server-side account mapping.
- Pair reservation from 2 separate queue requests, uniqueness against double matching.
- One durable message, replay/deduplication, conflicting retry and concurrent sequence ordering.
- Nonparticipants cannot read conversations.
- End conversation, mutual opt-in, persistent reconnect, block, and report intake.
- Both SQL migrations, outbox publish-failure retry/replay/ack, and non-owner RLS read isolation on accounts/messages/outbox.

## Still missing
Multiple parallel queue workers under high load, lock/deadlock and degraded network fault injection, full RLS privilege/authorization audit, security penetration testing, retention/deletion policy and incident/appeal workflows.
