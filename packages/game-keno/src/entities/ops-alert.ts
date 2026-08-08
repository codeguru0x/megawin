/**
 * Keno – Ops Alert Types
 *
 * `KenoOpsAlertType` là **source of truth** cho loại alert vận hành Keno (rule
 * `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất, KHÔNG union string
 * trần). Dùng chung: `OpsConfig.alerts.enabled` (p0-05), evaluator + `KenoOpsAlertDoc`
 * (p0-06). Full alert doc (`KenoOpsAlertDoc`, repo, evaluator) khai ở p0-06.
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export type { OpsAlertBase } from "@megawin/game-core/types";
export { OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Keno.
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0 (analysis verdict #8).
 */
export const KenoOpsAlertType = {
  /** Cược lớn: entry ≥ ngưỡng `largeBetAmount`. */
  LargeBet: "large_bet",
  /** Exposure worst-case chạm % cap `maxPerDraw`. */
  ExposureThreshold: "exposure_threshold",
  /** Side bet lệch 1 hướng vượt `sidebetSkewPct`. */
  SidebetSkew: "sidebet_skew",
  /** Số bộ cappable gần cap `maxSetsForFixed`. */
  CapSetsNear: "cap_sets_near",
  /** Dồn cược 1 combo (syndicate). */
  ComboConcentration: "combo_concentration",
  /** Bất thường doanh thu — để dành, không bắn P0. */
  RevenueAnomaly: "revenue_anomaly",
  /** Settle treo — để dành, không bắn P0. */
  SettleStuck: "settle_stuck",
} as const;
export type KenoOpsAlertType = (typeof KenoOpsAlertType)[keyof typeof KenoOpsAlertType];

/**
 * Alert vận hành Keno — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase} (game-core)
 * thêm `type` cụ thể Keno.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent (không bắn trùng mỗi tick).
 * `status`/`severity` dùng member const (`OpsAlertStatus.New`, `OpsAlertSeverity.Warning`),
 * KHÔNG literal string.
 */
export interface KenoOpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: KenoOpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface KenoOpsAlertEntity extends Omit<KenoOpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
