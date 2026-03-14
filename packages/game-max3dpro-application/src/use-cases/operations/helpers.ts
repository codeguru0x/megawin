/**
 * helpers.ts — Utility functions cho operations use cases.
 *
 * Max 3D Pro quay 3 lần/tuần T3/T5/T7 lúc 18h00 → financialDate = drawDate.
 * Dùng cùng logic financialDate với Max 3D (ranh giới 11h VN).
 */

/**
 * Tính ngày tài chính hôm nay (ranh giới 11h sáng VN).
 *
 * Nếu hiện tại < 11:00 VN → financialDate = hôm qua (ngày trước chưa kết sổ).
 * Ngược lại → financialDate = hôm nay.
 */
export function getFinancialDateToday(): string {
  const now = new Date();
  const vnOffset = 7 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const vnMinutes = utcMinutes + vnOffset;

  const vnDate = new Date(now.getTime() + vnOffset * 60_000);

  // Trước 11h sáng VN → vẫn còn trong ngày tài chính hôm qua
  if (vnMinutes % (24 * 60) < 11 * 60) {
    vnDate.setUTCDate(vnDate.getUTCDate() - 1);
  }

  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
