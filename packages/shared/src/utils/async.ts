/**
 * Async utilities dùng chung.
 */

/**
 * Dừng thực thi `ms` mili-giây (Promise wrapper của `setTimeout`).
 *
 * Dùng để giữ nhịp trong worker loop (vd stats-sync sleep giữa mỗi tick).
 * KHÔNG dùng cho retry/backoff HTTP (đã có cơ chế riêng trong `http-client`).
 *
 * @param ms - Số mili-giây cần dừng. Giá trị ≤ 0 resolve ngay.
 *
 * @example
 * ```ts
 * await sleep(10_000); // chờ 10s
 * ```
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
