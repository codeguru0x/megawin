/**
 * `@megawin/guard/rate-limit` — GCRA rate limiter + math thuần.
 */

export { computeGcraParams } from "./gcra-math";
export type { GcraParams } from "./gcra-math";
export { GCRA_LUA_SCRIPT } from "./gcra.lua";
export { RateLimiter } from "./rate-limiter";
export type { RateLimiterOptions } from "./rate-limiter";
