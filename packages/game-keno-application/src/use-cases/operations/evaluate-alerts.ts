/**
 * Keno – Alert Evaluator (pure)
 *
 * So data stats/combo đã có in-memory với ngưỡng `ops.alerts` → sinh danh sách alert
 * (analysis §3.5). Pure & không I/O: worker gọi sau khi update stats/combo rồi
 * `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * Dedupe: mỗi alert có `dedupeKey` unique cùng drawId → upsert idempotent, KHÔNG bắn
 * nhiều doc trùng loại/scope trong 1 kỳ (1 combo vượt ngưỡng = 1 doc, cập nhật payload
 * mỗi tick). Severity map theo mức vượt ngưỡng (warning/critical).
 */

import type {
  KenoCappablePlayType,
  KenoDrawBettingStatsEntity,
  KenoDrawComboStatsEntity,
  KenoOpsAlertDoc,
  KenoSideBetPlayType,
  OpsAlertsConfig,
  PayoutCaps,
} from "@megawin/game-keno/entities";
import {
  KenoBigSmallBet,
  KenoEvenOddBet,
  KenoOpsAlertType,
  KenoPlayType,
  OpsAlertSeverity,
  OpsAlertStatus,
} from "@megawin/game-keno/entities";
import { capExposureByPlayType } from "@megawin/game-keno/rules";
import { sumBy } from "@megawin/shared/utils/array";

/** Snapshot stats + combo cần cho evaluate. */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã đọc từ DB (tích luỹ cả kỳ, KHÔNG phải delta 1 batch). */
  stats: KenoDrawBettingStatsEntity;
  /** Combo tập trung của kỳ (`accountCount ≥ ngưỡng`) — nguồn rule combo_concentration. */
  combos: KenoDrawComboStatsEntity[];
  /** Ngưỡng động `ops.alerts`. */
  alerts: OpsAlertsConfig;
  /** Cap trả thưởng kỳ (từ GlobalConfig) — mẫu số cho exposure %. */
  caps: PayoutCaps;
}

type NewAlert = Omit<KenoOpsAlertDoc, "_id">;

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateAlerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, combos, alerts, caps } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: KenoOpsAlertType,
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

  // ── large_bet: gộp 1 alert/draw kèm top entry lớn (chốt p0-06) ──
  // Đếm gộp theo largeBetCount; payload đính top potential entries để staff drill-down.
  if (alerts.enabled[KenoOpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential.filter((p) => p.amount >= alerts.largeBetAmount).slice(0, 10);
    push(
      KenoOpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      `${KenoOpsAlertType.LargeBet}:${drawId}`,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worst-case tổng chạm % cap kỳ ──
  // Mẫu số = tổng cap 3 bậc cao (giới hạn trả thưởng cứng /kỳ).
  // Doc lưu worst-case RAW (chưa cap) → áp cap ở đây trước khi tính % (analysis §3.4).
  if (alerts.enabled[KenoOpsAlertType.ExposureThreshold]) {
    const capTotal = caps.pick8MaxPerDraw + caps.pick9MaxPerDraw + caps.pick10MaxPerDraw;
    if (capTotal > 0) {
      const capped = capExposureByPlayType(stats.exposure.worstCaseByPlayType, caps);
      const pct = (capped.worstCaseTotal / capTotal) * 100;
      if (pct >= alerts.exposureWarnPct) {
        push(
          KenoOpsAlertType.ExposureThreshold,
          // Chạm/vượt 100% cap → critical.
          pct >= 100 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
          `${KenoOpsAlertType.ExposureThreshold}:${drawId}`,
          {
            worstCaseTotal: capped.worstCaseTotal,
            capTotal,
            pct: Math.round(pct),
            threshold: alerts.exposureWarnPct,
          },
        );
      }
    }
  }

  // ── sidebet_skew: lệch 1 hướng trong cặp side bet ──
  if (alerts.enabled[KenoOpsAlertType.SidebetSkew]) {
    evaluateSidebetSkew(stats, alerts, drawId, push);
  }

  // ── cap_sets_near: số bộ cappable gần cap maxSetsForFixed ──
  if (alerts.enabled[KenoOpsAlertType.CapSetsNear]) {
    const { pick8, pick9, pick10 } = stats.exposure.capSets;
    const warn = alerts.comboSetsWarn;
    const check = (pick: KenoCappablePlayType, sets: number, warnAt: number, capAt: number): void => {
      if (sets >= warnAt) {
        push(
          KenoOpsAlertType.CapSetsNear,
          // Đã vượt cap thật → chia đều kích hoạt → critical.
          sets >= capAt ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
          `${KenoOpsAlertType.CapSetsNear}:${drawId}:${pick}`,
          { pick, sets, warnAt, capAt },
        );
      }
    };
    check(KenoPlayType.Pick8, pick8, warn.pick8, caps.pick8MaxSetsForFixed);
    check(KenoPlayType.Pick9, pick9, warn.pick9, caps.pick9MaxSetsForFixed);
    check(KenoPlayType.Pick10, pick10, warn.pick10, caps.pick10MaxSetsForFixed);
  }

  // ── combo_concentration: nhiều account cùng cược 1 bộ số (syndicate) ──
  if (alerts.enabled[KenoOpsAlertType.ComboConcentration]) {
    for (const combo of combos) {
      // `accountCount` là counter vô hướng trong doc (thay `accounts.length` của mảng cũ) —
      // repo đã filter `>= comboAccountsWarn` nên đây chỉ phân mức severity.
      const players = combo.accountCount;
      if (players >= alerts.comboAccountsWarn) {
        push(
          KenoOpsAlertType.ComboConcentration,
          // Rất đông người dồn 1 bộ → critical.
          players >= alerts.comboAccountsWarn * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
          `${KenoOpsAlertType.ComboConcentration}:${combo.comboKey}`,
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

  return out;
}

/**
 * Rule sidebet_skew: với mỗi cặp side bet, nếu 1 hướng chiếm ≥ `sidebetSkewPct` tổng
 * tiền cặp → alert. Kiểm 2 cặp: bigSmall (big/small/draw) và evenOdd (5 hướng).
 */
function evaluateSidebetSkew(
  stats: Pick<KenoDrawBettingStatsEntity, "byPlayType">,
  alerts: OpsAlertsConfig,
  drawId: string,
  push: (
    type: KenoOpsAlertType,
    severity: OpsAlertSeverity,
    dedupeKey: string,
    payload: Record<string, unknown>,
  ) => void,
): void {
  const evalPair = (
    pairKey: KenoSideBetPlayType,
    directions: Array<{ dir: KenoBigSmallBet | KenoEvenOddBet; amount: number }>,
  ): void => {
    const total = sumBy(directions, (d) => d.amount);
    if (total <= 0) return;

    let top = directions[0]!;

    for (const d of directions) {
      if (d.amount > top.amount) {
        top = d;
      }
    }

    const pct = (top.amount / total) * 100;
    if (pct >= alerts.sidebetSkewPct) {
      push(
        KenoOpsAlertType.SidebetSkew,
        pct >= 90 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${KenoOpsAlertType.SidebetSkew}:${drawId}:${pairKey}`,
        {
          pair: pairKey,
          direction: top.dir,
          pct: Math.round(pct),
          total,
          threshold: alerts.sidebetSkewPct,
        },
      );
    }
  };

  evalPair(KenoPlayType.BigSmall, [
    { dir: KenoBigSmallBet.Big, amount: stats.byPlayType.bigSmall.big.amount },
    { dir: KenoBigSmallBet.Small, amount: stats.byPlayType.bigSmall.small.amount },
    { dir: KenoBigSmallBet.BigSmallDraw, amount: stats.byPlayType.bigSmall.draw.amount },
  ]);
  evalPair(KenoPlayType.EvenOdd, [
    { dir: KenoEvenOddBet.Even, amount: stats.byPlayType.evenOdd.even.amount },
    { dir: KenoEvenOddBet.Even1112, amount: stats.byPlayType.evenOdd.even1112.amount },
    { dir: KenoEvenOddBet.EvenOddDraw, amount: stats.byPlayType.evenOdd.draw.amount },
    { dir: KenoEvenOddBet.Odd1112, amount: stats.byPlayType.evenOdd.odd1112.amount },
    { dir: KenoEvenOddBet.Odd, amount: stats.byPlayType.evenOdd.odd.amount },
  ]);
}
