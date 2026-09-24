/**
 * `@megawin/guard` — lớp phòng thủ dùng chung (rate limit GCRA + idempotency sau).
 *
 * Plan p0-01: chỉ foundation. Chưa hook `buildHandler` (→ p1-01), chưa
 * idempotency (→ p0-02). Không ai trong `apps/` được import package này cho tới
 * khi rollout plan tương ứng xong.
 */

export { DEFAULT_RATE_LIMIT_BURST, DEFAULT_RATE_LIMIT_TIMEOUT_MS } from "./constants";
export { buildRateLimitKey, GUARD_KEYS } from "./keys";
export { computeGcraParams, GCRA_LUA_SCRIPT, RateLimiter } from "./rate-limit";
export type { GcraParams, RateLimiterOptions } from "./rate-limit";
export { GuardSubjectType } from "./types";
export type { GuardSubject, RateLimitDecision, RateLimitInput, RateLimitRule } from "./types";
