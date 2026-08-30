/**
 * Format tiêu đề dialog công bố/sửa kết quả — thống nhất trên TẤT CẢ 7 game:
 * `"Kết quả — Kỳ {periodLabel} — {drawTime}"`. Thêm giờ quay vào cuối tiêu đề để staff
 * nhập/sửa kết quả biết ngay kỳ này quay lúc nào, dễ đối chiếu với trang Vietlott.
 *
 * `periodLabel` LUÔN là `draw.drawId` (format `YYYY-MM-DD.NNN`, zero-padded 3 chữ số) —
 * field này có mặt và cùng format trên `DrawSelectorItem` của cả 7 game, KHÔNG tự ghép
 * lại từ `drawNo`/`drawDate` riêng của từng game (dễ lệch format giữa các game).
 */
export function formatResultDialogTitle(periodLabel: string, drawTime: string): string {
  return `Kết quả — Kỳ ${periodLabel} — ${drawTime}`;
}
