/**
 * Max 3D – Ops Alert Types
 *
 * `Max3dOpsAlertType` là **source of truth** cho loại alert vận hành Max 3D (rule
 * `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất). Dùng chung:
 * `OpsConfig.alerts.enabled` (p0-03), evaluator + `Max3dOpsAlertDoc` (p0-04).
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export type { OpsAlertBase } from "@megawin/game-core/types";
export { OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Max 3D.
 *
 * KHÁC Keno: không có `sidebet_skew` (không có side bet), không `cap_sets_near`
 * (không có payout cap). THÊM **`pair_liability`** — alert đặc thù quan trọng nhất:
 * cặp plus có liability ĐB tích luỹ vượt ngưỡng (nhân ×100.000, KHÔNG có cap kỳ —
 * staff phải biết TRƯỚC ngày quay nhiều ngày).
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0.
 */
export const Max3dOpsAlertType = {
  /** Cược lớn: entry ≥ ngưỡng `largeBetAmount`. */
  LargeBet: "large_bet",
  /** Worst-case tổng ≥ ngưỡng tuyệt đối `exposureWarnAmount`. */
  ExposureThreshold: "exposure_threshold",
  /** 1 cặp plus có liability ĐB ≥ `pairLiabilityWarnAmount` — RỦI RO SỐ 1 (không cap). */
  PairLiability: "pair_liability",
  /** 1 cặp ≥ N account distinct cùng cược (syndicate). */
  ComboConcentration: "combo_concentration",
  /** Bất thường doanh thu — để dành, không bắn P0. */
  RevenueAnomaly: "revenue_anomaly",
  /** Settle treo — để dành, không bắn P0. */
  SettleStuck: "settle_stuck",
} as const;
export type Max3dOpsAlertType = (typeof Max3dOpsAlertType)[keyof typeof Max3dOpsAlertType];

/**
 * Alert vận hành Max 3D — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}
 * (game-core) thêm `type` cụ thể Max 3D.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent. `pair_liability`/
 * `combo_concentration` dedupe THEO CẶP (`"pair_liability:096,389"`) — mỗi cặp vượt
 * ngưỡng là 1 alert riêng để staff track từng cặp.
 */
export interface Max3dOpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Max3dOpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Max3dOpsAlertEntity extends Omit<Max3dOpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
