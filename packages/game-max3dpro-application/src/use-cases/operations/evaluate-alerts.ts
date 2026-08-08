/**
 * Max 3D Pro – Alert Evaluator (pure)
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

import { Max3dproOpsAlertType, OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-max3dpro/entities";
import type { Max3dproExposureResult } from "@megawin/game-max3dpro/rules";
import type {
  Max3dproDrawBettingStatsDoc,
  Max3dproOpsAlertDoc,
  Max3dproTopPair,
  OpsAlertsConfig,
} from "@megawin/game-max3dpro/entities";

/** Snapshot stats + exposure cần cho evaluate (đã có in-memory ở worker). */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã build (không cần `_id`). */
  stats: Omit<Max3dproDrawBettingStatsDoc, "_id" | "drawId">;
  /**
   * Top cặp ORDERED (derive từ `max3dpro_draw_pair_stats`, KHÔNG còn trong stats doc — p0-01
   * §1). Dùng cho rule `combo_concentration` (quét `accounts` distinct per-cặp).
   */
  topPairs: Max3dproTopPair[];
  /** Exposure tính từ tripletStakes/topPairs (computeMax3dproExposure — tầng đọc). */
  exposure: Max3dproExposureResult;
  /** Ngưỡng động `ops.alerts`. */
  alerts: OpsAlertsConfig;
}

type NewAlert = Omit<Max3dproOpsAlertDoc, "_id">;

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateMax3dproAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, topPairs, exposure, alerts } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Max3dproOpsAlertType,
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
  if (alerts.enabled[Max3dproOpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential.filter((p) => p.amount >= alerts.largeBetAmount).slice(0, 10);
    push(
      Max3dproOpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      `${Max3dproOpsAlertType.LargeBet}:${drawId}`,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worstCaseTotal ≥ ngưỡng TUYỆT ĐỐI ──
  // Payload tách 3 thành phần (basic exact / max pair / plus tail proxy) để formatter
  // hiển thị trung thực phần nào exact phần nào ước lượng.
  if (alerts.enabled[Max3dproOpsAlertType.ExposureThreshold]) {
    const worst = exposure.worstCaseTotal;
    if (worst >= alerts.exposureWarnAmount) {
      push(
        Max3dproOpsAlertType.ExposureThreshold,
        // Gấp đôi ngưỡng → critical.
        worst >= alerts.exposureWarnAmount * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Max3dproOpsAlertType.ExposureThreshold}:${drawId}`,
        {
          worstCaseTotal: worst,
          maxPairLiability: exposure.topPairLiabilities[0]?.liability ?? 0,
          tailProxy: exposure.tailProxy,
          revenue: stats.totals.revenue,
          threshold: alerts.exposureWarnAmount,
        },
      );
    }
  }

  // ── pair_liability: 1 cặp plus liability ĐB ≥ ngưỡng — 1 alert / CẶP ──
  // dedupeKey theo pairKey: mỗi cặp vượt ngưỡng là 1 alert riêng, payload cập nhật
  // units/liability mới nhất mỗi tick. Critical LUÔN (1 tỷ/unit, không cap).
  if (alerts.enabled[Max3dproOpsAlertType.PairLiability]) {
    for (const p of exposure.topPairLiabilities) {
      if (p.liability < alerts.pairLiabilityWarnAmount) break; // đã sort desc.
      push(
        Max3dproOpsAlertType.PairLiability,
        OpsAlertSeverity.Critical,
        `${Max3dproOpsAlertType.PairLiability}:${p.pairKey}`,
        {
          pairKey: p.pairKey,
          first: p.first,
          second: p.second,
          unitsForward: p.unitsForward,
          unitsReverse: p.unitsReverse,
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
  if (alerts.enabled[Max3dproOpsAlertType.ComboConcentration]) {
    for (const p of topPairs) {
      if (p.accounts < alerts.comboAccountsWarn) continue;
      push(
        Max3dproOpsAlertType.ComboConcentration,
        // Gấp đôi ngưỡng account → critical.
        p.accounts >= alerts.comboAccountsWarn * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Max3dproOpsAlertType.ComboConcentration}:${p.pairKey}`,
        {
          pairKey: p.pairKey,
          first: p.first,
          second: p.second,
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
