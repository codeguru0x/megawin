/**
 * Lotto 5/35 – Combo Key helper (pure).
 *
 * Khoá ổn định cho 1 board cược: `${playType}:${sortedMain.join(",")}|${sortedSpecial.join(",")}`.
 * VD: `"mainCover6:01,05,12,20,33,35|07"`. Dùng chung cho worker combo-stats
 * (`Lotto535StatsAccumulator`), tra cứu staff (`GetComboLookupUseCase`), và minh
 * bạch player (`GetComboPopularityUseCase`, p1-01) — 1 nguồn duy nhất để 3 nơi
 * không bao giờ lệch key.
 *
 * KHÁC Power 6/55 (`packages/game-power655/src/rules/combo-key.ts`): thêm chiều
 * số ĐẶC BIỆT — Power 6/55 chỉ có 1 chiều số (main), Lotto 5/35 luôn có main +
 * special (1..12 số ĐB tuỳ playType). Thiếu chiều special sẽ khiến 2 board khác
 * số ĐB gộp làm 1 key → rule `combo_concentration` sai (2 nhóm người chơi khác
 * nhau bị tính chung 1 combo).
 *
 * Thay thế comboKey inline trong `aggregateTopCombos` cũ (format `playType|main|special`)
 * — data on-read cũ KHÔNG migrate vì use-case bị xoá ở p0-03 (analysis §5.3).
 *
 * Số đã ở dạng string "01".."35"/"01".."12" (zero-padded) nên sort từ điển = sort số.
 */

/**
 * Build combo key từ playType + danh sách số chính + danh sách số đặc biệt.
 *
 * Sort trên **bản copy** (`toSorted`) — KHÔNG mutate input, tuân §5.3 mongodb.mdc
 * (mảng đầu vào có thể được caller tái sử dụng sau lệnh gọi này).
 *
 * @param playType - Loại chơi (`standard`, `mainCover4`, `mainCover`, `specialCover`).
 * @param mainNumbers - Số chính dạng "01".."35". Copy + sort tăng dần trước khi join.
 * @param specialNumbers - Số đặc biệt dạng "01".."12". Copy + sort tăng dần trước khi join.
 */
export function buildComboKey(
  playType: string,
  mainNumbers: readonly string[],
  specialNumbers: readonly string[],
): string {
  const sortedMain = mainNumbers.toSorted().join(",");
  const sortedSpecial = specialNumbers.toSorted().join(",");
  return `${playType}:${sortedMain}|${sortedSpecial}`;
}
