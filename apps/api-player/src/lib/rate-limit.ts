/**
 * Hằng rate-limit dùng chung cho ≥3 endpoint cùng bộ số.
 *
 * Khai tại handler vẫn đọc được `route`; số dùng chung để sửa 1 chỗ là lan.
 * `PLACE_BET_RATE_LIMIT` là ngoại lệ: cả 7 game **cùng một object** (cùng route
 * `"player.place-bet"`) — quota theo player, không theo game.
 */

import { GuardSubjectType, type HandlerRateLimitOptions } from "@megawin/auth";

/**
 * 7 game `place-bet` — 1 lần / 5 giây mỗi player, burst 0 (spacing tuyệt đối).
 * Route chung: tool bắn 7 game song song vẫn chung 1 xô.
 */
export const PLACE_BET_RATE_LIMIT = {
  route: "player.place-bet",
  limit: 1,
  windowSec: 5,
  burst: 0,
  subject: GuardSubjectType.Account,
} as const satisfies HandlerRateLimitOptions;

/**
 * Countdown / jackpot poll — 120 req / 60s. Client poll 1–3s là 20–60/phút.
 * Handler spread kèm `route` riêng từng game.
 */
export const POLLING_RATE_LIMIT = {
  limit: 120,
  windowSec: 60,
  subject: GuardSubjectType.Account,
} as const satisfies Omit<HandlerRateLimitOptions, "route">;

/**
 * Tickets / draw-results / config — 60 req / 60s.
 * Handler spread kèm `route` riêng từng game.
 */
export const READ_RATE_LIMIT = {
  limit: 60,
  windowSec: 60,
  subject: GuardSubjectType.Account,
} as const satisfies Omit<HandlerRateLimitOptions, "route">;

/**
 * Combo-popularity (4 game) — aggregate thống kê, 20 req / 60s.
 */
export const AGGREGATE_RATE_LIMIT = {
  limit: 20,
  windowSec: 60,
  subject: GuardSubjectType.Account,
} as const satisfies Omit<HandlerRateLimitOptions, "route">;
