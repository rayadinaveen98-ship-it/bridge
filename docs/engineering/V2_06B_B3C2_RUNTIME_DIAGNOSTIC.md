# B3c-2 runtime-role diagnostic — draft implementation

Status: DRAFT PR ONLY. Not merged, not deployed. No public hosted findings recorded here.
Pinned source baseline: main@e1abaa8057bd79b3a59feeb035e8c0c40ab709b8.

Exactly six changed paths: apps/api/src/v2/runtime_role_probe.mjs, apps/api/tests/v2/privileges/runtime_role_probe.test.mjs, apps/api/src/start.mjs, apps/api/package.json, .github/workflows/foundation.yml, and this document.

The existing Bridge API pool, only when Cloud QA AND the exact opt-in BRIDGE_INTERNAL_RUNTIME_ROLE_AUDIT_ONCE=1 are configured, checks out a real connection. It opens BEGIN TRANSACTION READ ONLY, selects only pg_catalog role/table metadata, rolls back unconditionally, and releases the client. It does not read user rows, message bodies or credentials; does not SET ROLE; never changes DDL, grants, schemas, data or permissions. No endpoint is exposed.

Only a boolean/status summary is sent to private operator logs: HOLD_V2, ROLE_REVIEW_ONLY or UNVERIFIED. No role names, database names, URLs, SQL errors, keys or passwords. Any privileged role, RLS gap or ambiguous query forces HOLD/UNVERIFIED. ROLE_REVIEW_ONLY is NOT V2 launch authorization and one session does NOT establish all pool connections.

Default stays OFF. This code does not introduce new deployment, payment, migrations, Android behavior, V2 activation or policy changes. Live Render deployment and opt-in environment changes require fresh founder review and approval; audit output must remain PRIVATE, not in a public GitHub PR.

Review gate: exact six-path diff; new pure negative tests and existing Foundation matching/PostgreSQL CI green on exact head. Preserve R0 phone/tablet acceptance OPEN, B3c-3 separate, V2-10/G1 old-client firewall pending, final 138-case V2-16 What If? review LAST.
