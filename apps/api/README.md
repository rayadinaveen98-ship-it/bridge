# Bridge HTTP gateway (M1 engineering slice)

**Not deployed, not a production service.** Server is designed to be bound to loopback only. It requires a backend storage service and operational PostgreSQL instance (still being implemented). The current tests inject a fake service; they **do not** prove database, matching, or moderation correctness.

## Security model
- RS256-only signed bearer tokens verified against configured 2048+ bit RSA public key, expected issuer/audience, expiration/issued-at/not-before.
- Never trusts user-supplied \`accountId\`, \`ageVerified\` or safety flags. Only JWT subject reaches the domain service, which must map it to a server-side account.
- All endpoints require authentication except \`/healthz\`.
- JSON-only POST/PUT, maximum request body 16 KiB; no CORS bypass.
- Generic server errors and no stack traces in HTTP responses.
- Credentials, verified age and report moderation must be provisioned via trusted backend; no self-signup flows here.

## API paths
See \`src/http.mjs\` and \`docs/engineering/M1_API.md\`.

## Test
\`node --test tests/*.test.mjs\` (Node 22+; no package installation needed for these HTTP/auth tests).

## Next
Implement secure Postgres-backed service, integration test concurrency in a real database, connect a vetted authentication/age assurance provider, and only then allow two test adults to exchange real messages. Do not expose this service to the public internet yet.

## Quick start on Windows

From a local clone of this repository, with **Docker Desktop running** and **Node.js 22+ installed**, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Start-BridgeLocalLab.ps1
```

This starts an isolated local PostgreSQL Docker container, applies all 3 migrations, generates signing keys and TWO synthetic private test-account passphrases, then starts the loopback-only API. Copy each passphrase from the terminal before closing it. On another start, existing accounts are preserved and passphrases are NOT reprinted. There is no automatic reset route.

For each Android test phone, connect with USB debugging and run `adb reverse tcp:8787 tcp:8787`. Enter `tester_a` / `tester_b` and their respective generated passphrases into the APK. **This is for internal synthetic test accounts only.**

## Internal login (M2 laboratory)

No user-facing manual JWT is required in the Flutter application. To use synthetic test accounts, provision an isolated local PostgreSQL database named `bridge_lab` (or `bridge_test`) and apply migrations `0001`, `0002`, `0003`. This step must NOT use CineRelay, Creator OS or any shared Supabase project.

Run from `apps/api` with `BRIDGE_DATABASE_URL` set to a local lab database:

```sh
npm install
node scripts/create_lab_accounts.mjs
```

This command generates a 3072-bit RSA signing keypair in a local private folder and prints two independently generated synthetic test-account passphrases **once**. Store them privately, do not paste them in GitHub or chat, and never use them as personal passwords. Rerunning the script will not silently reset existing accounts. The synthetic lab-only eligibility flags are NOT age verification or real moderation.

Set `BRIDGE_AUTH_PUBLIC_KEY_FILE` to the generated public key; set `BRIDGE_LAB_PRIVATE_KEY_FILE` to the private key; `BRIDGE_AUTH_ISSUER=bridge-internal-lab`; `BRIDGE_AUTH_AUDIENCE=bridge-api`; `BRIDGE_ALLOW_LAB_LOGIN=1`; `BRIDGE_DATABASE_URL` to your loopback lab DB. Start `node src/start.mjs`. The API remains bound to loopback and may be bridged over USB using `adb reverse tcp:8787 tcp:8787`.

Lab login signs 30-minute RS256 tokens after verifying a salted scrypt passphrase and checking server-side account eligibility. The login route is disabled unless explicitly enabled. It is NOT production registration, password recovery, full session revocation, real age assurance, or human moderation. No public deployment.
