/**
 * Max 3D Pro – Ops Alert Types
 *
 * `Max3dproOpsAlertType` là **source of truth** cho loại alert vận hành Max 3D Pro
 * (rule §5.3 — const-as-const + type dẫn xuất). Dùng chung: `OpsConfig.alerts.enabled`
 * (p0-03), evaluator + `Max3dproOpsAlertDoc` (p0-04).
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export { OpsAlertStatus, OpsAlertSeverity } from "@megawin/game-core/types";
export type { OpsAlertBase } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Max 3D Pro — CÙNG TẬP với Max 3D (không side bet, không cap).
 *
 * `pair_liability` là alert quan trọng nhất: cặp ORDERED có liability ĐB (đúng chiều
 * ×200.000 + chiều ngược phụ ĐB ×40.000) vượt ngưỡng — KHÔNG có cap kỳ, kỳ bán nhiều
 * ngày nên phải biết TRƯỚC ngày quay.
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0.
 */
export const Max3dproOpsAlertType = {
  /** Cược lớn: entry ≥ ngưỡng `largeBetAmount`. */
  LargeBet: "large_bet",
  /** Worst-case tổng ≥ ngưỡng tuyệt đối `exposureWarnAmount`. */
  ExposureThreshold: "exposure_threshold",
  /** 1 cặp (gộp 2 chiều) liability ĐB ≥ `pairLiabilityWarnAmount` — RỦI RO SỐ 1. */
  PairLiability: "pair_liability",
  /** 1 cặp ≥ N account distinct cùng cược (syndicate). */
  ComboConcentration: "combo_concentration",
  /** Bất thường doanh thu — để dành, không bắn P0. */
  RevenueAnomaly: "revenue_anomaly",
  /** Settle treo — để dành, không bắn P0. */
  SettleStuck: "settle_stuck",
} as const;
export type Max3dproOpsAlertType = (typeof Max3dproOpsAlertType)[keyof typeof Max3dproOpsAlertType];

/**
 * Alert vận hành Max 3D Pro — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}.
 *
 * `pair_liability`/`combo_concentration` dedupe THEO CẶP ORDERED
 * (`"pair_liability:096>389"`) — mỗi chiều vượt ngưỡng là 1 alert riêng.
 */
export interface Max3dproOpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Max3dproOpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dproOpsAlertEntity extends Omit<Max3dproOpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
