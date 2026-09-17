/**
 * Shared design tokens cho number badge trong heatmap grid — dùng chung cho TẤT CẢ game.
 *
 * Quyết định thiết kế: 1 size duy nhất (size-6 = 24px) cho tất cả game.
 * Game nhiều số hơn sẽ có nhiều hàng hơn, KHÔNG thu nhỏ badge.
 *
 * Áp dụng cho: Mega 6/45, Power 6/55, Keno.
 * Lotto 5/35 dùng `lotto-number-tokens.ts` riêng (size-6 sm = kết quả giống nhau).
 *
 * So sánh:
 * | Game       | Pool  | Cols | Rows |
 * |------------|-------|------|------|
 * | Lotto 5/35 | 35 số | 7    | 5    |
 * | Mega 6/45  | 45 số | 9    | 5    |
 * | Power 6/55 | 55 số | 11   | 5    |
 * | Keno       | 80 số | 10   | 8    |
 */

/** Kích thước badge tròn: size-6 = 24px. Đồng nhất tất cả game. */
export const HEATMAP_BADGE_SIZE = "size-6";

/** Font size trong badge. */
export const HEATMAP_BADGE_TEXT = "text-[11px]";

/**
 * Padding-top của ô cell trong grid.
 * Đảm bảo badge (size-6=24px, absolute top-1) không đè lên data text bên dưới.
 * Tính: top-1 (4px) + size-6 (24px) + gap nhỏ = pt-8 (32px).
 */
export const HEATMAP_CELL_PT = "pt-8";

/** Font size cho số tiền/count chính trong ô. */
export const HEATMAP_CELL_DATA_SIZE = "text-[11px]";

/** Font size cho text phụ (số lần, ×). */
export const HEATMAP_CELL_SUB_SIZE = "text-[10px]";
