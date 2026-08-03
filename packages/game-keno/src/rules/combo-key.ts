/**
 * Keno – Combo Key helper (pure).
 *
 * Khoá ổn định cho 1 bộ số cược: `${playType}:${sortedNumbers.join(",")}`.
 * VD: `"pick10:01,05,12,...,79"`. Dùng chung cho worker combo-stats, tra cứu staff,
 * và minh bạch player — 1 nguồn duy nhất để 3 nơi không bao giờ lệch key.
 *
 * Số đã ở dạng string "01".."80" (zero-padded) nên sort từ điển = sort số.
 */

/**
 * Build combo key từ playType + danh sách số.
 *
 * @param playType - Loại chơi basic (thường pick8/9/10 cappable).
 * @param numbers - Số dạng "01".."80". Được copy + sort tăng dần trước khi join.
 */
export function buildComboKey(playType: string, numbers: readonly string[]): string {
  return `${playType}:${[...numbers].sort().join(",")}`;
}
