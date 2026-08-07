/**
 * Power 6/55 – Ops Alert Types
 *
 * `Power655OpsAlertType` là **source of truth** cho loại alert vận hành Power 6/55
 * (rule `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất, KHÔNG
 * union string trần). Dùng chung: `OpsConfig.alerts.enabled` (p0-01), evaluator +
 * `Power655OpsAlertDoc` (p0-02).
 *
 * **KHÁC KENO**: BỎ `sidebet_skew` (không có side bet), `cap_sets_near` (không có
 * payout cap — giải cố định KHÔNG cap/chia, xem analysis §3.10). BỎ
 * `jackpot_milestone` (user chốt 05/08 — không cần alert riêng, JP1/JP2 đã hiển thị
 * KPI trên trang ops). THÊM `bao_high_stake` (đặc thù Power 6/55 — vé Bao 13–18 rủi
 * ro tập trung tiền lớn).
 *
 * **Quy tắc bắt buộc (chốt 05/08)**: JSDoc của TỪNG member PHẢI ghi rõ điều kiện
 * BẬT (công thức + tên field config tham chiếu) và điều kiện nâng Critical — không
 * chấp nhận JSDoc mô tả chung chung 1 dòng.
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export { OpsAlertStatus, OpsAlertSeverity } from "@megawin/game-core/types";
export type { OpsAlertBase } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Power 6/55.
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0, chưa có rule.
 */
export const Power655OpsAlertType = {
  /**
   * Cược lớn. BẬT KHI: tồn tại entry có `entry.amount >= ops.alerts.largeBetAmount`
   * (worker đếm vào `totals.largeBetCount` lúc accumulate; evaluator bắn khi
   * `largeBetCount > 0`). Critical khi `largeBetCount >= 10`.
   */
  LargeBet: "large_bet",
  /**
   * Exposure giải cố định chạm ngưỡng. BẬT KHI:
   * `stats.exposure.fixedWorstCase >= ops.alerts.fixedExposureWarnAmount`.
   * Critical khi `fixedWorstCase >= 2 × fixedExposureWarnAmount`.
   */
  ExposureThreshold: "exposure_threshold",
  /**
   * Dồn cược 1 bộ số (syndicate). BẬT KHI: tồn tại combo doc có
   * `accountCount >= ops.alerts.comboAccountsWarn` (query index
   * `{drawId, accountCount}`). Critical khi `accountCount >= 2 × comboAccountsWarn`.
   * `dedupeKey = "combo:${comboKey}"`.
   */
  ComboConcentration: "combo_concentration",
  /**
   * Vé Bao mức cược cao — MỚI, đặc thù Power 6/55. BẬT KHI (đánh giá từ
   * `byPlayType` — chốt 05/08): tồn tại playType trong nhóm bao13..bao18 có
   * `byPlayType[pt].boards > 0` VÀ giá board chuẩn
   * (`BAO_COMBINATIONS[pt] × unitPrice`) `>= ops.alerts.baoHighStakeAmount`.
   * Critical khi playType = `bao18`. Drill-down chi tiết qua `topPotential` /
   * live-entries.
   */
  BaoHighStake: "bao_high_stake",
  /** Để dành — KHÔNG bắn P0, chưa có rule. */
  RevenueAnomaly: "revenue_anomaly",
  /** Để dành — KHÔNG bắn P0, chưa có rule. */
  SettleStuck: "settle_stuck",
} as const;
export type Power655OpsAlertType = (typeof Power655OpsAlertType)[keyof typeof Power655OpsAlertType];

/**
 * Alert vận hành Power 6/55 — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}
 * (game-core) thêm `type` cụ thể Power 6/55.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent (không bắn trùng
 * mỗi tick). `status`/`severity` dùng member const (`OpsAlertStatus.New`,
 * `OpsAlertSeverity.Warning`), KHÔNG literal string.
 */
export interface Power655OpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Power655OpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Power655OpsAlertEntity extends Omit<Power655OpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
