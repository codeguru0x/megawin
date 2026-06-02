/**
 * Game Core – Shared Types
 *
 * Các kiểu dữ liệu dùng chung cho tất cả game trong hệ thống.
 * Tách riêng để các game import mà không cần định nghĩa lại.
 *
 * Quy ước chung cho mọi game:
 * - Số luôn lưu dạng number (không phải string "01").
 * - Hiển thị padStart ở UI layer.
 * - Tiền lưu dạng integer VND (không float).
 * - Ngày report dùng ISODateString "YYYY-MM-DD".
 * - Timestamp dùng Date.
 */

/**
 * Ngày dạng ISO string "YYYY-MM-DD".
 * Dùng cho drawDate, report grouping – aggregation nhanh hơn Date object.
 * Timezone cố định: Asia/Ho_Chi_Minh.
 */
export type ISODateString = string;

/**
 * Re-export MongoDB Long type – dùng cho feedVersion field trong entry documents.
 * Các game packages import từ đây thay vì depend trực tiếp vào mongodb.
 */
export type { Long } from "mongodb";

// ─────────────────────────────────────────────
// Draw Embedded Documents (dùng chung cho tất cả game)
// ─────────────────────────────────────────────

/**
 * Cửa sổ bán vé của một kỳ quay.
 *
 * Cấu trúc giống nhau cho mọi game (Lotto535, Keno, Max3d, ...).
 * Mỗi game import từ đây thay vì tự định nghĩa lại.
 */
export interface DrawSales {
  /** Thời điểm mở bán. undefined nếu chưa mở. */
  openAt?: Date;
  /** Thời điểm đóng bán = drawTime - salesCloseBeforeMinutes/Seconds (từ game config). */
  closeAt: Date;
}

/**
 * Tham chiếu đến kỳ quay Vietlott chính thức tương ứng (dùng để đối soát).
 *
 * Cấu trúc giống nhau cho mọi game. Mỗi game import từ đây thay vì tự định nghĩa lại.
 */
export interface DrawVietlottRef {
  /** Mã kỳ quay Vietlott (ví dụ "00123"). Lấy từ website/hệ thống Vietlott. */
  drawPeriod: string;
  /** Ngày quay Vietlott, format "YYYY-MM-DD". */
  drawDate: ISODateString;
}

// ─────────────────────────────────────────────
// Draw Tenant Financial (dùng chung cho tất cả game)
// ─────────────────────────────────────────────

/**
 * Breakdown tài chính theo từng tenant trong 1 kỳ quay.
 * Cấu trúc giống nhau cho mọi game (Lotto535, Keno, Max3d, ...).
 */
export interface DrawTenantFinancial {
  /** ID tenant. */
  tenantId: string;

  /** Doanh thu từ tenant này trong kỳ. */
  revenue: number;

  /** Hoa hồng đại lý. */
  commission: number;

  /** Tỷ lệ hoa hồng áp dụng (snapshot). */
  commissionRate: number;

  /** Số entry từ tenant này. */
  entryCount: number;
}
