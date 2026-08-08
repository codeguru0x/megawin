/**
 * Types cho Balance API — query số dư ví player.
 *
 * MegaWin gọi `GET /balance` để lấy balance hiện tại.
 * Dùng để hiển thị cho player trước/sau khi đặt cược.
 *
 * Response theo {@link CallbackResponse} envelope — xem `shared/types.ts`.
 */

import type { Currency } from "@megawin/shared/types";

import type { BalanceErrorCode, CallbackResponse } from "../shared/types";

// ─────────────────────────────────────────────────────────────────────────────
// Request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query parameters cho balance check.
 *
 * MegaWin gửi `playerId` và optional `currency` qua query string:
 * `GET /balance?playerId=john_doe&currency=VND`
 *
 * `currency` mặc định `"VND"` — MegaWin luôn gửi kèm, nhưng nếu không có,
 * client tự điền `"VND"` trước khi gọi HTTP.
 *
 * @example
 * ```ts
 * const req: GetBalanceRequest = {
 *   playerId: "john_doe",
 *   // currency mặc định "VND" nếu không truyền
 * };
 * ```
 */
export interface GetBalanceRequest {
  /**
   * Player ID trong hệ thống tenant — dùng để lookup ví.
   *
   * Giá trị là **lowercase username** mà tenant đăng ký khi tạo player.
   *
   * @example `"john_doe"`
   */
  playerId: string;

  /**
   * Mã tiền tệ cần query. Mặc định `"VND"` nếu không truyền.
   *
   * Hiện tại MegaWin chỉ hỗ trợ `"VND"`. Client tự điền default trước
   * khi gọi HTTP — query string luôn có `currency=VND`.
   *
   * @example `"VND"`
   * @default `"VND"`
   */
  currency?: Currency;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response — CallbackResponse<BalanceData>
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dữ liệu balance trả về khi query thành công.
 *
 * Nằm trong `CallbackResponse.data` khi `success: true`.
 * Tenant trả balance tại thời điểm hiện tại — MegaWin dùng để:
 * - Hiển thị cho player trên UI game.
 * - Pre-validate trước khi gọi debit (optional, debit vẫn validate phía tenant).
 *
 * @example
 * ```ts
 * { playerId: "john_doe", balance: 1500000, currency: "VND" }
 * ```
 */
export interface BalanceData {
  /** Player ID — echo lại từ request. @example `"john_doe"` */
  playerId: string;

  /**
   * Số dư hiện tại của ví player (VND).
   *
   * Giá trị >= 0. Tenant trả balance tại thời điểm xử lý request.
   * Nếu player có nhiều loại ví, trả balance của ví chính (main wallet).
   */
  balance: number;

  /** Mã tiền tệ. @example `"VND"` */
  currency: Currency;
}

/**
 * Response balance từ tenant server — theo {@link CallbackResponse} envelope.
 *
 * Error code dùng {@link BalanceErrorCode} — 3 mã lỗi hợp lệ:
 * `"PLAYER_NOT_FOUND"`, `"INVALID_CURRENCY"` và `"INTERNAL_ERROR"`.
 *
 * - `success: true` + `data: BalanceData` → query OK, đọc balance.
 * - `success: false` + `error: CallbackErrorInfo<BalanceErrorCode>` → thất bại.
 *
 * @example
 * ```ts
 * // Thành công
 * { success: true, data: { playerId: "john_doe", balance: 1500000, currency: "VND" } }
 *
 * // Player không tồn tại
 * { success: false, error: { code: "PLAYER_NOT_FOUND", message: "Player not found" } }
 *
 * // Currency không hỗ trợ
 * { success: false, error: { code: "INVALID_CURRENCY", message: "Currency USD not supported" } }
 * ```
 */
export type GetBalanceResponse = CallbackResponse<BalanceData, BalanceErrorCode>;
