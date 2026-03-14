/**
 * Power 6/55 SDK – Public Enums
 * @module
 */

/**
 * Kiểu chơi Power 6/55.
 *
 * | Value       | Mô tả                              | Số số chọn | Số lines       |
 * |-------------|-------------------------------------|-----------|----------------|
 * | `"standard"`| Chọn đúng 6 số                     | 6         | 1              |
 * | `"bao5"`    | Bao 5: HT ghép 50 số còn lại (55-5) | 5         | 50             |
 * | `"bao7"`    | Bao 7 số, sinh C(7,6) lines         | 7         | 7              |
 * | `"bao8"`    | Bao 8 số, sinh C(8,6) lines         | 8         | 28             |
 * | `"bao9"`    | Bao 9 số, sinh C(9,6) lines         | 9         | 84             |
 * | `"bao10"`   | Bao 10 số, sinh C(10,6) lines       | 10        | 210            |
 * | `"bao11"`   | Bao 11 số, sinh C(11,6) lines       | 11        | 462            |
 * | `"bao12"`   | Bao 12 số, sinh C(12,6) lines       | 12        | 924            |
 * | `"bao13"`   | Bao 13 số, sinh C(13,6) lines       | 13        | 1716           |
 * | `"bao14"`   | Bao 14 số, sinh C(14,6) lines       | 14        | 3003           |
 * | `"bao15"`   | Bao 15 số, sinh C(15,6) lines       | 15        | 5005           |
 * | `"bao18"`   | Bao 18 số, sinh C(18,6) lines       | 18        | 18564          |
 *
 * **Lưu ý Bao 5**: Khác với Bao 7-18 (dùng tổ hợp C(N,6)), Bao 5 ghép từng số trong
 * 50 số còn lại (55-5=50) vào 5 số đã chọn → 50 bộ số dự thưởng.
 * Giá vé: 5 × 10.000đ = 500.000đ/kỳ. Tham khảo Vietlott chính thức.
 *
 * @example
 * ```typescript
 * // Đặt cược Bao 5: chọn 5 số, hệ thống ghép 50 số còn lại = 50 lines
 * await client.power655.placeBet({
 *   drawIds: ["2026-03-18.001"],
 *   boards: [{
 *     boardNo: "A",
 *     playType: Power655PlayType.Bao5,  // "bao5"
 *     selection: {
 *       mainNumbers: ["01", "15", "23", "37", "52"]  // 5 số
 *     }
 *   }]
 * });
 * // → Server expand thành 50 lines (mỗi line = 5 số trên + 1 trong 50 số còn lại)
 * // → Giá vé = 50 × 10.000đ = 500.000đ / kỳ
 * ```
 */
export const Power655PlayType = {
  Standard: "standard",
  /**
   * Bao 5: chọn 5 số, hệ thống ghép từng số trong 50 số còn lại (55-5=50) → 50 lines.
   * Giá vé = 50 × 10.000đ = 500.000đ / kỳ.
   */
  Bao5: "bao5",
  /** Bao 7: chọn 7 số → C(7,6) = 7 bộ số. Giá vé = 70.000đ / kỳ. */
  Bao7: "bao7",
  /** Bao 8: chọn 8 số → C(8,6) = 28 bộ số. Giá vé = 280.000đ / kỳ. */
  Bao8: "bao8",
  /** Bao 9: chọn 9 số → C(9,6) = 84 bộ số. Giá vé = 840.000đ / kỳ. */
  Bao9: "bao9",
  /** Bao 10: chọn 10 số → C(10,6) = 210 bộ số. Giá vé = 2.100.000đ / kỳ. */
  Bao10: "bao10",
  /** Bao 11: chọn 11 số → C(11,6) = 462 bộ số. Giá vé = 4.620.000đ / kỳ. */
  Bao11: "bao11",
  /** Bao 12: chọn 12 số → C(12,6) = 924 bộ số. Giá vé = 9.240.000đ / kỳ. */
  Bao12: "bao12",
  /** Bao 13: chọn 13 số → C(13,6) = 1.716 bộ số. Giá vé = 17.160.000đ / kỳ. */
  Bao13: "bao13",
  /** Bao 14: chọn 14 số → C(14,6) = 3.003 bộ số. Giá vé = 30.030.000đ / kỳ. */
  Bao14: "bao14",
  /** Bao 15: chọn 15 số → C(15,6) = 5.005 bộ số. Giá vé = 50.050.000đ / kỳ. */
  Bao15: "bao15",
  /** Bao 18: chọn 18 số → C(18,6) = 18.564 bộ số. Giá vé = 185.640.000đ / kỳ. */
  Bao18: "bao18",
} as const;

export type Power655PlayType = (typeof Power655PlayType)[keyof typeof Power655PlayType];

export const Power655PrizeTier = {
  Jackpot1: "jackpot1",
  Jackpot2: "jackpot2",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
} as const;

export type Power655PrizeTier = (typeof Power655PrizeTier)[keyof typeof Power655PrizeTier];
