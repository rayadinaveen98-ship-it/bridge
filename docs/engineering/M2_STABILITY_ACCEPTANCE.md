# M2 stability & safety acceptance gate

This is a local synthetic-test-account checklist. No production service, public stranger chat or real-world age assurance is implied.

## Automated regression suite
GitHub Actions Foundation checks runs PostgreSQL 16 transaction/integration tests for:
- Mutual connection requires two independent accepts during an open chat.
- An already-closed random conversation refuses votes and message reads; no resurrection.
- A retained connection survives its original random matchmaking session ending, and existing participants can exchange new messages.
- Offline stream restart followed by GET messages?afterSequence=N recovers missed persisted messages in order.
- A block ends mutual connection, revokes stream access and prevents the same pair from matching again.
- A report can still be queued with relevant conversation evidence after a block.

These are database/API checks, not physical-device or app-background lifecycle tests.

## Phone + Windows manual acceptance
Keep your trusted synthetic Bridge local backend running at loopback. One phone is tester_a, laptop terminal is tester_b.

1. MUTUAL KEEP: after matching, phone chat menu -> Keep connection. Laptop terminal -> /keep. Phone Connections tab -> refresh. Both must see the saved connection. Press Back to Discover in phone to leave without ending the retained chat. Open Connections again; it should still open.
2. RECOVERY: while connected in an open chat, temporarily unplug the phone's USB cable to interrupt adb reverse. From laptop send one short unique message. Reconnect phone; run .\adb reverse tcp:8787 tcp:8787 from platform-tools. Return to Bridge, use Refresh messages in its chat toolbar; the offline message should appear exactly once, with order intact. This is a manual device test, not yet certified.
3. BLOCKING (LAST): phone safety menu -> Block user, confirm. Laptop sends again and must receive a non-success response; its stream must lose access. Connections list must no longer show that link, and the pair must not match again.
4. REPORTING: if testing report intake, submit a synthetic report before the block. Confirm it is acknowledged; do not pretend an automated report is actually reviewed by a human.
5. EXPIRED SESSION: signed lab JWTs expire after 30 minutes. Normal clients must show an authentication error; automatic renewal is not yet implemented. Sign out and sign in again in the test app to resume.

Do not publish private test passphrases, account tokens, personal details or internal database URLs. Never attempt this test with real strangers.

## Current known gaps
- Background/resume on physical devices and USB fault recovery are not fully automated in Android CI.
- Session refresh and revocation, stored local cursors and a mobile-safe networking layer are M3 scope.
- Moderation staffing/incident response, age assurance, scalable matchmaking, protection against abusive sign-ups and security review are required before public users.


## CI verification

Both Foundation jobs passed in GitHub Actions run 39954995708 (2026-10-23): https://github.com/rayadinaveen98-ship-it/bridge/actions/runs/39954995708

Verified in isolated PostgreSQL 16 only; the mobile USB-interruption and blocked-account UX checks still require user/device testing.

## Applying backend safety fixes on Windows

If an old random session is still open, finish it before restarting (in the existing desktop helper use /end). In the local Bridge repository run git pull. In the original server PowerShell terminal press Ctrl+C, then start the backend again with:

    powershell -ExecutionPolicy Bypass -File .\scripts\Start-BridgeLocalLab.ps1

Leave that first terminal open. Open a second PowerShell terminal in the Bridge folder and run:

    node .\apps\api\scripts\BridgeSecondTester.mjs

Use the pre-existing private tester_b passphrase (script will NOT regenerate it). The phone's ADB USB reverse may need to be re-applied; the previous M2 APK is unchanged. If lab tokens have expired, sign in again on the phone.
