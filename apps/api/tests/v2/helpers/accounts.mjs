/**
 * Synthetic-only fixtures for executable PRODUCT CONTRACTS.
 * This file is intentionally not imported by apps/api/src.
 */
export const user = (id, overrides = {}) => ({
  id,
  status: "active",
  adultEligible: true,
  safetyEligible: true,
  selectedLanguages: ["en"],
  ...overrides
});
export const users = Object.freeze({
  a: user("a"),
  b: user("b"),
  outsider: user("outsider"),
  blocked: user("blocked"),
  underage: user("underage", { adultEligible: false }),
  restricted: user("restricted", { status: "restricted" }),
  premiumTester: user("qa-test-grant")
});
export function blockedPair(a, b, blocks = []) {
  return blocks.some(x =>
    (x.blocker === a && x.blocked === b) ||
    (x.blocker === b && x.blocked === a));
}
