/**
 * Power 6/55 Operations — Hằng số & label dùng chung cho trang Vận hành (p0-03).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn. Ngưỡng
 * vận hành THẬT (largeBetAmount, fixedExposureWarnAmount, comboAccountsWarn,
 * baoHighStakeAmount) đến từ `snapshot.thresholds` (server đọc GlobalConfig) —
 * KHÔNG hardcode ở đây (mirror Keno).
 */

import { OpsAlertSeverity, Power655OpsAlertType } from "@megawin/game-power655/entities";

/**
 * Label tiếng Việt cho từng loại alert vận hành Power 6/55.
 *
 * Khoá đầy đủ theo `Power655OpsAlertType` → thêm loại mới, compiler bắt thiếu khoá
 * (Record dẫn xuất từ const-as-const). 2 loại để dành (`revenue_anomaly`,
 * `settle_stuck`) vẫn cần label vì `describeAlert`/group panel có thể gặp (dù P0
 * không bắn) — tránh render "undefined" nếu worker tương lai bật.
 */
export const POWER655_OPS_ALERT_TYPE_LABELS: Record<Power655OpsAlertType, string> = {
  [Power655OpsAlertType.LargeBet]: "Cược lớn",
  [Power655OpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Power655OpsAlertType.ComboConcentration]: "Dồn bộ số",
  [Power655OpsAlertType.BaoHighStake]: "Vé Bao mức cao",
  [Power655OpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Power655OpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};
