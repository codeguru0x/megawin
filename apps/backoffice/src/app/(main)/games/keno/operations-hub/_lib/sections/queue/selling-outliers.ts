/**
 * Ops Hub — Zone 5B Lớp 1: Top-N bất thường (guideline §5B, §9.2 · viết lại theo p1-05 §B8.1)
 *
 * ĐÃ BỎ điều kiện "kỳ chết" (`revenue === 0 && ageSinceOpen > 30 phút`) — review 07/09 (§A6)
 * chỉ ra đây là SUY ĐOÁN TIÊU CỰC + SAI LOGIC: kỳ mở bán chưa có cược là trạng thái BÌNH
 * THƯỜNG (128 kỳ/ngày mở đều 8 phút/kỳ, không phải kỳ nào cũng có cược ngay), không phải bất
 * thường. Timeline Rail (`hub-timeline-rail.tsx`) đã thể hiện "kỳ chưa có cược" bằng bar rỗng —
 * không cần lặp lại ở đây bằng văn suy đoán ("có thể kỳ chết" không tồn tại trong văn công ty
 * vận hành, theo yêu cầu của bạn).
 *
 * 3 điều kiện MỚI, ĐỘC LẬP (plan §B8.1):
 * 1. `alertsCritical > 0` — bất kể doanh thu, nặng nhất.
 * 2. `revenue ≥ p95` trong các kỳ ĐANG có cược (`rows5B`, tương tự logic median cũ nhưng dùng
 *    percentile chuẩn hơn thay vì "3× median" — ít nhạy với outlier đơn lẻ kéo median lệch).
 * 3. `largeBetCount > 0` — có ít nhất 1 cược vượt ngưỡng `largeBetAmount` (server đã tính sẵn).
 * 4. `exposureRaw ≥ p95` trong các kỳ CÓ exposure > 0 — dùng percentile, KHÔNG so với
 *    `exposureWarnPct` (DTO cấm rõ ở `hub-snapshot.dto.ts`: field đó là % của giá trị ĐÃ cap,
 *    còn `exposureRaw` chưa cap — so 2 mẫu số khác nhau là sai, xem JSDoc `OpsHubDrawRow.exposureRaw`).
 *    Hub không có quyền truy cập ngưỡng cap thật (`payoutCaps` theo playType, quá nặng để load
 *    ở tầng snapshot) — percentile trong ngày là proxy hợp lý duy nhất tính được từ dữ liệu đã có.
 */

import type { DerivedRow } from "../../hub-types";

/** Percentile áp cho cả doanh thu và exposure — 1 hằng số, đổi 1 chỗ nếu cần tinh chỉnh độ nhạy. */
const OUTLIER_PERCENTILE = 0.95;

/**
 * Percentile (0-1) trên mảng ĐÃ SORT tăng dần — nearest-rank, đủ chính xác cho tập ≤300 phần tử,
 * không cần nội suy tuyến tính (interpolation) cho mục đích cảnh báo UI.
 */
function percentileOf(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) {
    return 0;
  }
  const idx = Math.min(n - 1, Math.ceil(p * n) - 1);
  return sorted.at(idx) ?? 0;
}

/** Lý do 1 dòng được xếp vào outlier — dùng để render nhãn + tone ở `hub-selling-section.tsx`,
 * tách khỏi component UI để dễ test độc lập logic phân loại. */
export const SellingOutlierReason = {
  CriticalAlert: "critical_alert",
  RevenueSpike: "revenue_spike",
  LargeBet: "large_bet",
  ExposureSpike: "exposure_spike",
} as const;
export type SellingOutlierReason = (typeof SellingOutlierReason)[keyof typeof SellingOutlierReason];

export interface SellingOutlierRow {
  row: DerivedRow;
  /** Lý do NẶNG NHẤT áp dụng cho dòng này — 1 dòng có thể khớp nhiều điều kiện, chỉ hiện 1 nhãn chính. */
  reason: SellingOutlierReason;
}

/**
 * Top-N bất thường trong `rows5B` (guideline §5B Lớp 1) — 4 điều kiện ĐỘC LẬP, xem JSDoc đầu file.
 *
 * @param rows5B - Toàn bộ dòng `gate = Open`, đã sort theo `closeAtMs` tăng dần (không ảnh
 *   hưởng logic outlier — hàm này tự sort lại theo `rank` ở cuối).
 * @param nowMs - Giờ server đã hiệu chỉnh — KHÔNG dùng trực tiếp ở đây (giữ tham số cho tương lai
 *   cần "outlier theo tuổi kỳ" thật, hiện tại mọi điều kiện đều tức thời theo revenue/exposure/alert).
 */
export function findSellingOutliers(rows5B: readonly DerivedRow[], _nowMs: number): SellingOutlierRow[] {
  const positiveRevenues = rows5B
    .filter((r) => r.revenue > 0)
    .map((r) => r.revenue)
    .toSorted((a, b) => a - b);
  const revenueP95 = percentileOf(positiveRevenues, OUTLIER_PERCENTILE);

  const positiveExposures = rows5B
    .filter((r) => r.exposureRaw > 0)
    .map((r) => r.exposureRaw)
    .toSorted((a, b) => a - b);
  const exposureP95 = percentileOf(positiveExposures, OUTLIER_PERCENTILE);

  const outliers: SellingOutlierRow[] = [];
  for (const row of rows5B) {
    // Ưu tiên rõ ràng: alert nghiêm trọng > rủi ro chi trả > cược lớn > doanh thu cao — dòng
    // khớp nhiều điều kiện chỉ hiện lý do NẶNG NHẤT, tránh nhãn dài dòng khó đọc trên 1 chip.
    if (row.alertsCritical > 0) {
      outliers.push({ row, reason: SellingOutlierReason.CriticalAlert });
      continue;
    }
    if (exposureP95 > 0 && row.exposureRaw >= exposureP95) {
      outliers.push({ row, reason: SellingOutlierReason.ExposureSpike });
      continue;
    }
    if (row.largeBetCount > 0) {
      outliers.push({ row, reason: SellingOutlierReason.LargeBet });
      continue;
    }
    if (revenueP95 > 0 && row.revenue >= revenueP95) {
      outliers.push({ row, reason: SellingOutlierReason.RevenueSpike });
    }
  }

  // Nặng nhất lên đầu theo đúng thứ tự ưu tiên ở trên, cùng hạng thì doanh thu cao hơn lên trước.
  const rank: Record<SellingOutlierReason, number> = {
    [SellingOutlierReason.CriticalAlert]: 3,
    [SellingOutlierReason.ExposureSpike]: 2,
    [SellingOutlierReason.LargeBet]: 1,
    [SellingOutlierReason.RevenueSpike]: 0,
  };
  return outliers.toSorted((a, b) => rank[b.reason] - rank[a.reason] || b.row.revenue - a.row.revenue);
}
