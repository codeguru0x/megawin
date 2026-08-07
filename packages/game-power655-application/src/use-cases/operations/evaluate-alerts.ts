/**
 * Power 6/55 – Alert Evaluator (pure)
 *
 * So data stats/combo đã có in-memory với ngưỡng `ops.alerts` → sinh danh sách alert
 * (analysis §4.4). Pure & không I/O: worker gọi sau khi đọc stats/combo rồi
 * `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * CHỈ 4 rule (KHÁC Keno bỏ `sidebet_skew`/`cap_sets_near` — không có side bet, không có
 * payout cap giải cố định; xem JSDoc `Power655OpsAlertType`):
 *
 * - `large_bet` — `totals.largeBetCount > 0`.
 * - `exposure_threshold` — `exposure.fixedWorstCase >= fixedExposureWarnAmount` (VND
 *   tuyệt đối, KHÔNG phải %, vì Power 6/55 không có `maxPerDraw` để tính phần trăm).
 * - `combo_concentration` — combo có `accountCount >= comboAccountsWarn`.
 * - `bao_high_stake` — MỚI, đặc thù Power 6/55: đánh giá TỪ `byPlayType` (không cần đọc
 *   per-board event) — playType nhóm bao13..bao18 có board với giá chuẩn
 *   (`BAO_COMBINATIONS[pt] × unitPrice`) chạm ngưỡng.
 *
 * Dedupe: mỗi alert có `dedupeKey` unique cùng `drawId` → upsert idempotent, KHÔNG bắn
 * nhiều doc trùng loại/scope trong 1 kỳ. Severity map theo mức vượt ngưỡng (warning/critical).
 */

import {
  BAO_COMBINATIONS,
  OpsAlertSeverity,
  OpsAlertStatus,
  PlayType,
  Power655OpsAlertType,
} from "@megawin/game-power655/entities";
import type {
  Power655DrawBettingStatsEntity,
  Power655DrawComboStatsEntity,
  Power655OpsAlertDoc,
  Power655OpsAlertsConfig,
} from "@megawin/game-power655/entities";

/** Snapshot stats + combo cần cho evaluate. */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã đọc từ DB (tích luỹ cả kỳ, KHÔNG phải delta 1 batch). */
  stats: Power655DrawBettingStatsEntity;
  /** Combo tập trung của kỳ (`accountCount ≥ ngưỡng`) — nguồn rule `combo_concentration`. */
  combos: Power655DrawComboStatsEntity[];
  /** Ngưỡng động `ops.alerts`. */
  alerts: Power655OpsAlertsConfig;
  /** Giá 1 lần tham gia dự thưởng hiện hành — mẫu tính giá board chuẩn cho `bao_high_stake`. */
  unitPrice: number;
}

type NewAlert = Omit<Power655OpsAlertDoc, "_id">;

/** Nhóm playType Bao thuộc diện đánh giá `bao_high_stake` — bao13, bao14, bao15, bao18 (không có bao16/17). */
const BAO_HIGH_STAKE_PLAY_TYPES: readonly PlayType[] = [
  PlayType.Bao13,
  PlayType.Bao14,
  PlayType.Bao15,
  PlayType.Bao18,
];

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, combos, alerts, unitPrice } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Power655OpsAlertType,
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
  if (alerts.enabled[Power655OpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential
      .filter((p) => p.amount >= alerts.largeBetAmount)
      .slice(0, 10);
    push(
      Power655OpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      Power655OpsAlertType.LargeBet,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worst-case giải cố định chạm ngưỡng VND tuyệt đối ──
  // Doc lưu worst-case RAW (chưa cap — Power 6/55 không có cap giải cố định) nên so trực
  // tiếp, không cần "áp cap trước khi tính %" như Keno.
  if (alerts.enabled[Power655OpsAlertType.ExposureThreshold]) {
    const fixedWorstCase = stats.exposure.fixedWorstCase;
    if (fixedWorstCase >= alerts.fixedExposureWarnAmount) {
      push(
        Power655OpsAlertType.ExposureThreshold,
        // Chạm/vượt 2× ngưỡng → critical.
        fixedWorstCase >= alerts.fixedExposureWarnAmount * 2
          ? OpsAlertSeverity.Critical
          : OpsAlertSeverity.Warning,
        Power655OpsAlertType.ExposureThreshold,
        { fixedWorstCase, threshold: alerts.fixedExposureWarnAmount },
      );
    }
  }

  // ── combo_concentration: nhiều account cùng cược 1 bộ số (syndicate) ──
  if (alerts.enabled[Power655OpsAlertType.ComboConcentration]) {
    for (const combo of combos) {
      // `accountCount` là counter vô hướng trong doc — repo đã filter `>= comboAccountsWarn`
      // nên đây chỉ phân mức severity.
      const players = combo.accountCount;
      if (players >= alerts.comboAccountsWarn) {
        push(
          Power655OpsAlertType.ComboConcentration,
          // Rất đông người dồn 1 bộ → critical.
          players >= alerts.comboAccountsWarn * 2
            ? OpsAlertSeverity.Critical
            : OpsAlertSeverity.Warning,
          `combo:${combo.comboKey}`,
          {
            comboKey: combo.comboKey,
            playType: combo.playType,
            mainNumbers: combo.mainNumbers,
            players,
            sets: combo.sets,
            amount: combo.amount,
            warnAt: alerts.comboAccountsWarn,
          },
        );
      }
    }
  }

  // ── bao_high_stake: vé Bao mức cược cao, đánh giá TỪ byPlayType (chốt 05/08) ──
  if (alerts.enabled[Power655OpsAlertType.BaoHighStake]) {
    evaluateBaoHighStake(stats, alerts, unitPrice, drawId, push);
  }

  return out;
}

/**
 * Rule `bao_high_stake`: gộp 1 alert/draw — lặp `byPlayType` nhóm bao13..bao18, playType
 * BẬT khi `boards > 0` VÀ giá board chuẩn (`BAO_COMBINATIONS[pt] × unitPrice`) chạm
 * `baoHighStakeAmount`. Critical khi CÓ playType `bao18` trong danh sách bật (mức cao nhất
 * — 185,64 triệu/board tại unitPrice mặc định).
 */
function evaluateBaoHighStake(
  stats: Pick<Power655DrawBettingStatsEntity, "byPlayType">,
  alerts: Power655OpsAlertsConfig,
  unitPrice: number,
  drawId: string,
  push: (
    type: Power655OpsAlertType,
    severity: OpsAlertSeverity,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ) => void,
): void {
  const triggered: Array<{ playType: PlayType; boardPrice: number; boards: number }> = [];

  for (const pt of BAO_HIGH_STAKE_PLAY_TYPES) {
    const stat = stats.byPlayType[pt];
    if (!stat || stat.boards <= 0) {
      continue;
    }
    const boardPrice = BAO_COMBINATIONS[pt]! * unitPrice;
    if (boardPrice >= alerts.baoHighStakeAmount) {
      triggered.push({ playType: pt, boardPrice, boards: stat.boards });
    }
  }

  if (triggered.length === 0) {
    return;
  }

  const hasBao18 = triggered.some((t) => t.playType === PlayType.Bao18);
  push(
    Power655OpsAlertType.BaoHighStake,
    hasBao18 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
    Power655OpsAlertType.BaoHighStake,
    { drawId, triggered, threshold: alerts.baoHighStakeAmount },
  );
}
