/**
 * Power 6/55 – Combo Key helper (pure).
 *
 * Khoá ổn định cho 1 board cược: `${playType}:${sortedMainNumbers.join(",")}`.
 * VD: `"bao7:01,05,12,20,33,40,55"`. Dùng chung cho worker combo-stats
 * (`Power655StatsAccumulator`), tra cứu staff (`GetComboLookupUseCase`), và minh bạch
 * player (`GetComboPopularityUseCase`, p1-01) — 1 nguồn duy nhất để 3 nơi không bao giờ
 * lệch key.
 *
 * KHÁC Keno: key theo BOARD người chơi chọn (không expand lines) — vé Bao 18 (18 số)
 * là 1 combo doc, KHÔNG C(18,6) = 18.564 combo (analysis §3.5).
 *
 * Số đã ở dạng string "01".."55" (zero-padded) nên sort từ điển = sort số.
 */

/**
 * Build combo key từ playType + danh sách số.
 *
 * @param playType - Loại chơi (`standard`, `bao5`, `bao7`..`bao15`, `bao18`).
 * @param mainNumbers - Số dạng "01".."55". Được copy + sort tăng dần trước khi join.
 */
export function buildComboKey(playType: string, mainNumbers: readonly string[]): string {
  return `${playType}:${[...mainNumbers].sort().join(",")}`;
}
