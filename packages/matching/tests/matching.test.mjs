import test from "node:test";
import assert from "node:assert/strict";
import { pairEligibility, compatibilityScore, findCandidate } from "../src/index.mjs";

const person = (id, overrides = {}) => ({
  id, status: "active", ageVerified: true, safetyEligible: true,
  available: true, hasActiveSession: false,
  languages: ["en"], interests: [], intent: "chat", topic: null,
  queuedAt: 1000, ...overrides
});
const context = { supportedLanguages: ["en", "sw", "te"], blocks: [] };

test("requires verified adult, active safety status and availability", () => {
  const x = person("x"), y = person("y");
  assert.equal(pairEligibility(x, y, context).eligible, true);
  for (const changed of [
    { ageVerified: false }, { safetyEligible: false }, { status: "suspended" },
    { available: false }, { hasActiveSession: true }
  ]) assert.equal(pairEligibility(x, person("y", changed), context).eligible, false);
});
test("never matches self or blocked users in either direction", () => {
  assert.equal(pairEligibility(person("x"), person("x"), context).reason, "invalid_pair");
  for (const [blockingAccountId, blockedAccountId] of [["x", "y"], ["y", "x"]]) {
    assert.equal(pairEligibility(person("x"), person("y"), {
      ...context, blocks: [{ blockingAccountId, blockedAccountId }]
    }).reason, "blocked");
  }
});
test("both must explicitly select a shared operationally supported language", () => {
  assert.equal(pairEligibility(person("x", { languages: [] }), person("y"), context).eligible, false);
  assert.equal(pairEligibility(person("x", { languages: ["te"] }), person("y"), context).eligible, false);
  assert.equal(pairEligibility(person("x", { languages: ["xy"] }), person("y", { languages: ["xy"] }), context).eligible, false);
  assert.deepEqual(pairEligibility(
    person("x", { languages: ["te", "sw", "EN"] }),
    person("y", { languages: ["SW", "en", "te"] }), context
  ).sharedLanguages, ["en", "sw", "te"]);
});
test("language order, identity and number never enter soft ranking", () => {
  const a = person("a", { interests: ["cinema"], languages: ["te", "en"] });
  const b = person("b", { interests: ["cinema"], languages: ["en", "sw"] });
  const seeker = person("s", { interests: ["cinema"], languages: ["sw", "en", "te"] });
  assert.equal(compatibilityScore(seeker, a), compatibilityScore(seeker, b));
  assert.equal(findCandidate(seeker, [a, b], { ...context, nowMs: 1000 }).candidateId, "a");
  assert.equal(findCandidate(seeker, [b, a], { ...context, nowMs: 1000 }).candidateId, "a");
});
test("soft preferences, queue age and deterministic ID break ties", () => {
  const s = person("s", { interests: ["cinema"] });
  const a = person("a", { interests: ["gaming"], queuedAt: 100 });
  const b = person("b", { interests: ["cinema"], queuedAt: 950 });
  assert.equal(findCandidate(s, [a, b], { ...context, nowMs: 1000 }).candidateId, "b");
  assert.equal(findCandidate(s, [person("z", { queuedAt: 50 }), person("a", { queuedAt: 100 })], { ...context, nowMs: 1000 }).candidateId, "z");
  assert.equal(findCandidate(s, [person("z"), person("a")], { ...context, nowMs: 1000 }).candidateId, "a");
});
test("expired and future queue entries are ignored", () => {
  assert.equal(findCandidate(person("s"), [person("a", { queuedAt: 0 })], { ...context, nowMs: 10000, maxQueueAgeMs: 500 }), null);
  assert.equal(findCandidate(person("s"), [person("a", { queuedAt: 11000 })], { ...context, nowMs: 10000 }), null);
});
test("a blocked attractive candidate cannot outrank safe users", () => {
  const s = person("s", { interests: ["movies"] });
  const blocked = person("x", { interests: ["movies"], queuedAt: 900 });
  const safe = person("y", { interests: [], queuedAt: 800 });
  assert.equal(findCandidate(s, [blocked, safe], {
    ...context, nowMs: 1000,
    blocks: [{ blockingAccountId: "x", blockedAccountId: "s" }]
  }).candidateId, "y");
});
test("invalid clock parameters are rejected", () => {
  assert.throws(() => findCandidate(person("s"), [], { ...context, nowMs: NaN }), TypeError);
});
