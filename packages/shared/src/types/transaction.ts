/**
 * Transaction primitives — shared giữa tất cả packages.
 *
 * Đây là Single Source of Truth cho TransactionAction và TransactionReason.
 * Cả `@megawin/game-core` (entity layer) và `@megawin/tenant-gateway`
 * (infrastructure layer) đều import từ đây.
 *
 * Pattern: const object + type extraction — truy cập giá trị qua
 * `TransactionAction.Debit` thay vì string literal `"debit"`.
 *
 * @example
 * ```ts
 * import { TransactionAction, TransactionReason } from "@megawin/shared/types";
 *
 * const action = TransactionAction.Debit; // "debit"
 * const reason = TransactionReason.Bet;   // "bet"
 * ```
 */

// ─────────────────────────────────────────────
// Transaction Action
// ─────────────────────────────────────────────

/**
 * Hành động trên ví player — tenant chỉ cần 1 `if/else` cho money flow.
 *
 * | Key      | Value     | Ý nghĩa                                 |
 * |----------|-----------|------------------------------------------|
 * | `Debit`  | `"debit"` | Trừ tiền ví player (player → MegaWin)    |
 * | `Credit` | `"credit"`| Cộng tiền ví player (MegaWin → player)   |
 */
export const TransactionAction = {
  /** Trừ tiền ví player (player → MegaWin). */
  Debit: "debit",
  /** Cộng tiền ví player (MegaWin → player). */
  Credit: "credit",
} as const;

export type TransactionAction = (typeof TransactionAction)[keyof typeof TransactionAction];

// ─────────────────────────────────────────────
// Transaction Reason
// ─────────────────────────────────────────────

/**
 * Lý do giao dịch — dùng cho audit trail và reporting, **không ảnh hưởng** logic xử lý tiền.
 *
 * Tenant ghi reason vào transaction log để đối soát. Logic cộng/trừ tiền
 * chỉ dựa vào {@link TransactionAction}, không cần mapping reason → direction.
 *
 * | Key          | Value          | Action thường đi kèm | Mô tả                                       |
 * |--------------|----------------|----------------------|---------------------------------------------|
 * | `Bet`        | `"bet"`        | `debit`              | Player đặt cược — trừ tiền vé               |
 * | `Payout`     | `"payout"`     | `credit`             | Trả thưởng sau khi settle kỳ quay           |
 * | `Refund`     | `"refund"`     | `credit`             | Hoàn tiền khi kỳ quay bị huỷ (void draw)   |
 * | `Rollback`   | `"rollback"`   | `credit`             | Hoàn lại debit lỗi (place-bet thất bại)     |
 * | `Bonus`      | `"bonus"`      | `credit`             | Thưởng khuyến mãi từ hệ thống               |
 * | `Adjustment` | `"adjustment"` | `debit` hoặc `credit`| Điều chỉnh thủ công bởi operator            |
 *
 * ## `adjustment` + `debit` — thu hồi tiền đã credit sai
 *
 * `adjustment` là reason duy nhất có thể đi kèm `debit` **ngoài bet**.
 * Kịch bản: MegaWin credit payout sai, sau đó gửi `adjustment debit` thu hồi.
 *
 * Tenant xử lý adjustment debit **giống bet debit** — check balance >= amount.
 * Nếu không đủ → trả `INSUFFICIENT_BALANCE`.
 *
 * **Khi MegaWin buộc phải thu hồi (player đã rút tiền):**
 * MegaWin gửi `force: true` trong request. Tenant thấy `force: true` →
 * trừ tiền kể cả balance < amount (cho phép âm) → trả `success: true`.
 * Xem {@link TransactionRequest.force} và {@link BatchTransactionItem.force}.
 *
 * `credit` operations (`payout`, `refund`, `rollback`, `bonus`) không thể
 * gặp INSUFFICIENT_BALANCE vì cộng tiền không cần kiểm tra số dư.
 */
export const TransactionReason = {
  /** Player đặt cược — trừ tiền vé. */
  Bet: "bet",
  /** Trả thưởng sau khi settle kỳ quay. */
  Payout: "payout",
  /** Hoàn tiền khi kỳ quay bị huỷ (void draw). */
  Refund: "refund",
  /** Hoàn lại debit lỗi (place-bet thất bại). */
  Rollback: "rollback",
  /** Thưởng khuyến mãi từ hệ thống. */
  Bonus: "bonus",
  /** Điều chỉnh thủ công bởi operator. */
  Adjustment: "adjustment",
} as const;

export type TransactionReason = (typeof TransactionReason)[keyof typeof TransactionReason];
