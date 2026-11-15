/**
 * TEST-ONLY deterministic clock. The live API must use its own authoritative DB
 * clock and re-verify permissions transactionally; do not import this helper.
 */
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const RANDOM_IDLE = 30 * MINUTE;
export const DIRECT_IDLE = 30 * MINUTE;
export const UNREAD_TTL = 7 * DAY;
export const ACK_RECOVERY = 15 * MINUTE;
export const REPORT_TTL = 7 * DAY;
export const RANDOM_BODY_PURGE = DAY;
export const HISTORY_TTL = 90 * DAY;
export const NORMAL_EVIDENCE = 90 * DAY;
export const SERIOUS_EVIDENCE = 180 * DAY;

export function createClock(start = Date.UTC(2026, 10, 15, 12, 0, 0)) {
  let current = start;
  return Object.freeze({
    now: () => current,
    set(value) { current = Number(value); return current; },
    advance(duration) { current += Number(duration); return current; }
  });
}
export const beforeDeadline = (now, started, ttl) =>
  Number.isFinite(now) && Number.isFinite(started) &&
  Number.isFinite(ttl) && now >= started && now < started + ttl;
