/**
 * AI Chat — format giá trị ô cho generic tool view (`view-spec.ts`).
 *
 * Chỉ bọc formatter SẴN CÓ của `@megawin/shared/utils` — KHÔNG tự viết logic format số/tiền
 * (DRY, `code-quality-standards.mdc` §5). Mục đích duy nhất: cho spec khai báo `format: "vnd"`
 * thay vì truyền function, để spec giữ được tính khai báo (serialize/so sánh/test dễ).
 */

import { formatNumber, formatPercent, formatVND, formatVNDCompact } from "@megawin/shared/utils";

/**
 * Cách hiển thị 1 giá trị. Cố tình HẸP — thêm biến thể mới phải cân nhắc: nếu cần logic điều
 * kiện theo dữ liệu thì đó là dấu hiệu phải viết renderer bespoke, không nới DSL này.
 */
export const CellFormat = {
  /** Ngày `YYYY-MM-DD` hoặc ISO string — cắt lấy phần ngày, hiển thị mono. */
  Date: "date",
  /** Số nguyên có phân cách nghìn: `1,234,567`. */
  Number: "number",
  /** Phần trăm 1 số thập phân: `72.5%`. Input là số đã ở thang phần trăm (72.5, không phải 0.725). */
  Percent: "percent",
  /** Chuỗi thô — `String(value)`, dùng cho id/tên/gameKey. */
  Text: "text",
  /** Tiền VND đầy đủ: `1,000,000 ₫`. */
  Vnd: "vnd",
  /** Tiền VND rút gọn: `1.5 tỷ`, `200 triệu` — dùng cho KPI tile hẹp. */
  VndCompact: "vndCompact",
} as const;
export type CellFormat = (typeof CellFormat)[keyof typeof CellFormat];

/** `"2026-08-16T07:12:00.000Z"` → `"2026-08-16"`. Giá trị đã là `YYYY-MM-DD` thì giữ nguyên. */
function formatDateCell(value: string): string {
  return value.length > 10 && value.includes("T") ? value.slice(0, 10) : value;
}

/**
 * Format 1 giá trị theo `CellFormat`. Giá trị không dùng được với format số (null/undefined/
 * không phải number) trả `"—"` thay vì `0` — hiển thị `0` cho dữ liệu THIẾU là sai lệch nghiêm
 * trọng trong báo cáo tài chính (staff không phân biệt được "không có số" và "số bằng 0").
 */
export function formatCell(value: unknown, format: CellFormat = CellFormat.Text): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (format === CellFormat.Text) {
    return String(value);
  }

  if (format === CellFormat.Date) {
    return typeof value === "string" ? formatDateCell(value) : String(value);
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  switch (format) {
    case CellFormat.Number:
      return formatNumber(value);
    case CellFormat.Percent:
      return formatPercent(value);
    case CellFormat.Vnd:
      return formatVND(value);
    case CellFormat.VndCompact:
      return formatVNDCompact(value);
    default:
      return String(value);
  }
}
