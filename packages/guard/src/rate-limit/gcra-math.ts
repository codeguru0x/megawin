/**
 * GCRA math thuần — không I/O, không Redis.
 *
 * Tách khỏi `RateLimiter` để unit test ngưỡng (chỗ bug dễ lọt nhất) chạy rẻ,
 * không cần container.
 */

import { DEFAULT_RATE_LIMIT_BURST } from "../constants";
import type { RateLimitRule } from "../types";

/** Tham số đã quy đổi sang ms để truyền ARGV vào Lua GCRA. */
export interface GcraParams {
  /** Khoảng cách tối thiểu giữa 2 request ở steady rate (ms). */
  emissionIntervalMs: number;

  /** Độ "nợ" tối đa cho phép trước khi chặn (ms) = burst × emissionInterval. */
  delayToleranceMs: number;
}

/**
 * Quy đổi `{limit, windowSec, burst}` → `{emissionIntervalMs, delayToleranceMs}`.
 *
 * - `emissionIntervalMs = max(1, floor(windowSec * 1000 / limit))` — luôn số
 *   nguyên ms ≥ 1 (Lua nhận ARGV dạng string; số thập phân gây lệch âm thầm).
 * - `delayToleranceMs = burst * emissionIntervalMs` (`burst` mặc định
 *   {@link DEFAULT_RATE_LIMIT_BURST}) — tính theo `ei` **đã clamp**.
 *
 * Clamp sàn 1ms: `ei = 0` làm Lua tính `PX = 0` (Redis reject
 * `"invalid expire time"`) và chia 0 ở `remainingBurst` → script error →
 * fail-open **VĨNH VIỄN** cho route đó. Đạt được khi `limit > windowSec * 1000`
 * (VD `limit: 2000` / `windowSec: 1`) hoặc `windowSec` fractional
 * (`limit: 1000` / `windowSec: 0.5`). Trên 1000 req/s thì GCRA hết ý nghĩa
 * thực tế (`ei < 1ms` không biểu diễn được bằng ms) → clamp thay vì throw,
 * để cấu hình quá rộng không biến thành mất phòng thủ.
 *
 * @throws Nếu `limit`/`windowSec` ≤ 0 (chia cho 0 → `Infinity` xuống Lua).
 */
export function computeGcraParams(rule: RateLimitRule): GcraParams {
  if (rule.limit <= 0) {
    throw new Error(`computeGcraParams: limit phải > 0 — nhận ${rule.limit}`);
  }

  if (rule.windowSec <= 0) {
    throw new Error(`computeGcraParams: windowSec phải > 0 — nhận ${rule.windowSec}`);
  }

  const burst = rule.burst ?? DEFAULT_RATE_LIMIT_BURST;
  if (burst < 0) {
    throw new Error(`computeGcraParams: burst phải >= 0 — nhận ${burst}`);
  }

  // Clamp sàn 1ms — xem JSDoc hàm. `delayToleranceMs` tự đúng theo ei đã clamp.
  const emissionIntervalMs = Math.max(1, Math.floor((rule.windowSec * 1000) / rule.limit));
  const delayToleranceMs = burst * emissionIntervalMs;

  return { emissionIntervalMs, delayToleranceMs };
}
