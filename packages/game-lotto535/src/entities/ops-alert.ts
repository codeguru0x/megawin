/**
 * Lotto 5/35 – Ops Alert Types
 *
 * `Lotto535OpsAlertType` là **source of truth** cho loại alert vận hành Lotto 5/35
 * (rule `code-quality-standards.mdc` §5.3 — const-as-const + type dẫn xuất, KHÔNG
 * union string trần). Dùng chung: `OpsConfig.alerts.enabled` (p0-01), evaluator +
 * `Lotto535OpsAlertDoc` (p0-02).
 *
 * Port từ Power 6/55 (`packages/game-power655/src/entities/ops-alert.ts`).
 * **KHÁC Power 6/55**: đổi `bao_high_stake` → `cover_high_stake` (đánh giá từ
 * `byPlayType` nhóm `mainCover6..mainCover15`); THÊM `special_skew` (MỚI — đặc
 * thù Lotto 5/35, user chốt 05/08, P0). **KHÔNG có** alert jackpot/split cycle
 * (user chốt 05/08 — JackpotHeroCard sẵn có là đủ, xem analysis §1.5 R5, §3.7).
 *
 * **Quy tắc bắt buộc (chốt 05/08)**: JSDoc của TỪNG member PHẢI ghi rõ điều kiện
 * BẬT (công thức + tên field config tham chiếu) và điều kiện nâng Critical — không
 * chấp nhận JSDoc mô tả chung chung 1 dòng.
 */

import type { OpsAlertBase } from "@megawin/game-core/types";

export type { OpsAlertBase } from "@megawin/game-core/types";
export { OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-core/types";

/**
 * Loại alert vận hành Lotto 5/35.
 *
 * `RevenueAnomaly`/`SettleStuck` để dành — KHÔNG bắn ở P0, chưa có rule.
 */
export const Lotto535OpsAlertType = {
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
   * Board bao số chính mức cược cao — analog `bao_high_stake` Power 6/55, đặc thù
   * Lotto 5/35 (nhóm `mainCover6..mainCover15`). BẬT KHI (đánh giá từ `byPlayType`):
   * tồn tại key trong nhóm `mainCover6..mainCover15` có `byPlayType[key].boards > 0`
   * VÀ giá board chuẩn (`C(N,5) × unitPrice`) `>= ops.alerts.coverHighStakeAmount`.
   * Critical khi key = `mainCover15`. Drill-down chi tiết qua `topPotential` /
   * live-entries.
   */
  CoverHighStake: "cover_high_stake",
  /**
   * Tiền dồn bất thường vào 1 số ĐẶC BIỆT — MỚI, đặc thù Lotto 5/35 (user chốt
   * 05/08, P0). Không gian số ĐB chỉ 12 số (so với 35 số chính) — số ĐB được quay
   * ra thì MỌI line chứa nó trúng ít nhất `consolation` và kéo `tier2`/`tier4` lên
   * (2 tier có điều kiện "+ đặc biệt"), nên tiền dồn lệch vào 1 số ĐB là rủi ro
   * tập trung thật, không chỉ là tín hiệu thống kê suông. BẬT KHI (đánh giá từ
   * number stats `kind=special`): tồn tại số ĐB có
   * `amount / Σamount(kind=special) >= ops.alerts.specialSkewRatio` VÀ
   * `Σamount(kind=special) >= ops.alerts.specialSkewMinAmount` (chống nhiễu kỳ
   * vắng — baseline đều lý thuyết là 1/12 ≈ 8,3%, ngưỡng mặc định 35% đã là lệch
   * rõ rệt). Critical khi tỷ trọng `>= 2 × specialSkewRatio`.
   * `dedupeKey = "special_skew:${number}"`.
   */
  SpecialSkew: "special_skew",
  /** Để dành — KHÔNG bắn P0, chưa có rule. */
  RevenueAnomaly: "revenue_anomaly",
  /** Để dành — KHÔNG bắn P0, chưa có rule. */
  SettleStuck: "settle_stuck",
} as const;
export type Lotto535OpsAlertType = (typeof Lotto535OpsAlertType)[keyof typeof Lotto535OpsAlertType];

/**
 * Alert vận hành Lotto 5/35 — 1 doc/(draw × dedupeKey). Extends {@link OpsAlertBase}
 * (game-core) thêm `type` cụ thể Lotto 5/35.
 *
 * `dedupeKey` unique cùng `drawId` → evaluator upsert idempotent (không bắn trùng
 * mỗi tick). `status`/`severity` dùng member const (`OpsAlertStatus.New`,
 * `OpsAlertSeverity.Warning`), KHÔNG literal string.
 */
export interface Lotto535OpsAlertDoc extends OpsAlertBase {
  /** MongoDB ObjectId. */
  _id: unknown;
  /** Loại alert. */
  type: Lotto535OpsAlertType;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface Lotto535OpsAlertEntity extends Omit<Lotto535OpsAlertDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
