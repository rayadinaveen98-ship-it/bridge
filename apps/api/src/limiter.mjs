import { ApiError } from "./auth.mjs";

/**
 * In-memory M1 laboratory throttle, not a distributed anti-abuse solution.
 * Uses verified JWT subject, never an unauthenticated user ID from JSON.
 */
export function createLimiter(now = () => Date.now()) {
  const counters = new Map();
  let calls = 0;
  return function limit(subject, method, pathname) {
    if (++calls % 256 === 0) {
      const t = now();
      for (const [key,entry] of counters) if (entry.resetAt <= t) counters.delete(key);
    }
    const kind = method === "POST" && pathname === "/v1/reports" ? "reports"
      : method === "POST" && pathname === "/v1/matches/search" ? "match"
      : method === "POST" && /\/messages$/.test(pathname) ? "messages" : "general";
    const limits = { reports: [5, 3_600_000], match: [12, 60_000], messages: [90, 60_000], general: [240, 60_000] };
    const [max, windowMs] = limits[kind];
    const key = subject + "\0" + kind;
    const t = now();
    let item = counters.get(key);
    if (!item || item.resetAt <= t) item = { used: 0, resetAt: t + windowMs };
    item.used++;
    counters.set(key, item);
    if (item.used > max) throw new ApiError(429,"rate_limited");
  };
}
