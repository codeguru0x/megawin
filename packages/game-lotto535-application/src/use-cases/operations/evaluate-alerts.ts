/**
 * Lotto 5/35 – Alert Evaluator (pure)
 *
 * So data stats/combo/number đã có in-memory với ngưỡng `ops.alerts` → sinh danh sách alert
 * (analysis §4.4). Pure & không I/O: worker gọi sau khi đọc stats/combo/number rồi
 * `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * Port từ Power 6/55 (`evaluate-alerts.ts`) — **5 rule** (KHÁC Power 6/55 4 rule):
 *
 * - `large_bet` — `totals.largeBetCount > 0`.
 * - `exposure_threshold` — `exposure.fixedWorstCase >= fixedExposureWarnAmount` (VND
 *   tuyệt đối).
 * - `combo_concentration` — combo có `accountCount >= comboAccountsWarn`.
 * - `cover_high_stake` — analog `bao_high_stake` Power 6/55, đặc thù Lotto 5/35: đánh giá
 *   TỪ `byPlayType` nhóm `mainCover6..mainCover15` — playType BẬT khi `boards > 0` VÀ giá
 *   board chuẩn (`combination(N,5) × unitPrice`) chạm `coverHighStakeAmount`.
 * - `special_skew` — MỚI, đặc thù Lotto 5/35 (không gian ĐB chỉ 12 số): đánh giá TỪ number
 *   stats `kind=special` — số ĐB có tỷ trọng `amount / Σamount(kind=special) >=
 *   specialSkewRatio` VÀ `Σamount(kind=special) >= specialSkewMinAmount`.
 *
 * Dedupe: mỗi alert có `dedupeKey` unique cùng `drawId` → upsert idempotent, KHÔNG bắn
 * nhiều doc trùng loại/scope trong 1 kỳ. Severity map theo mức vượt ngưỡng (warning/critical).
 */

import {
  OpsAlertSeverity,
  OpsAlertStatus,
  Lotto535OpsAlertType,
} from "@megawin/game-lotto535/entities";
import type {
  Lotto535DrawBettingStatsEntity,
  Lotto535DrawComboStatsEntity,
  Lotto535DrawNumberStatsEntity,
  Lotto535OpsAlertDoc,
  Lotto535OpsAlertsConfig,
  Lotto535StatsPlayKey,
} from "@megawin/game-lotto535/entities";
import { combination } from "@megawin/game-lotto535/rules";

/** Snapshot stats + combo + number cần cho evaluate. */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã đọc từ DB (tích luỹ cả kỳ, KHÔNG phải delta 1 batch). */
  stats: Lotto535DrawBettingStatsEntity;
  /** Combo tập trung của kỳ (`accountCount ≥ ngưỡng`) — nguồn rule `combo_concentration`. */
  combos: Lotto535DrawComboStatsEntity[];
  /** Toàn bộ number stats `kind=special` (≤12 doc) — nguồn rule `special_skew`. */
  specialNumberStats: Lotto535DrawNumberStatsEntity[];
  /** Ngưỡng động `ops.alerts`. */
  alerts: Lotto535OpsAlertsConfig;
  /** Giá 1 lần tham gia dự thưởng hiện hành — mẫu tính giá board chuẩn cho `cover_high_stake`. */
  unitPrice: number;
}

type NewAlert = Omit<Lotto535OpsAlertDoc, "_id">;

/** Nhóm key `byPlayType` thuộc diện đánh giá `cover_high_stake` — mainCover6..mainCover15, kèm N tương ứng. */
const COVER_HIGH_STAKE_KEYS: ReadonlyArray<{ key: Lotto535StatsPlayKey; n: number }> = [
  { key: "mainCover6", n: 6 },
  { key: "mainCover7", n: 7 },
  { key: "mainCover8", n: 8 },
  { key: "mainCover9", n: 9 },
  { key: "mainCover10", n: 10 },
  { key: "mainCover11", n: 11 },
  { key: "mainCover12", n: 12 },
  { key: "mainCover13", n: 13 },
  { key: "mainCover14", n: 14 },
  { key: "mainCover15", n: 15 },
];

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, combos, specialNumberStats, alerts, unitPrice } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Lotto535OpsAlertType,
    severity: OpsAlertSeverity,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ): void => {
    out.push({
      drawId,
      type,
      severity,
      dedupeKey,
      payload,
      status: OpsAlertStatus.New,
      createdAt: now,
    });
  };

  // ── large_bet: gộp 1 alert/draw kèm top entry lớn ──
  if (alerts.enabled[Lotto535OpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential
      .filter((p) => p.amount >= alerts.largeBetAmount)
      .slice(0, 10);
    push(
      Lotto535OpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      Lotto535OpsAlertType.LargeBet,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worst-case giải cố định chạm ngưỡng VND tuyệt đối ──
  // Doc lưu worst-case RAW (chưa cap — Lotto 5/35 không có cap giải cố định) nên so trực
  // tiếp, không cần "áp cap trước khi tính %" như Keno.
  if (alerts.enabled[Lotto535OpsAlertType.ExposureThreshold]) {
    const fixedWorstCase = stats.exposure.fixedWorstCase;
    if (fixedWorstCase >= alerts.fixedExposureWarnAmount) {
      push(
        Lotto535OpsAlertType.ExposureThreshold,
        // Chạm/vượt 2× ngưỡng → critical.
        fixedWorstCase >= alerts.fixedExposureWarnAmount * 2
          ? OpsAlertSeverity.Critical
          : OpsAlertSeverity.Warning,
        Lotto535OpsAlertType.ExposureThreshold,
        { fixedWorstCase, threshold: alerts.fixedExposureWarnAmount },
      );
    }
  }

  // ── combo_concentration: nhiều account cùng cược 1 bộ số (syndicate) ──
  if (alerts.enabled[Lotto535OpsAlertType.ComboConcentration]) {
    for (const combo of combos) {
      // `accountCount` là counter vô hướng trong doc — repo đã filter `>= comboAccountsWarn`
      // nên đây chỉ phân mức severity.
      const players = combo.accountCount;
      if (players >= alerts.comboAccountsWarn) {
        push(
          Lotto535OpsAlertType.ComboConcentration,
          // Rất đông người dồn 1 bộ → critical.
          players >= alerts.comboAccountsWarn * 2
            ? OpsAlertSeverity.Critical
            : OpsAlertSeverity.Warning,
          `combo:${combo.comboKey}`,
          {
            comboKey: combo.comboKey,
            playType: combo.playType,
            mainNumbers: combo.mainNumbers,
            specialNumbers: combo.specialNumbers,
            players,
            sets: combo.sets,
            amount: combo.amount,
            warnAt: alerts.comboAccountsWarn,
          },
        );
      }
    }
  }

  // ── cover_high_stake: board bao số chính mức cược cao, đánh giá TỪ byPlayType ──
  if (alerts.enabled[Lotto535OpsAlertType.CoverHighStake]) {
    evaluateCoverHighStake(stats, alerts, unitPrice, drawId, push);
  }

  // ── special_skew: tiền dồn bất thường vào 1 số ĐẶC BIỆT ──
  if (alerts.enabled[Lotto535OpsAlertType.SpecialSkew]) {
    evaluateSpecialSkew(specialNumberStats, alerts, push);
  }

  return out;
}

/**
 * Rule `cover_high_stake`: gộp 1 alert/draw — lặp `byPlayType` nhóm mainCover6..mainCover15,
 * playType BẬT khi `boards > 0` VÀ giá board chuẩn (`combination(N,5) × unitPrice`) chạm
 * `coverHighStakeAmount`. Critical khi CÓ playType `mainCover15` trong danh sách bật (mức
 * cao nhất — C(15,5) = 3.003 lines/board).
 */
function evaluateCoverHighStake(
  stats: Pick<Lotto535DrawBettingStatsEntity, "byPlayType">,
  alerts: Lotto535OpsAlertsConfig,
  unitPrice: number,
  drawId: string,
  push: (
    type: Lotto535OpsAlertType,
    severity: OpsAlertSeverity,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ) => void,
): void {
  const triggered: Array<{ key: Lotto535StatsPlayKey; boardPrice: number; boards: number }> = [];

  for (const { key, n } of COVER_HIGH_STAKE_KEYS) {
    const stat = stats.byPlayType[key];
    if (!stat || stat.boards <= 0) {
      continue;
    }
    const boardPrice = combination(n, 5) * unitPrice;
    if (boardPrice >= alerts.coverHighStakeAmount) {
      triggered.push({ key, boardPrice, boards: stat.boards });
    }
  }

  if (triggered.length === 0) {
    return;
  }

  const hasMainCover15 = triggered.some((t) => t.key === "mainCover15");
  push(
    Lotto535OpsAlertType.CoverHighStake,
    hasMainCover15 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
    Lotto535OpsAlertType.CoverHighStake,
    { drawId, triggered, threshold: alerts.coverHighStakeAmount },
  );
}

/**
 * Rule `special_skew`: gộp 1 alert/draw — số ĐB có tỷ trọng `amount / Σamount(kind=special)
 * >= specialSkewRatio` VÀ `Σamount(kind=special) >= specialSkewMinAmount` (chống nhiễu kỳ
 * vắng). Critical khi tỷ trọng `>= 2 × specialSkewRatio`.
 */
function evaluateSpecialSkew(
  specialNumberStats: Lotto535DrawNumberStatsEntity[],
  alerts: Lotto535OpsAlertsConfig,
  push: (
    type: Lotto535OpsAlertType,
    severity: OpsAlertSeverity,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ) => void,
): void {
  const totalAmount = specialNumberStats.reduce((sum, s) => sum + s.amount, 0);
  if (totalAmount < alerts.specialSkewMinAmount) {
    return;
  }

  for (const stat of specialNumberStats) {
    const ratio = stat.amount / totalAmount;
    if (ratio >= alerts.specialSkewRatio) {
      push(
        Lotto535OpsAlertType.SpecialSkew,
        ratio >= alerts.specialSkewRatio * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `special_skew:${stat.number}`,
        {
          number: stat.number,
          amount: stat.amount,
          totalAmount,
          ratio,
          threshold: alerts.specialSkewRatio,
        },
      );
    }
  }
}
