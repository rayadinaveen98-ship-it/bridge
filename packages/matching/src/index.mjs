/**
 * Bridge matching domain rules. This module is intentionally free of I/O.
 * Production caller MUST enforce eligible account checks, current blocks,
 * active-slot uniqueness and pair reservation again inside a DB transaction.
 * A successful match here is a suggestion, not an authorization token.
 */

function normalizeLanguage(code) {
  return typeof code === "string" ? code.trim().toLowerCase() : "";
}

function idOf(user) {
  return typeof user?.id === "string" ? user.id : "";
}

function allowed(user) {
  return Boolean(
    idOf(user) &&
    user.status === "active" &&
    user.ageVerified === true &&
    user.safetyEligible === true &&
    user.available === true &&
    user.hasActiveSession !== true
  );
}

function blocked(leftId, rightId, blocks) {
  return blocks.some(({ blockingAccountId, blockedAccountId }) =>
    (blockingAccountId === leftId && blockedAccountId === rightId) ||
    (blockingAccountId === rightId && blockedAccountId === leftId)
  );
}

/**
 * Hard pairing rules are symmetrical. Languages are an unranked set.
 * "supportedLanguages" contains only those with operational safety coverage.
 */
export function pairEligibility(left, right, options = {}) {
  const leftId = idOf(left), rightId = idOf(right);
  if (!leftId || !rightId || leftId === rightId) return { eligible: false, reason: "invalid_pair", sharedLanguages: [] };
  if (!allowed(left) || !allowed(right)) return { eligible: false, reason: "account_ineligible", sharedLanguages: [] };
  if (blocked(leftId, rightId, options.blocks || [])) return { eligible: false, reason: "blocked", sharedLanguages: [] };

  const permitted = new Set((options.supportedLanguages || []).map(normalizeLanguage).filter(Boolean));
  const rightLanguages = new Set((right.languages || []).map(normalizeLanguage).filter(Boolean));
  const sharedLanguages = [...new Set((left.languages || []).map(normalizeLanguage))]
    .filter(code => code && rightLanguages.has(code) && permitted.has(code))
    .sort();
  if (sharedLanguages.length === 0) return { eligible: false, reason: "no_shared_supported_language", sharedLanguages: [] };
  return { eligible: true, reason: null, sharedLanguages };
}

/** Soft compatibility only. Language identity/count/position never changes ranking. */
export function compatibilityScore(left, right) {
  const rightInterests = new Set((right.interests || []).map(s => String(s).toLowerCase()));
  const interests = new Set((left.interests || []).map(s => String(s).toLowerCase()));
  let score = 0;
  for (const interest of interests) if (rightInterests.has(interest)) score += 2;
  if (left.intent && right.intent && left.intent === right.intent) score += 3;
  if (left.topic && right.topic && left.topic === right.topic) score += 1;
  return score;
}

/**
 * Deterministic candidate ranking: soft affinity, then wait fairness, then ID.
 * Caller must attempt an atomic reservation and retry if another worker won.
 */
export function findCandidate(seeker, queue, options = {}) {
  const nowMs = Number(options.nowMs ?? Date.now());
  const maxQueueAgeMs = Number(options.maxQueueAgeMs ?? 120_000);
  if (!Number.isFinite(nowMs) || !Number.isFinite(maxQueueAgeMs) || maxQueueAgeMs <= 0) {
    throw new TypeError("Invalid queue clock or expiry");
  }
  const matches = [];
  for (const candidate of queue || []) {
    if (!candidate || !Number.isFinite(candidate.queuedAt) ||
        candidate.queuedAt > nowMs || nowMs - candidate.queuedAt > maxQueueAgeMs) continue;
    const result = pairEligibility(seeker, candidate, options);
    if (!result.eligible) continue;
    matches.push({ candidateId: candidate.id, sharedLanguages: result.sharedLanguages, score: compatibilityScore(seeker, candidate), queuedAt: candidate.queuedAt });
  }
  matches.sort((a, b) => b.score - a.score || a.queuedAt - b.queuedAt || a.candidateId.localeCompare(b.candidateId));
  const found = matches[0];
  return found ? { candidateId: found.candidateId, sharedLanguages: found.sharedLanguages, score: found.score } : null;
}
