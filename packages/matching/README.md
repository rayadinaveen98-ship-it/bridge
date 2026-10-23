# Matching domain reference

Pure deterministic reference rules: \`npm test\` (no dependencies) runs built-in Node tests.

**This is NOT a deployed matching service.** Authorization and double-allocation prevention **must** be handled transactionally in PostgreSQL, not by trusting \`findCandidate\`.

Inputs are explicit verified booleans supplied by a trusted server. Client-reported age flags or safety flags are never acceptable in production. \`supportedLanguages\` must come from the moderated service catalogue. Neither language code nor array order changes compatibility scoring. Blocks are checked in **both directions**.

\`maxQueueAgeMs\` controls *candidate* queue expiry; a production coordinator must also expire/resume the seeker's own queue entry and implement row locks, idempotent reservation and network/retry logic.

If multiple compatible candidates exist, the reference orders by soft score, older queue entry, then stable ID for deterministic tests. Real-world fairness and load behavior will need explicit load testing and likely refinements.
