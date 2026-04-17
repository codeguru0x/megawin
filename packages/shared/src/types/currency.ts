/**
 * Mã tiền tệ ISO 4217 được hỗ trợ trong hệ thống.
 *
 * Hiện chỉ VND. Mở rộng khi cần multi-currency.
 *
 * @example
 * ```ts
 * import { Currency, DEFAULT_CURRENCY } from "@megawin/shared/types";
 *
 * const item = { amount: 100_000, currency: DEFAULT_CURRENCY };
 * ```
 */
export const Currency = {
  /** Đồng Việt Nam. */
  VND: "VND",
} as const;

/** Union type của tất cả mã tiền tệ được hỗ trợ. */
export type Currency = (typeof Currency)[keyof typeof Currency];

/** Currency mặc định toàn hệ thống — VND. */
export const DEFAULT_CURRENCY: Currency = Currency.VND;
