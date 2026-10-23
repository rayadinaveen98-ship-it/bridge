# Bridge M1 — Flutter Android INTERNAL test client

**Not a public app. Synthetic pre-provisioned test accounts only. No login/signup or operational age assurance.**

## Capabilities

- Dark-first three-destination navigation: Discover, Connections, Me
- Server-supported language catalog with no default/favored language
- Explicit interests/intention, matchmaking queue, cancellation
- Authenticated peer information, text messages, idempotent send retry
- Authenticated SSE notification listener and sequence-based PostgreSQL replay
- Mutual connection request, saved connections, block and report flows
- No persistent JWT or messages written to device storage
- Loopback-only URL validation (localhost, 127.0.0.1, ::1, Android emulator 10.0.2.2)

## Build (Flutter SDK installed)

This repository tracks Dart app code and a debug-only Android manifest override.
Run `flutter create --platforms=android --project-name bridge_mobile --org com.bridge.internal --no-pub apps/mobile` **without** `--overwrite` if platform scaffolding is missing, then:

```sh
cd apps/mobile
flutter pub get
flutter test
flutter build apk --debug
```

The GitHub Actions job `Bridge Android internal` can generate a **debug-signed** APK artifact. Its signature changes when the build runner changes; it is not a Play Store release. Android permissions/network policy allow cleartext loopback only in the debug variant; do not release the APK publicly.

## Connecting from an Android test device

Start the internal Bridge API on a trusted workstation bound to `127.0.0.1:8787`, on a **dedicated synthetic-test PostgreSQL database** with approved test JWTs. Connect Android with USB debugging, then:

```sh
adb devices
adb reverse tcp:8787 tcp:8787
```

Inside the updated test APK, enter `http://127.0.0.1:8787`, a synthetic account handle such as `tester_a`, and the randomly generated one-time lab passphrase printed by the **local provisioner**. The app exchanges them for a 30-minute signed JWT automatically, holds the token only in memory, and clears the passphrase field after success. Manual JWT entry is removed. For emulator, `http://10.0.2.2:8787` is supported.

**DO NOT** paste your GitHub credentials, Supabase service role secret, production JWT, real personal records, or anyone else's account access.

## Known limitations

- The API still runs internal loopback-only; backend hosting is not configured.
- Synthetic account provisioning exists as a local operator CLI, but there is no public account creation, token renewal, FCM, production safety operation, user recovery, end-to-end encryption, or Play Store submission.
- SSE is single-process; reconnections reconcile via message sequence. A long-lived stream may be interrupted by app suspension and must reconnect on resume.
- Connections appear only after **both** participants have explicitly accepted. Android connections tab supports manual refresh.
- The frontend uses ephemeral app memory, not encrypted local persistent cursor storage.
- Device-to-device communication requires two independent approved synthetic JWTs and a real internal backend; no production users can sign up yet.

Do not represent a compiled APK as a secure production service. This is a QA milestone only.
