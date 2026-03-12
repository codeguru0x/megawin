/**
 * Tính ngày tài chính hiện tại theo múi giờ Việt Nam.
 *
 * Keno: ngày tài chính bắt đầu từ kỳ quay đầu tiên lúc 06:00 mỗi ngày.
 * Quy ước giống game khác: 11h sáng → 11h sáng hôm sau.
 * (Thực tế Keno có kỳ từ 06:00 nên window 11h hợp lý.)
 */
export function getFinancialDateToday(): string {
  const now = new Date();
  const vnOffset = 7 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const vnMinutes = utcMinutes + vnOffset;

  const vnDate = new Date(now.getTime() + vnOffset * 60_000);

  // Trước 11h sáng VN → vẫn thuộc ngày tài chính hôm qua
  if (vnMinutes % (24 * 60) < 11 * 60) {
    vnDate.setUTCDate(vnDate.getUTCDate() - 1);
  }

  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
