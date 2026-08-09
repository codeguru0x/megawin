/**
 * Bingo 18 – Ops Alert Types
 *
 * `Bingo18OpsAlertType` là **source of truth** cho loại alert vận hành Bingo 18 (rule
 * `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất, KHÔNG union string
 * trần). Dùng chung: `OpsConfig.alerts.enabled` (p0-03), evaluator + `Bingo18OpsAlertDoc`
 * (p0-04).
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export type { OpsAlertBase } from "@megawin/game-core/types";
export { OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Bingo 18.
 *
 * KHÁC Keno: không có `cap_sets_near` (Bingo 18 không có payout cap) và
 * `combo_concentration` → `bucket_concentration` (rủi ro là tiền dồn 1 bucket
 * nhân cao — sumTotal 3/18, tripleMatch specific ×120 — không phải "N account
 * cùng bộ số hiếm" vì bucket space chỉ 38, ai cũng trùng).
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0 (analysis verdict #14).
 */
export const Bingo18OpsAlertType = {
  /** Cược lớn: entry ≥ ngưỡng `largeBetAmount`. */
  LargeBet: "large_bet",
  /** Exposure worst-case ≥ max(sàn tuyệt đối, % doanh thu kỳ). */
  ExposureThreshold: "exposure_threshold",
  /** bigSmallDraw lệch 1 hướng vượt `sidebetSkewPct`. */
  SidebetSkew: "sidebet_skew",
  /** Tiền dồn 1 bucket nhân cao (sumTotal 3/18, tripleMatch specific) ≥ ngưỡng. */
  BucketConcentration: "bucket_concentration",
  /** Bất thường doanh thu — để dành, không bắn P0. */
  RevenueAnomaly: "revenue_anomaly",
  /** Settle treo — để dành, không bắn P0. */
  SettleStuck: "settle_stuck",
} as const;
export type Bingo18OpsAlertType = (typeof Bingo18OpsAlertType)[keyof typeof Bingo18OpsAlertType];

/**
 * Alert vận hành Bingo 18 — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}
 * (game-core) thêm `type` cụ thể Bingo 18.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent (không bắn trùng mỗi
 * tick). Vd `"bucket_concentration:sumTotal:3"`, `"sidebet_skew"`.
 * `status`/`severity` dùng member const (`OpsAlertStatus.New`, `OpsAlertSeverity.Warning`),
 * KHÔNG literal string.
 */
export interface Bingo18OpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Bingo18OpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Bingo18OpsAlertEntity extends Omit<Bingo18OpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
