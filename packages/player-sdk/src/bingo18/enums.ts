/**
 * Bingo 18 SDK – Public Enums
 *
 * Các enum constants cho game Bingo 18 (xúc xắc 3 viên).
 *
 * @module
 */

// ─────────────────────────────────────────────
// Play Type
// ─────────────────────────────────────────────

/**
 * Kiểu chơi Bingo 18.
 *
 * Bingo 18 dùng 3 viên xúc xắc, mỗi viên cho giá trị 1-6.
 * Tất cả loại cược đều nằm trong `boards[]`:
 *
 * **Board cơ bản:**
 * | Value           | Mô tả                                                   |
 * |-----------------|---------------------------------------------------------|
 * | `"singleNum"`   | Đoán 1 số xuất hiện bao nhiêu lần trong 3 xúc xắc      |
 * | `"doubleMatch"` | Đoán ít nhất 2 trong 3 xúc xắc có giá trị giống nhau   |
 * | `"tripleMatch"` | Đoán cả 3 xúc xắc có giá trị giống nhau                |
 *
 * **Board cược bổ sung:**
 * | Value           | Mô tả                                                   |
 * |-----------------|---------------------------------------------------------|
 * | `"sumTotal"`    | Đoán tổng 3 xúc xắc bằng đúng 1 giá trị (3-18)         |
 * | `"bigSmallDraw"`| Đoán Tài (11-18) / Xỉu (3-8) / Hoà (9-10)              |
 */
export const Bingo18PlayType = {
  /** Đoán 1 số xuất hiện ×1, ×2, hoặc ×3 lần. */
  SingleNum: "singleNum",
  /** Đoán ít nhất 2 xúc xắc có cùng giá trị. */
  DoubleMatch: "doubleMatch",
  /** Đoán cả 3 xúc xắc có cùng giá trị. */
  TripleMatch: "tripleMatch",
  /** Đoán tổng 3 xúc xắc bằng đúng 1 giá trị cụ thể (3-18). */
  SumTotal: "sumTotal",
  /** Đoán Tài (tổng 11-18) / Xỉu (tổng 3-8) / Hoà (tổng 9-10). */
  BigSmallDraw: "bigSmallDraw",
} as const;

/** Kiểu chơi Bingo 18 (union type). */
export type Bingo18PlayType = (typeof Bingo18PlayType)[keyof typeof Bingo18PlayType];

// ─────────────────────────────────────────────
// Triple Kind
// ─────────────────────────────────────────────

/**
 * Dạng cược bộ ba (`tripleMatch`) trong Bingo 18.
 *
 * | Value        | Mô tả                                                      |
 * |--------------|------------------------------------------------------------|
 * | `"specific"` | Chỉ định cụ thể giá trị bộ ba (VD: ba số 5)               |
 * | `"any"`      | Bất kỳ bộ ba nào (3 xúc xắc đều bằng nhau, không quan trọng giá trị) |
 */
export const Bingo18TripleKind = {
  /** Chỉ định cụ thể giá trị (VD: `number: 5` → cả 3 xúc xắc đều là 5). */
  Specific: "specific",
  /** Bất kỳ bộ ba nào (thắng khi 3 xúc xắc đều bằng nhau). */
  Any: "any",
} as const;

/** Dạng bộ ba `tripleMatch` (union type). */
export type Bingo18TripleKind = (typeof Bingo18TripleKind)[keyof typeof Bingo18TripleKind];

// ─────────────────────────────────────────────
// Big/Small/Draw Bet
// ─────────────────────────────────────────────

/**
 * Lựa chọn cược Tài/Xỉu/Hoà trong Bingo 18.
 *
 * Dựa trên tổng 3 xúc xắc:
 * | Value     | Điều kiện         | Mô tả        |
 * |-----------|-------------------|--------------|
 * | `"big"`   | Tổng 11-18        | Tài          |
 * | `"draw"`  | Tổng 9-10         | Hoà          |
 * | `"small"` | Tổng 3-8          | Xỉu          |
 *
 * Lưu ý: Tổng 9 và 10 được coi là "Hoà" — đặc trưng riêng của Bingo 18,
 * khác với game Tài/Xỉu truyền thống.
 */
export const Bingo18BigSmallBet = {
  /** Tài — tổng 3 xúc xắc từ 11 đến 18. */
  Big: "big",
  /** Hoà — tổng 3 xúc xắc bằng 9 hoặc 10. */
  Draw: "draw",
  /** Xỉu — tổng 3 xúc xắc từ 3 đến 8. */
  Small: "small",
} as const;

/** Lựa chọn Tài/Xỉu/Hoà (union type). */
export type Bingo18BigSmallBet = (typeof Bingo18BigSmallBet)[keyof typeof Bingo18BigSmallBet];
