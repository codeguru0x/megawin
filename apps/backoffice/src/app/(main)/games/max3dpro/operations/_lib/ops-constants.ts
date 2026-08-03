/**
 * Max 3D Pro Operations — Hằng số & label dùng chung cho trang Vận hành (p0-05).
 *
 * Ngưỡng vận hành THẬT (exposureWarnAmount, pairLiabilityWarnAmount, comboAccountsWarn,
 * largeBetAmount) đến từ `snapshot.thresholds` (server đọc GlobalConfig). Hằng số
 * fallback ở đây CHỈ dùng khi slice threshold chưa về (loading) — tô màu, KHÔNG sinh alert.
 */

import { Max3dproOpsAlertType, OpsAlertSeverity } from "@megawin/game-max3dpro/entities";

/**
 * Label tiếng Việt cho từng loại alert vận hành Max 3D Pro.
 *
 * NHÃN PHẢI KHỚP `ALERT_META` trong config `_lib/ops-section.tsx` — 2 trang cùng nhãn
 * cho cùng alert type. Khoá đầy đủ theo `Max3dproOpsAlertType` → thêm loại mới, compiler
 * bắt thiếu khoá.
 */
export const MAX3DPRO_OPS_ALERT_TYPE_LABELS: Record<Max3dproOpsAlertType, string> = {
  [Max3dproOpsAlertType.LargeBet]: "Cược lớn",
  [Max3dproOpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Max3dproOpsAlertType.PairLiability]: "Liability cặp (2 chiều)",
  [Max3dproOpsAlertType.ComboConcentration]: "Nhiều người cùng cặp",
  [Max3dproOpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Max3dproOpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};
