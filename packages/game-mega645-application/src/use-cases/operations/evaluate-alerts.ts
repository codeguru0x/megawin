/**
 * Mega 6/45 – Alert Evaluator (pure)
 *
 * So data stats/combo đã có in-memory với ngưỡng `ops.alerts` → sinh danh sách alert
 * (analysis §4.4). Pure & không I/O: worker gọi sau khi đọc stats/combo rồi
 * `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * Port từ Power 6/55 — GIỐNG NGUYÊN 4 rule P0 (game cùng cấu trúc Bao 5/7–15/18, cùng
 * dạng exposure fixed + jackpot đọc-lúc-build). KHÁC: field số chọn tên `numbers` (không
 * phải `mainNumbers`), jackpot ĐƠN (không ảnh hưởng 4 rule dưới — không có alert riêng
 * cho jackpot ở P0):
 *
 * - `large_bet` — `totals.largeBetCount > 0`.
 * - `exposure_threshold` — `exposure.fixedWorstCase >= fixedExposureWarnAmount` (VND
 *   tuyệt đối, KHÔNG phải %, vì Mega 6/45 không có `maxPerDraw` để tính phần trăm).
 * - `combo_concentration` — combo có `accountCount >= comboAccountsWarn`.
 * - `bao_high_stake` — đánh giá TỪ `byPlayType` (không cần đọc per-board event) —
 *   playType nhóm bao13..bao18 có board với giá chuẩn (`BAO_COMBINATIONS[N] × unitPrice`)
 *   chạm ngưỡng.
 *
 * Dedupe: mỗi alert có `dedupeKey` unique cùng `drawId` → upsert idempotent, KHÔNG bắn
 * nhiều doc trùng loại/scope trong 1 kỳ. Severity map theo mức vượt ngưỡng (warning/critical).
 */

import {
  BAO_COMBINATIONS,
  OpsAlertSeverity,
  OpsAlertStatus,
  PlayType,
  Mega645OpsAlertType,
} from "@megawin/game-mega645/entities";
import type {
  Mega645DrawBettingStatsEntity,
  Mega645DrawComboStatsEntity,
  Mega645OpsAlertDoc,
  Mega645OpsAlertsConfig,
} from "@megawin/game-mega645/entities";

/** Snapshot stats + combo cần cho evaluate. */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã đọc từ DB (tích luỹ cả kỳ, KHÔNG phải delta 1 batch). */
  stats: Mega645DrawBettingStatsEntity;
  /** Combo tập trung của kỳ (`accountCount ≥ ngưỡng`) — nguồn rule `combo_concentration`. */
  combos: Mega645DrawComboStatsEntity[];
  /** Ngưỡng động `ops.alerts`. */
  alerts: Mega645OpsAlertsConfig;
  /** Giá 1 lần tham gia dự thưởng hiện hành — mẫu tính giá board chuẩn cho `bao_high_stake`. */
  unitPrice: number;
}

type NewAlert = Omit<Mega645OpsAlertDoc, "_id">;

/** Nhóm playType Bao thuộc diện đánh giá `bao_high_stake` — bao13, bao14, bao15, bao18 (không có bao16/17). */
const BAO_HIGH_STAKE_PLAY_TYPES: readonly PlayType[] = [
  PlayType.Bao13,
  PlayType.Bao14,
  PlayType.Bao15,
  PlayType.Bao18,
];

/** Số lượng số cần chọn của mỗi playType Bao cao — dùng tra `BAO_COMBINATIONS[N]` (bảng theo N, không theo playType). */
const BAO_NUMBER_COUNT: Record<PlayType, number> = {
  [PlayType.Standard]: 6,
  [PlayType.Bao5]: 5,
  [PlayType.Bao7]: 7,
  [PlayType.Bao8]: 8,
  [PlayType.Bao9]: 9,
  [PlayType.Bao10]: 10,
  [PlayType.Bao11]: 11,
  [PlayType.Bao12]: 12,
  [PlayType.Bao13]: 13,
  [PlayType.Bao14]: 14,
  [PlayType.Bao15]: 15,
  [PlayType.Bao18]: 18,
};

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, combos, alerts, unitPrice } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Mega645OpsAlertType,
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
  if (alerts.enabled[Mega645OpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential
      .filter((p) => p.amount >= alerts.largeBetAmount)
      .slice(0, 10);
    push(
      Mega645OpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      Mega645OpsAlertType.LargeBet,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worst-case giải cố định chạm ngưỡng VND tuyệt đối ──
  // Doc lưu worst-case RAW (chưa cap — Mega 6/45 không có cap giải cố định) nên so trực
  // tiếp, không cần "áp cap trước khi tính %".
  if (alerts.enabled[Mega645OpsAlertType.ExposureThreshold]) {
    const fixedWorstCase = stats.exposure.fixedWorstCase;
    if (fixedWorstCase >= alerts.fixedExposureWarnAmount) {
      push(
        Mega645OpsAlertType.ExposureThreshold,
        // Chạm/vượt 2× ngưỡng → critical.
        fixedWorstCase >= alerts.fixedExposureWarnAmount * 2
          ? OpsAlertSeverity.Critical
          : OpsAlertSeverity.Warning,
        Mega645OpsAlertType.ExposureThreshold,
        { fixedWorstCase, threshold: alerts.fixedExposureWarnAmount },
      );
    }
  }

  // ── combo_concentration: nhiều account cùng cược 1 bộ số (syndicate) ──
  if (alerts.enabled[Mega645OpsAlertType.ComboConcentration]) {
    for (const combo of combos) {
      // `accountCount` là counter vô hướng trong doc — repo đã filter `>= comboAccountsWarn`
      // nên đây chỉ phân mức severity.
      const players = combo.accountCount;
      if (players >= alerts.comboAccountsWarn) {
        push(
          Mega645OpsAlertType.ComboConcentration,
          // Rất đông người dồn 1 bộ → critical.
          players >= alerts.comboAccountsWarn * 2
            ? OpsAlertSeverity.Critical
            : OpsAlertSeverity.Warning,
          `combo:${combo.comboKey}`,
          {
            comboKey: combo.comboKey,
            playType: combo.playType,
            numbers: combo.numbers,
            players,
            sets: combo.sets,
            amount: combo.amount,
            warnAt: alerts.comboAccountsWarn,
          },
        );
      }
    }
  }

  // ── bao_high_stake: vé Bao mức cược cao, đánh giá TỪ byPlayType ──
  if (alerts.enabled[Mega645OpsAlertType.BaoHighStake]) {
    evaluateBaoHighStake(stats, alerts, unitPrice, drawId, push);
  }

  return out;
}

/**
 * Rule `bao_high_stake`: gộp 1 alert/draw — lặp `byPlayType` nhóm bao13..bao18, playType
 * BẬT khi `boards > 0` VÀ giá board chuẩn (`BAO_COMBINATIONS[N] × unitPrice`) chạm
 * `baoHighStakeAmount`. Critical khi CÓ playType `bao18` trong danh sách bật (mức cao nhất
 * — 185,64 triệu/board tại unitPrice mặc định, đồng bộ Power 6/55).
 */
function evaluateBaoHighStake(
  stats: Pick<Mega645DrawBettingStatsEntity, "byPlayType">,
  alerts: Mega645OpsAlertsConfig,
  unitPrice: number,
  drawId: string,
  push: (
    type: Mega645OpsAlertType,
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
    const boardPrice = BAO_COMBINATIONS[BAO_NUMBER_COUNT[pt]]! * unitPrice;
    if (boardPrice >= alerts.baoHighStakeAmount) {
      triggered.push({ playType: pt, boardPrice, boards: stat.boards });
    }
  }

  if (triggered.length === 0) {
    return;
  }

  const hasBao18 = triggered.some((t) => t.playType === PlayType.Bao18);
  push(
    Mega645OpsAlertType.BaoHighStake,
    hasBao18 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
    Mega645OpsAlertType.BaoHighStake,
    { drawId, triggered, threshold: alerts.baoHighStakeAmount },
  );
}
