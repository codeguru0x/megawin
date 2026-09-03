/**
 * Max 3D SDK – Public Enums
 * @module
 */

/**
 * Chế độ chơi Max 3D.
 *
 * - `"basic"` — chơi 1 bộ ba số, so với từng bộ trong kết quả quay riêng lẻ
 * - `"plus"` — chơi 2 bộ ba số kết hợp thành cặp, so với các cặp trong kết quả
 */
export const Max3dPlayMode = {
  Basic: "basic",
  Plus: "plus",
} as const;

export type Max3dPlayMode = (typeof Max3dPlayMode)[keyof typeof Max3dPlayMode];

/**
 * Kiểu chơi Max 3D.
 *
 * | Value      | Mô tả                                       | Áp dụng    |
 * |------------|---------------------------------------------|------------|
 * | `"straight"` | So khớp đúng thứ tự (VD: "123" = "123")   | Basic + Plus |
 * | `"combo3"` | Có 1 cặp số trùng (2 chữ số giống nhau) — sinh 3 hoán vị | Basic only |
 * | `"combo6"` | 3 chữ số khác nhau — sinh 6 hoán vị          | Basic only |
 *
 * Lưu ý: Plus chỉ dùng `straight`. Combo không áp dụng cho Plus.
 */
export const Max3dPlayType = {
  Straight: "straight",
  Combo3: "combo3",
  Combo6: "combo6",
} as const;

export type Max3dPlayType = (typeof Max3dPlayType)[keyof typeof Max3dPlayType];

export const Max3dBasicPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
} as const;

export type Max3dBasicPrizeTier = (typeof Max3dBasicPrizeTier)[keyof typeof Max3dBasicPrizeTier];

export const Max3dPlusPrizeTier = {
  Special: "special",
  First: "first",
  Second: "second",
  Third: "third",
  Fourth: "fourth",
  Fifth: "fifth",
  Sixth: "sixth",
} as const;

export type Max3dPlusPrizeTier = (typeof Max3dPlusPrizeTier)[keyof typeof Max3dPlusPrizeTier];
