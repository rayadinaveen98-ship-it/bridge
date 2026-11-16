/**
 * V2-05A pure Keep decisions; this module is never called by V1 routes.
 * The caller must establish DB-owned membership, eligibility and clock.
 */
export const KEEP_DECISIONS=Object.freeze({ACCEPT:"accept",WITHDRAW:"withdraw"});
export const KEEP_RESULTS=Object.freeze({
  PENDING:"pending",WITHDRAWN:"withdrawn",CONNECTED:"connected"
});
export function validKeepDecision(value) {
  return value===KEEP_DECISIONS.ACCEPT||value===KEEP_DECISIONS.WITHDRAW;
}
export function twoCurrentVotes(voters, pair) {
  if(!Array.isArray(voters)||!Array.isArray(pair)||pair.length!==2||
      pair[0]===pair[1])return false;
  const accepted=voters.filter(v=>v?.status==="accepted").map(v=>v.voter_id);
  return accepted.length===2 && new Set(accepted).size===2 &&
    pair.every(id=>accepted.includes(id));
}
export function keepOutcome(decision,voters,pair) {
  if(!validKeepDecision(decision))return null;
  if(decision===KEEP_DECISIONS.WITHDRAW)return KEEP_RESULTS.WITHDRAWN;
  return twoCurrentVotes(voters,pair)?KEEP_RESULTS.CONNECTED:KEEP_RESULTS.PENDING;
}
