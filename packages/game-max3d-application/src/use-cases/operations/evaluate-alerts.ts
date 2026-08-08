/**
 * Max 3D – Alert Evaluator (pure)
 *
 * So data stats + exposure in-memory với ngưỡng `ops.alerts` → sinh danh sách alert
 * (analysis max3d-ops §3.5, plan p0-04). Pure & không I/O: worker gọi sau khi update
 * stats rồi `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * KHÁC Bingo18/Keno: ngưỡng TUYỆT ĐỐI VND (không cap kỳ, revenue bán-nhiều-ngày
 * không ổn định làm mẫu số — chốt §7 Q2). Alert đặc thù `pair_liability`: 1 cặp plus
 * liability ĐB ≥ ngưỡng — RỦI RO SỐ 1 (×100.000 không cap), 1 alert / cặp (dedupe
 * theo pairKey) để staff track từng cặp riêng.
 */

import { Max3dOpsAlertType, OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-max3d/entities";
import type { Max3dExposureResult } from "@megawin/game-max3d/rules";
import type {
  Max3dDrawBettingStatsDoc,
  Max3dOpsAlertDoc,
  Max3dTopPair,
  OpsAlertsConfig,
} from "@megawin/game-max3d/entities";

/** Snapshot stats + exposure cần cho evaluate (đã có in-memory ở worker). */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã build (không cần `_id`). */
  stats: Omit<Max3dDrawBettingStatsDoc, "_id" | "drawId">;
  /** Exposure tính từ tripletStakes/topPairs (computeMax3dExposure — tầng đọc). */
  exposure: Max3dExposureResult;
  /**
   * Top cặp plus — nguồn từ `PairStatsRepository.getTopPairs` (p0-03), KHÔNG còn nằm trong
   * `stats` doc (field `topPairs` đã bị xoá — xem `Max3dDrawBettingStatsDoc`).
   */
  topPairs: Max3dTopPair[];
  /** Ngưỡng động `ops.alerts`. */
  alerts: OpsAlertsConfig;
}

type NewAlert = Omit<Max3dOpsAlertDoc, "_id">;

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateMax3dAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, exposure, topPairs, alerts } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Max3dOpsAlertType,
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
  if (alerts.enabled[Max3dOpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential.filter((p) => p.amount >= alerts.largeBetAmount).slice(0, 10);
    push(
      Max3dOpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      `${Max3dOpsAlertType.LargeBet}:${drawId}`,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worstCaseTotal ≥ ngưỡng TUYỆT ĐỐI ──
  // Payload tách 3 thành phần (basic exact / max pair / plus tail proxy) để formatter
  // hiển thị trung thực phần nào exact phần nào ước lượng.
  if (alerts.enabled[Max3dOpsAlertType.ExposureThreshold]) {
    const worst = exposure.worstCaseTotal;
    if (worst >= alerts.exposureWarnAmount) {
      push(
        Max3dOpsAlertType.ExposureThreshold,
        // Gấp đôi ngưỡng → critical.
        worst >= alerts.exposureWarnAmount * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Max3dOpsAlertType.ExposureThreshold}:${drawId}`,
        {
          worstCaseTotal: worst,
          basicWorstCase: exposure.basicWorstCase.total,
          maxPairLiability: exposure.topPairLiabilities[0]?.liability ?? 0,
          plusTailProxy: exposure.plusTailProxy,
          revenue: stats.totals.revenue,
          threshold: alerts.exposureWarnAmount,
        },
      );
    }
  }

  // ── pair_liability: 1 cặp plus liability ĐB ≥ ngưỡng — 1 alert / CẶP ──
  // dedupeKey theo pairKey: mỗi cặp vượt ngưỡng là 1 alert riêng, payload cập nhật
  // units/liability mới nhất mỗi tick. Critical LUÔN (1 tỷ/unit, không cap).
  if (alerts.enabled[Max3dOpsAlertType.PairLiability]) {
    for (const p of exposure.topPairLiabilities) {
      if (p.liability < alerts.pairLiabilityWarnAmount) break; // đã sort desc.
      push(
        Max3dOpsAlertType.PairLiability,
        OpsAlertSeverity.Critical,
        `${Max3dOpsAlertType.PairLiability}:${p.pairKey}`,
        {
          pairKey: p.pairKey,
          triplet1: p.triplet1,
          triplet2: p.triplet2,
          units: p.units,
          accounts: p.accounts,
          amount: p.amount,
          liability: p.liability,
          threshold: alerts.pairLiabilityWarnAmount,
        },
      );
    }
  }

  // ── combo_concentration: 1 cặp ≥ N account distinct cùng cược (syndicate) ──
  // Quét topPairs (K đủ lớn — cặp ngoài top có units nhỏ, khó là syndicate đáng kể).
  if (alerts.enabled[Max3dOpsAlertType.ComboConcentration]) {
    for (const p of topPairs) {
      if (p.accounts < alerts.comboAccountsWarn) continue;
      push(
        Max3dOpsAlertType.ComboConcentration,
        // Gấp đôi ngưỡng account → critical.
        p.accounts >= alerts.comboAccountsWarn * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Max3dOpsAlertType.ComboConcentration}:${p.pairKey}`,
        {
          pairKey: p.pairKey,
          triplet1: p.triplet1,
          triplet2: p.triplet2,
          accounts: p.accounts,
          units: p.units,
          amount: p.amount,
          threshold: alerts.comboAccountsWarn,
        },
      );
    }
  }

  return out;
}
