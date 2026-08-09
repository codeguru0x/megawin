/**
 * Mega 6/45 – Ops Alert Types
 *
 * `Mega645OpsAlertType` là **source of truth** cho loại alert vận hành Mega 6/45
 * (rule `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất, KHÔNG
 * union string trần). Dùng chung: `OpsConfig.alerts.enabled` (p0-01), evaluator +
 * `Mega645OpsAlertDoc` (p0-02).
 *
 * Port từ Power 6/55 — GIỐNG NGUYÊN 4 alert P0 (game cùng cấu trúc Bao 5/7–15/18,
 * cùng dạng exposure fixed + jackpot đọc-lúc-build). KHÁC: Mega 6/45 chỉ có 1
 * Jackpot ĐƠN (không JP1/JP2) — không ảnh hưởng union alert type (không có alert
 * riêng cho jackpot ở P0, xem analysis §3.7).
 *
 * **Quy tắc bắt buộc (chốt 06/08)**: JSDoc của TỪNG member PHẢI ghi rõ điều kiện
 * BẬT (công thức + tên field config tham chiếu) và điều kiện nâng Critical — không
 * chấp nhận JSDoc mô tả chung chung 1 dòng.
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export type { OpsAlertBase } from "@megawin/game-core/types";
export { OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Mega 6/45.
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0, chưa có rule.
 */
export const Mega645OpsAlertType = {
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
   * Vé Bao mức cược cao. BẬT KHI (đánh giá từ `byPlayType`): tồn tại playType
   * trong nhóm bao13..bao18 có `byPlayType[pt].boards > 0` VÀ giá board chuẩn
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
export type Mega645OpsAlertType = (typeof Mega645OpsAlertType)[keyof typeof Mega645OpsAlertType];

/**
 * Alert vận hành Mega 6/45 — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}
 * (game-core) thêm `type` cụ thể Mega 6/45.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent (không bắn trùng
 * mỗi tick). `status`/`severity` dùng member const (`OpsAlertStatus.Ack`,
 * `OpsAlertSeverity.Warning`), KHÔNG literal string.
 */
export interface Mega645OpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Mega645OpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Mega645OpsAlertEntity extends Omit<Mega645OpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
