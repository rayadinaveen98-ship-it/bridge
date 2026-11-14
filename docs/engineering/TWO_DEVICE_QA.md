# Bridge internal two-device QA — standard working process

**Status:** Founder reported both synthetic test logins and real message exchange working on Android phone + tablet on 2026-11-14. This is not a public product or completed safety acceptance.

## Infrastructure and responsibility

- Backend: Render Free `bridge-private-qa`, exact URL `https://bridge-private-qa.onrender.com`. Auto-Deploy **OFF** to avoid silently changing an active test environment.
- Database: dedicated Neon Free `bridge-internal-qa`. Do not share credentials, delete test accounts or reuse unrelated databases.
- Android: Flutter internal debug QA build; exact HTTPS Render origin compiled at build time.
- Accounts: only `tester_a` and `tester_b`; private passphrases held separately from repo. Tokens expire after 30 minutes; session refresh not implemented.
- No real user invitations, strangers, commercial release, push notification guarantee, or production moderation.

## Repeatable delivery cycle

1. Founder approves the stage and requirements; engineering checks current `main`, issue list, QA evidence and design baseline. Document intended changes and acceptance criteria.
2. Make isolated branch/PR; test backend/PostgreSQL security and Flutter as applicable. Review for regressions; merge only after CI and quality checks.
3. If API/database behavior changed: apply reviewed migrations **only** to Bridge's dedicated Neon test database (if needed), deploy approved `main` to Render explicitly because auto-deploy is OFF, verify healthy HTTP API and protected routes. Never auto-rotate test credentials.
4. If Android changed: GitHub Action `Bridge cloud QA debug APK` builds a Cloud QA APK from `main`, runs source analysis/tests and live API smoke checks, and uploads artifact `bridge-cloud-qa-debug-apk`. Download directly at [Actions workflow](https://github.com/rayadinaveen98-ship-it/bridge/actions/workflows/cloud-qa-android.yml) by opening the latest **successful main** run and selecting its artifact under Artifacts. A backend-only change does **not** automatically build a new APK. The artifact expires after 7 days.
5. Install the APK on both devices. Some debug builds may have incompatible signing keys, requiring uninstall/reinstall; preserve no user data in the current synthetic test app. Stable signing + easier private distribution are separate pending enhancements.
6. User signs in to each device with the appropriate synthetic account, tests the approved scope, sends **result, steps to reproduce and redacted screenshots**; engineering verifies, fixes and repeats. Physical hardware behavior is not inferred from automated CI.
7. Update issue/acceptance ledger: PROPOSED, APPROVED, IMPLEMENTED, CI TESTED, DEVICE PASS/FAIL/BLOCKED, RELEASED (private QA only). Close a stage only after its exit criteria.

## M2 device acceptance checklist

| Test | Status as of 2026-11-14 | Acceptance |
|---|---|---|
| Cloud sign-in on phone and tablet | **Operator-reported PASS** | Each invited synthetic handle logs in successfully |
| Two-device matching and text exchange | **Operator-reported PASS** | Each device receives the other's messages |
| Mutual Keep and reconnect | **OPEN** | Both approve; connection remains accessible after leaving/reopening chat |
| Offline recovery, no duplicates | **OPEN** | Disconnect one device from network, send a message, reconnect; recover exactly once in order |
| Report acknowledgment | **OPEN** | Test report accepted; do not imply staffed reviewer action |
| Block/deny/no rematch | **OPEN — TEST LAST** | Blocked peer cannot send/rejoin; pair cannot rematch |
| Expired token behavior | **OPEN** | Expiry handled with clear re-login requirement; automatic renewal not yet implemented |
| App resume/background | **OPEN** | Returning to app recovers state according to defined test expectations |

**Important:** Blocking the two seeded users may permanently prevent matching until a controlled, specifically approved test-data reset. Perform it last. Real test secrets, chat contents and identity information should not appear in screenshots/logs.

## Remaining delivery improvements — proposed

- Stable signed internal APK update path (current CI debug signing is not guaranteed stable between builds).
- Google/Firebase private tester distribution, only after approved setup and cost/privacy review; not implemented.
- A durable, versioned test history and change log for phone and tablet runs.
