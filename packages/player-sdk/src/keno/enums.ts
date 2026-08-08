/**
 * Keno SDK – Public Enums
 *
 * Các enum constants cho game Keno.
 *
 * @module
 */

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi Keno.
 *
 * | Value      | Mô tả                  | Chọn bao nhiêu số |
 * |------------|------------------------|--------------------|
 * | `"pick1"`  | Chọn 1 số             | 1                  |
 * | `"pick2"`  | Chọn 2 số             | 2                  |
 * | ...        | ...                    | ...                |
 * | `"pick10"` | Chọn 10 số            | 10                 |
 * | `"bigSmall"` | Cược Lớn/Nhỏ       | —                  |
 * | `"evenOdd"`  | Cược Chẵn/Lẻ       | —                  |
 */
export const KenoPlayType = {
  Pick1: "pick1",
  Pick2: "pick2",
  Pick3: "pick3",
  Pick4: "pick4",
  Pick5: "pick5",
  Pick6: "pick6",
  Pick7: "pick7",
  Pick8: "pick8",
  Pick9: "pick9",
  Pick10: "pick10",
  BigSmall: "bigSmall",
  EvenOdd: "evenOdd",
} as const;

/** Kiểu chơi Keno (union type). */
export type KenoPlayType = (typeof KenoPlayType)[keyof typeof KenoPlayType];

// ─────────────────────────────────────────────
// Side Bet Selections
// ─────────────────────────────────────────────

/**
 * Lựa chọn cược Lớn/Nhỏ.
 *
 * Dựa trên tổng 20 số trúng thưởng:
 * - `"big"` — >= 13 số lớn (41-80)
 * - `"bigSmallDraw"` — 10 số lớn, 10 số nhỏ (hòa)
 * - `"small"` — >= 13 số nhỏ (1-40)
 */
export const KenoBigSmallBet = {
  Big: "big",
  BigSmallDraw: "bigSmallDraw",
  Small: "small",
} as const;

/** Lựa chọn Lớn/Nhỏ (union type). */
export type KenoBigSmallBet = (typeof KenoBigSmallBet)[keyof typeof KenoBigSmallBet];

/**
 * Lựa chọn cược Chẵn/Lẻ.
 *
 * Dựa trên tổng 20 số trúng thưởng:
 * - `"even"` — >= 13 số chẵn
 * - `"even1112"` — 11 hoặc 12 số chẵn
 * - `"evenOddDraw"` — 10 chẵn, 10 lẻ (hòa)
 * - `"odd1112"` — 11 hoặc 12 số lẻ
 * - `"odd"` — >= 13 số lẻ
 */
export const KenoEvenOddBet = {
  Even: "even",
  Even1112: "even1112",
  EvenOddDraw: "evenOddDraw",
  Odd1112: "odd1112",
  Odd: "odd",
} as const;

/** Lựa chọn Chẵn/Lẻ (union type). */
export type KenoEvenOddBet = (typeof KenoEvenOddBet)[keyof typeof KenoEvenOddBet];

// ─────────────────────────────────────────────
// Ticket Display Status
// ─────────────────────────────────────────────

/**
 * Trạng thái vé Keno hiển thị cho người chơi.
 *
 * - `"pending"` — Đang chờ xử lý
 * - `"active"` — Đang tham gia kỳ quay
 * - `"completed"` — Đã hoàn tất
 */
export const KenoTicketDisplayStatus = {
  Pending: "pending",
  Active: "active",
  Completed: "completed",
} as const;

/** Trạng thái vé Keno (union type). */
export type KenoTicketDisplayStatus = (typeof KenoTicketDisplayStatus)[keyof typeof KenoTicketDisplayStatus];
