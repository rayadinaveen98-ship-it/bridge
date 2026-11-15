# R0 — Conversation lifecycle stabilization

**Status:** APPROVED TO START on 2026-11-15; implementation is staged behind CI and physical-device acceptance. This document does not authorize public signup, data resets, new products or paid hosting.

## Verified baseline

- Latest pre-R0 main: `b552130a` (PR #13 active-chat recovery).
- Cloud QA: Render Free + dedicated Neon Free; only `tester_a` and `tester_b`.
- Operator reported both Android devices signed in and exchanged messages.
- Before R0, a Back action cleared the local conversation while leaving the random chat server-side active. The client did not offer an explicit resume action.
- Server `bootstrap` already exposed the authenticated user's active open random chat, but not a pending search request.
- Queued searches expire at 120 seconds. The initial 60-second match reservation `lease_expires_at` is **not a chat expiration clock** after activation; do not use it to end legitimate conversations.

## Approved R0 behavior

| Action | Contract |
|---|---|
| Back to Discover | Hide conversation view, **do not close** server chat or delete messages; show Resume or explicitly End |
| Resume conversation | Reopen same server-authorized conversation, reconcile ordered messages |
| End random chat | Explicit confirmation, server closes chat and clears match slots; then new search allowed |
| Saved connection | Mutually accepted connections are accessible through Connections, not closed by End random chat |
| Re-login | Restore active random room, otherwise resume only an unexpired user-owned waiting search |
| Cancel matchmaking | Cancel the exact request, then check whether a match committed concurrently; preserve such a match as resumable |
| Duplicate search / conflict | Never overwrite active room or valid queue request; recover the server's state |
| Expired wait | Show an unmatched/expired outcome; allow new search |
| Expired initial reservation lease | Do not infer abandonment after activation; active/open chat stays open |
| Block | Existing server block behavior; no chat resume after blocking |

## Acceptance and release gates

1. Backend unit tests and disposable PostgreSQL integration suite pass including authenticated search-only restore and expired-lease preservation.
2. Flutter static analysis, widget/protocol tests and new controller lifecycle regressions pass.
3. Android cloud QA APK builds from verified `main` with exact existing Render HTTPS origin.
4. Explicit Render deployment of compatible backend only after approval/CI (Auto-Deploy remains OFF); verify health and authentication boundary.
5. Founder tests on **both** Android devices, without changing accounts or live messages: Resume active four-message conversation, Back → Resume, confirmed End → new search, Cancel pending, mutual Keep, and re-login recovery.
6. Record physical-device PASS/FAIL with exact APK commit and Render deploy. R0 cannot be marked DEVICE TESTED solely from CI.

## Scope limits and open questions

- Automatic token renewal, durable local authentication, offline send queue and long-term presence are R1/M3, **not R0**.
- Public matching, operational moderation, monetization and redesign remain out of scope.
- No data destruction or mass stale-state cleanup. That would require an audited policy distinguishing legitimate quiet conversations from orphaned state and explicit founder approval.
- Real reconnect/recovery after process kills remains a device gate.
