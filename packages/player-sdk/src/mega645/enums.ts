/**
 * Mega 6/45 SDK – Public Enums
 * @module
 */

/**
 * Kiểu chơi Mega 6/45.
 *
 * | Value      | Mô tả                          | Số số chọn | Số lines |
 * |------------|--------------------------------|-----------|----------|
 * | `"standard"` | Chọn đúng 6 số               | 6         | 1        |
 * | `"bao5"`   | Chọn 5 số, hệ thống bỏ 1 số    | 5         | 6        |
 * | `"bao7"`   | Bao 7 số, sinh C(7,6) lines    | 7         | 7        |
 * | `"bao8"`   | Bao 8 số, sinh C(8,6) lines    | 8         | 28       |
 * | `"bao9"`   | Bao 9 số, sinh C(9,6) lines    | 9         | 84       |
 * | `"bao10"`  | Bao 10 số, sinh C(10,6) lines  | 10        | 210      |
 * | `"bao11"`  | Bao 11 số, sinh C(11,6) lines  | 11        | 462      |
 * | `"bao12"`  | Bao 12 số, sinh C(12,6) lines  | 12        | 924      |
 * | `"bao13"`  | Bao 13 số, sinh C(13,6) lines  | 13        | 1716     |
 * | `"bao14"`  | Bao 14 số, sinh C(14,6) lines  | 14        | 3003     |
 * | `"bao15"`  | Bao 15 số, sinh C(15,6) lines  | 15        | 5005     |
 * | `"bao18"`  | Bao 18 số, sinh C(18,6) lines  | 18        | 18564    |
 */
export const Mega645PlayType = {
  Standard: "standard",
  Bao5: "bao5",
  Bao7: "bao7",
  Bao8: "bao8",
  Bao9: "bao9",
  Bao10: "bao10",
  Bao11: "bao11",
  Bao12: "bao12",
  Bao13: "bao13",
  Bao14: "bao14",
  Bao15: "bao15",
  Bao18: "bao18",
} as const;

export type Mega645PlayType = (typeof Mega645PlayType)[keyof typeof Mega645PlayType];

export const Mega645PrizeTier = {
  Jackpot: "jackpot",
  Tier1: "tier1",
  Tier2: "tier2",
  Tier3: "tier3",
} as const;

export type Mega645PrizeTier = (typeof Mega645PrizeTier)[keyof typeof Mega645PrizeTier];
