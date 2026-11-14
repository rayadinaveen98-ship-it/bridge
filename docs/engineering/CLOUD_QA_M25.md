# Bridge M2.5 — Cloud QA deployment gate (not public launch)

This opt-in development environment is **exclusively for two synthetic test
accounts owned by the project founder**. It is not a signup flow, adult
age-assurance mechanism, staffed moderation, or permission to expose matching to
real strangers. Existing localhost tests and default security restrictions remain
unchanged.

## Implementation boundaries

- `BRIDGE_DEPLOYMENT_MODE=cloud_qa` is required to enable hosted mode.
- Hosted mode binds `0.0.0.0` only behind Render's HTTPS termination.
- Set `BRIDGE_ALLOW_LAB_LOGIN=1` explicitly; only two pre-provisioned handles,
  `tester_a` and `tester_b`, are supported in the new empty test database.
- `BRIDGE_DATABASE_URL` must target the **dedicated Bridge Neon database** via
  a TLS-enabled Postgres connection string (`sslmode=require`); never use existing
  projects' databases. Secrets must be set in Render environment variables and
  never committed to this public repository.
- The signing secret is a base64-encoded RSA private PEM (3072 bits minimum)
  in `BRIDGE_QA_PRIVATE_KEY_B64`. Rotate only with an explicit session plan.
- Supply two independently generated, unique 32+ character secrets via
  `BRIDGE_QA_TESTER_A_PASSPHRASE` and
  `BRIDGE_QA_TESTER_B_PASSPHRASE`. These must be stored privately outside git;
  never send through chat.
- No database migrations run automatically at server startup. Apply existing
  migrations 0001/0002/0003 **only to the dedicated Bridge database** first,
  verify expected table schema, then enable the hosted service.
- Provisioning at startup creates missing synthetic identities; it does not
  reset existing credentials or wipe conversations. The database owner is
  authorized server-side; do not grant `anon` access to Bridge tables.
- Public discovery/signup and real user invitations remain prohibited. Only
  a private, strong-password two-person-equivalent test is in scope.

## Render configuration (after code acceptance)

- Service: Node Web Service, **free** plan, Singapore region, branch `main`.
- Repository: `rayadinaveen98-ship-it/bridge`.
- Build: `npm install --prefix apps/api --no-audit --no-fund`
- Start: `node apps/api/src/start.mjs`
- Autodeploy: disabled until deployment and test gates are approved.
- Environment: `BRIDGE_DEPLOYMENT_MODE=cloud_qa`,
  `BRIDGE_ALLOW_LAB_LOGIN=1`, `BRIDGE_BIND_HOST=0.0.0.0`,
  `BRIDGE_DATABASE_URL`, `BRIDGE_QA_PRIVATE_KEY_B64`,
  `BRIDGE_QA_TESTER_A_PASSPHRASE`, `BRIDGE_QA_TESTER_B_PASSPHRASE`.
  Render sets `PORT`; `BRIDGE_PORT` can override locally.
- No public deployment until backend and client security QA have passed.
- Render Free sleeps after inactivity; reconnect may require waiting.
- Neon free usage and Render free services must not auto-upgrade to paid plans.

## Android build contract (after hosted URL exists)

Build **debug-only** with `--dart-define=BRIDGE_QA_ORIGIN=https://<approved-name>.onrender.com`.
Only the compiled exact HTTPS Render origin or loopback lab endpoints may be used.
The APK must never accept arbitrary token-bearing HTTP(S) destinations.

## Operational test exit

1. GitHub API/Postgres and Android protocol tests PASS.
2. Hosted service health checks pass, and unauthenticated API calls return 401.
3. Both test accounts log in from phone/tablet, match and exchange text.
4. Reconnect, ordered replay, mutual keep and safety block/report pass.
5. No paid infrastructure or real users; rollback possible by disabling
   or deleting the Render service without touching other projects.
