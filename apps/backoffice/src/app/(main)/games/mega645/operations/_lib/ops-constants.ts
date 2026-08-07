/**
 * Mega 6/45 Operations — Hằng số & label dùng chung cho trang Vận hành (p0-03).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn. Ngưỡng
 * vận hành THẬT (largeBetAmount, fixedExposureWarnAmount, comboAccountsWarn,
 * baoHighStakeAmount) đến từ `snapshot.thresholds` (server đọc GlobalConfig) —
 * KHÔNG hardcode ở đây (mirror Power 6/55/Keno).
 */

import { Mega645OpsAlertType, OpsAlertSeverity } from "@megawin/game-mega645/entities";

/**
 * Label tiếng Việt cho từng loại alert vận hành Mega 6/45.
 *
 * Khoá đầy đủ theo `Mega645OpsAlertType` → thêm loại mới, compiler bắt thiếu khoá
 * (Record dẫn xuất từ const-as-const). 2 loại để dành (`revenue_anomaly`,
 * `settle_stuck`) vẫn cần label vì `describeAlert`/group panel có thể gặp (dù P0
 * không bắn) — tránh render "undefined" nếu worker tương lai bật.
 */
export const MEGA645_OPS_ALERT_TYPE_LABELS: Record<Mega645OpsAlertType, string> = {
  [Mega645OpsAlertType.LargeBet]: "Cược lớn",
  [Mega645OpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Mega645OpsAlertType.ComboConcentration]: "Dồn bộ số",
  [Mega645OpsAlertType.BaoHighStake]: "Vé Bao mức cao",
  [Mega645OpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Mega645OpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};

/** Nhịp poll fallback (giây) khi snapshot chưa trả về `pollSeconds` — khớp default `ops.stats.tickSeconds`. */
export const OPS_POLL_FALLBACK_SECONDS = 10;
