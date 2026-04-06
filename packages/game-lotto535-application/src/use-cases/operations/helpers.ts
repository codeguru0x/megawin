import { financialDateTodayVN } from "@megawin/shared/utils";

/**
 * Ngày tài chính hiện tại theo quy ước hệ thống (ranh giới 11:00 VN).
 *
 * Delegate sang `financialDateTodayVN()` từ shared để đảm bảo nhất quán
 * và không phụ thuộc system timezone của server.
 */
export function getFinancialDateToday(): string {
  return financialDateTodayVN();
}
