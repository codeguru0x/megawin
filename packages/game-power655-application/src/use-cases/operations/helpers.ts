/**
 * Tính ngày tài chính hiện tại theo múi giờ Việt Nam.
 *
 * Quy ước: ngày tài chính tính từ 18h tối → 18h tối hôm sau
 * (Power 6/55 quay 18:00).
 * Nếu hiện tại < 18:00 thì financialDate = hôm qua, ngược lại = hôm nay.
 */
export function getFinancialDateToday(): string {
  const now = new Date();
  const vnOffset = 7 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const vnMinutes = utcMinutes + vnOffset;

  const vnDate = new Date(now.getTime() + vnOffset * 60_000);

  // Power 6/55 quay 18h → financial date thay đổi sau 18h
  if (vnMinutes % (24 * 60) < 18 * 60) {
    vnDate.setUTCDate(vnDate.getUTCDate() - 1);
  }

  const y = vnDate.getUTCFullYear();
  const m = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
