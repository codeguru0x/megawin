/**
 * Shared – `financialPeriodKey` (gộp ngày tài chính thành kỳ ngày/tuần/tháng)
 *
 * PURE — không DB, không mock, không phụ thuộc timezone hệ thống.
 *
 * Khoá 3 hành vi mà báo cáo xu hướng + biểu đồ theo thời gian dựa vào:
 * - Tuần luôn quy về **thứ Hai**, kể cả khi ngày đầu vào là Chủ nhật (`getUTCDay()` trả 0 cho Chủ
 *   nhật; dùng thẳng số đó sẽ giữ nguyên Chủ nhật làm khoá và tách nó thành một tuần riêng).
 * - Khoá **sort lexicographic đúng thứ tự thời gian** ở cả 3 độ chia — trục X biểu đồ lấy đúng thứ
 *   tự này, sai thứ tự là đường xu hướng đi ngược.
 * - Không lệ thuộc timezone máy chạy: `financialDate` đã chốt sẵn (mốc 11:00 giờ VN áp lúc tạo
 *   draw), gộp kỳ chỉ là phép chia lịch trên chuỗi.
 */

import { describe, expect, it } from "vitest";

import { FinancialPeriod, financialPeriodKey } from "../src/utils/financial-date";

describe("financialPeriodKey", () => {
  it("giữ nguyên ngày với độ chia day", () => {
    expect(financialPeriodKey("2026-06-17", FinancialPeriod.Day)).toBe("2026-06-17");
  });

  it("trả YYYY-MM với độ chia month", () => {
    expect(financialPeriodKey("2026-06-17", FinancialPeriod.Month)).toBe("2026-06");
    expect(financialPeriodKey("2026-01-01", FinancialPeriod.Month)).toBe("2026-01");
    expect(financialPeriodKey("2026-12-31", FinancialPeriod.Month)).toBe("2026-12");
  });

  it("quy mọi ngày trong tuần về đúng thứ Hai", () => {
    // 15/06/2026 là thứ Hai; cả 7 ngày 15–21/06 phải cùng một khoá.
    const week = ["2026-06-15", "2026-06-16", "2026-06-17", "2026-06-18", "2026-06-19", "2026-06-20", "2026-06-21"];
    for (const day of week) {
      expect(financialPeriodKey(day, FinancialPeriod.Week)).toBe("2026-06-15");
    }
  });

  it("Chủ nhật lùi 6 ngày, KHÔNG tự thành đầu tuần", () => {
    // 21/06/2026 là Chủ nhật — `getUTCDay()` = 0. Nếu lấy thẳng số đó làm số ngày phải lùi thì
    // Chủ nhật giữ nguyên khoá của chính nó và tách thành tuần thứ hai (lỗi off-by-one).
    expect(financialPeriodKey("2026-06-21", FinancialPeriod.Week)).toBe("2026-06-15");
    expect(financialPeriodKey("2026-06-22", FinancialPeriod.Week)).toBe("2026-06-22");
  });

  it("tuần vắt qua ranh giới tháng/năm vẫn về thứ Hai của tuần đó", () => {
    // 01/07/2026 là thứ Tư → thứ Hai của tuần nằm ở tháng 6.
    expect(financialPeriodKey("2026-07-01", FinancialPeriod.Week)).toBe("2026-06-29");
    // 01/01/2026 là thứ Năm → thứ Hai của tuần nằm ở năm 2025.
    expect(financialPeriodKey("2026-01-01", FinancialPeriod.Week)).toBe("2025-12-29");
  });

  it("sort lexicographic của khoá đúng thứ tự thời gian ở cả 3 độ chia", () => {
    const dates = ["2026-06-17", "2026-01-05", "2026-12-31", "2026-02-28"];
    for (const period of Object.values(FinancialPeriod)) {
      const keys = dates.map((d) => financialPeriodKey(d, period));
      const byKey = keys.toSorted();
      const byDate = dates.toSorted().map((d) => financialPeriodKey(d, period));
      expect(byKey).toEqual(byDate);
    }
  });
});
