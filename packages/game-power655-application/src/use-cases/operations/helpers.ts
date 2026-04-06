import { financialDateTodayVN } from "@megawin/shared/utils";

/**
 * Ngày tài chính hiện tại theo quy ước hệ thống (ranh giới 11:00 VN).
 *
 * Delegate sang `financialDateTodayVN()` từ shared để đảm bảo nhất quán
 * và không phụ thuộc system timezone của server.
 *
 * NOTE: Phiên bản cũ dùng threshold 18h (trùng giờ quay Power 6/55).
 * Đồng nhất về 11h theo quy ước hệ thống — phù hợp với getFinancialDate() từ shared.
 */
export function getFinancialDateToday(): string {
  return financialDateTodayVN();
}
