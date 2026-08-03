/**
 * Max 3D Operations — Hằng số & label dùng chung cho trang Vận hành (p0-05).
 *
 * Ngưỡng vận hành THẬT (exposureWarnAmount, pairLiabilityWarnAmount, comboAccountsWarn,
 * largeBetAmount) đến từ `snapshot.thresholds` (server đọc GlobalConfig). Hằng số
 * fallback ở đây CHỈ dùng khi slice threshold chưa về (loading) — tô màu, KHÔNG sinh alert.
 */

import { Max3dOpsAlertType, OpsAlertSeverity } from "@megawin/game-max3d/entities";

/**
 * Label tiếng Việt cho từng loại alert vận hành Max 3D.
 *
 * NHÃN PHẢI KHỚP `ALERT_META` trong config `_lib/ops-section.tsx` — 2 trang cùng nhãn
 * cho cùng alert type. Khoá đầy đủ theo `Max3dOpsAlertType` → thêm loại mới, compiler
 * bắt thiếu khoá.
 */
export const MAX3D_OPS_ALERT_TYPE_LABELS: Record<Max3dOpsAlertType, string> = {
  [Max3dOpsAlertType.LargeBet]: "Cược lớn",
  [Max3dOpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Max3dOpsAlertType.PairLiability]: "Liability cặp Max 3D+",
  [Max3dOpsAlertType.ComboConcentration]: "Nhiều người cùng cặp",
  [Max3dOpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Max3dOpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};
