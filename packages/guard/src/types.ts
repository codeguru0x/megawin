/**
 * Shared types của `@megawin/guard`.
 */

/**
 * Loại subject bị rate-limit.
 *
 * `const object as const` — KHÔNG union string literal trần
 * (`code-quality-standards.mdc` §5.3).
 */
export const GuardSubjectType = {
  Account: "account",
  Tenant: "tenant",
  Ip: "ip",
} as const;

/** Union các subject type hợp lệ. */
export type GuardSubjectType = (typeof GuardSubjectType)[keyof typeof GuardSubjectType];

/** Subject cụ thể đang bị đánh giá (account / tenant / IP). */
export interface GuardSubject {
  /** Loại subject — dùng `GuardSubjectType.*`. */
  type: GuardSubjectType;
  /** Id thô (accountId / tenantId / IP) — sẽ được hash khi build key. */
  id: string;
}

/**
 * Rule GCRA cho 1 route.
 *
 * Công thức: `emissionIntervalMs = max(1, floor(windowSec * 1000 / limit))`,
 * `delayToleranceMs = burst * emissionIntervalMs` — xem `gcra-math.ts`.
 */
export interface RateLimitRule {
  /** Số request tối đa trong 1 window (steady rate). Phải > 0. */
  limit: number;

  /** Độ dài window (seconds). Phải > 0. */
  windowSec: number;

  /**
   * Burst cho phép vượt steady rate (đơn vị: số request).
   * `0` = spacing tuyệt đối. Bỏ trống → {@link DEFAULT_RATE_LIMIT_BURST}.
   */
  burst?: number;
}

/**
 * Quyết định cho 1 request.
 *
 * `failedOpen: true` = Redis lỗi/timeout và guard đã **CHO QUA** — caller PHẢI
 * đếm metric này (p2-01). Không được trộn với `allowed: false` (chặn thật).
 */
export interface RateLimitDecision {
  /** `true` = cho qua (kể cả khi fail-open). */
  allowed: boolean;
  /**
   * Thời gian chờ trước khi thử lại (ms). `0` khi `allowed: true`.
   * Client map sang header `Retry-After` (giây) ở middleware (p1-01).
   */
  retryAfterMs: number;

  /**
   * Burst còn lại ước lượng sau lần gọi này — không âm.
   *
   * **Lower bound**: khi `rule.burst > 0`, thấp hơn canonical đúng 1 ở các request còn burst;
   * request được phép cuối cùng raw là `-1`, `parseDecision` kẹp về `0` nên trùng canonical.
   * `burst = 0` (mặc định) sau kẹp cũng là `0`. Lệch có chủ đích về phía an toàn — client backoff
   * sớm hơn, không bao giờ muộn hơn. Vector cụ thể xem test R21. **Đừng** "sửa" thành canonical
   * GCRA: đó là đổi contract, không phải fix bug.
   */
  remainingBurst: number;

  /**
   * `true` khi Redis lỗi/timeout và guard chủ động cho qua.
   * Caller PHẢI đếm metric này — mất phòng thủ âm thầm nếu không.
   */
  failedOpen: boolean;
}

/** Input của `RateLimiter.checkRateLimit`. */
export interface RateLimitInput {
  /** Route id tĩnh do developer khai — VD `"keno.place-bet"`. */
  route: string;

  /** Ai đang bị đánh giá. */
  subject: GuardSubject;

  /** Ngưỡng GCRA. */
  rule: RateLimitRule;

  /**
   * Đồng hồ (epoch ms) inject từ ngoài — mặc định `Date.now()`.
   * Bắt buộc inject trong unit test để deterministic.
   */
  nowMs?: number;
}
