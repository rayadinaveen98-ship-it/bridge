# Bridge M1 — HTTP API contract draft

**Design only, NOT deployed.** Base path \`/v1\`; HTTPS mandatory. Authenticated endpoints use validated bearer session/JWT mapped to an internal account. The frontend cannot directly control age-verification or safety status.

| Method + path | Input | Success | Common failures |
|---|---|---|---|
| GET /bootstrap | bearer token | moderated language catalogue, feature flags | 401 |
| PUT /me/preferences | selected language codes, intent, interests | 204 | 401, 422 unsupported language |
| POST /matches/search | Idempotency-Key UUID; topic optional | 202 requestId / waiting | 403, 409, 429 |
| GET /matches/search/:requestId | own requestId | 200 waiting/reserved/connected/unmatched | 404 |
| DELETE /matches/search/:requestId | own requestId | 204 cancel | 404 |
| GET /conversations/:id/messages | afterSequence >=0 | 200 ordered messages | 403, 404 |
| POST /conversations/:id/messages | Idempotency-Key; clientMessageId UUID, body 1–4000 chars | 201 messageId, server sequence | 403, 409, 429 |
| POST /conversations/:id/close | own conversation | 204 end/release slots | 403 |
| PUT /conversations/:id/connection-vote | decision accept/withdraw | 200 pending/connected/withdrawn | 403 |
| GET /connections | bearer token | 200 own connections | 401 |
| PUT /blocks/:targetId | target UUID | 204 server-enforced block | 403 |
| DELETE /blocks/:targetId | target UUID | 204 remove own block | 403 |
| POST /reports | reportedAccountId, category, optional conversationId/details | 202 reportId queued | 403, 429 |

## Wire schemas and validation
- **QueueStatus:** \`requestId: uuid\`, \`state: waiting|reserved|connected|cancelled|expired|unmatched\`, optional \`conversationId\`, optional retry seconds.
- **Message:** \`id: uuid\`, \`conversationId: uuid\`, \`sequenceNumber: positive integer\`, \`senderId: uuid\`, \`body: string\`, \`sentAt: ISO8601\`.
- **Preferences:** \`languageCodes: distinct nonempty array\`, \`intention: just_chat|make_friends|thoughtful_talk\`, \`interests: array up to 16\`.
- **Report category:** harassment, threat, spam, impersonation, sexual_content, other. Evidence accessibility, retention and reviewer controls must be separately specified.

## Authorization rule
All read/write operations confirm current account, participant membership, blocks and server-side eligibility. Direct database access by Flutter is not an acceptable shortcut. Do not reveal whether inaccessible other people's conversations exist.

## Architecture and versioning
Proposed NestJS service, Postgres persistence, managed realtime presence/events; these are *contracts*, not a deployed server. API version \`v1\` will not promise backwards compatibility before first beta.
