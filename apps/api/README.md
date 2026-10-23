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
