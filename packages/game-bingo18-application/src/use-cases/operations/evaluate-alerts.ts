/**
 * Bingo 18 – Alert Evaluator (pure)
 *
 * So data stats + exposure đã có in-memory với ngưỡng `ops.alerts` → sinh danh sách
 * alert (analysis bingo18-ops §3.5, plan p0-04). Pure & không I/O: worker gọi sau khi
 * update stats rồi `bulkUpsertByDedupe`. Mỗi rule chỉ chạy khi `enabled[type] === true`.
 *
 * KHÁC Keno: exposure là số CHÍNH XÁC (216 outcome) chứ không proxy — ngưỡng
 * exposure_threshold so `max(sàn tuyệt đối, % doanh thu kỳ)` (không có cap kỳ làm
 * mẫu số — chốt §7 Q2). `bucket_concentration` thay `combo_concentration`: tiền dồn
 * 1 bucket nhân cao (sumTotal 3/18, tripleMatch specific — ×120).
 *
 * Dedupe: mỗi alert có `dedupeKey` unique cùng drawId → upsert idempotent, KHÔNG bắn
 * nhiều doc trùng loại/scope trong 1 kỳ (payload cập nhật mỗi tick).
 */

import type {
  Bingo18BucketStat,
  Bingo18DrawBettingStatsDoc,
  Bingo18OpsAlertDoc,
  OpsAlertsConfig,
} from "@megawin/game-bingo18/entities";
import { Bingo18OpsAlertType, Bingo18PlayType, OpsAlertSeverity, OpsAlertStatus } from "@megawin/game-bingo18/entities";
import type { Bingo18ExposureResult } from "@megawin/game-bingo18/rules";
import { BINGO18_HIGH_MULTIPLIER_BUCKETS } from "@megawin/game-bingo18/rules";

/** Snapshot stats + exposure cần cho evaluate (đã có in-memory ở worker). */
export interface EvaluateAlertsInput {
  drawId: string;
  /** Stats doc đã build (không cần `_id`). */
  stats: Omit<Bingo18DrawBettingStatsDoc, "_id" | "drawId">;
  /** Exposure CHÍNH XÁC tính từ bucket (computeBingo18Exposure — tầng đọc). */
  exposure: Bingo18ExposureResult;
  /** Ngưỡng động `ops.alerts`. */
  alerts: OpsAlertsConfig;
}

type NewAlert = Omit<Bingo18OpsAlertDoc, "_id">;

/**
 * Đánh giá toàn bộ rule, trả alert cần upsert. Chỉ rule `enabled` mới chạy.
 */
export function evaluateBingo18Alerts(input: EvaluateAlertsInput): NewAlert[] {
  const { drawId, stats, exposure, alerts } = input;
  const now = new Date();
  const out: NewAlert[] = [];

  const push = (
    type: Bingo18OpsAlertType,
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
  // Đếm gộp theo largeBetCount; payload đính top potential entries để staff drill-down.
  if (alerts.enabled[Bingo18OpsAlertType.LargeBet] && stats.totals.largeBetCount > 0) {
    const topLarge = stats.topPotential.filter((p) => p.amount >= alerts.largeBetAmount).slice(0, 10);
    push(
      Bingo18OpsAlertType.LargeBet,
      // Nhiều cược lớn → critical, ít → warning.
      stats.totals.largeBetCount >= 10 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
      `${Bingo18OpsAlertType.LargeBet}:${drawId}`,
      { count: stats.totals.largeBetCount, threshold: alerts.largeBetAmount, top: topLarge },
    );
  }

  // ── exposure_threshold: worstCase ≥ max(sàn tuyệt đối, % doanh thu kỳ) ──
  // Bingo 18 KHÔNG có cap kỳ → mẫu số = revenue; sàn `exposureWarnMinAmount` chống
  // noise kỳ vắng (revenue nhỏ → % luôn cao) — chốt 30/07/2026 (§7 Q2).
  if (alerts.enabled[Bingo18OpsAlertType.ExposureThreshold]) {
    const worst = exposure.worstCase.amount;
    const revenue = stats.totals.revenue;
    const pctThreshold = revenue > 0 ? (revenue * alerts.exposureWarnRevenuePct) / 100 : Infinity;
    const threshold = Math.max(alerts.exposureWarnMinAmount, pctThreshold);
    if (worst >= threshold) {
      const pct = revenue > 0 ? (worst / revenue) * 100 : 0;
      push(
        Bingo18OpsAlertType.ExposureThreshold,
        // Gấp đôi ngưỡng % → critical.
        pct >= alerts.exposureWarnRevenuePct * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Bingo18OpsAlertType.ExposureThreshold}:${drawId}`,
        {
          worstCase: worst,
          worstNumbers: exposure.worstCase.numbers,
          worstSum: exposure.worstCase.sum,
          expectedPayout: Math.round(exposure.expectedPayout),
          revenue,
          pct: Math.round(pct),
          thresholdPct: alerts.exposureWarnRevenuePct,
          thresholdMinAmount: alerts.exposureWarnMinAmount,
        },
      );
    }
  }

  // ── sidebet_skew: 1 hướng bigSmallDraw chiếm ≥ sidebetSkewPct tổng tiền 3 hướng ──
  // Xác suất nền ĐỐI XỨNG: small (tổng 3-9) 81/216 = 37,5% · draw (10-11) 54/216 = 25%
  // · big (12-18) 81/216 = 37,5%. Skew về small hay big đều bất thường như nhau ở cùng %.
  if (alerts.enabled[Bingo18OpsAlertType.SidebetSkew]) {
    const dirs = [
      { dir: "big", amount: stats.byPlayType.bigSmallDraw.big.amount },
      { dir: "draw", amount: stats.byPlayType.bigSmallDraw.draw.amount },
      { dir: "small", amount: stats.byPlayType.bigSmallDraw.small.amount },
    ];
    const total = dirs.reduce((s, d) => s + d.amount, 0);
    if (total > 0) {
      let top = dirs[0]!;
      for (const d of dirs) if (d.amount > top.amount) top = d;
      const pct = (top.amount / total) * 100;
      if (pct >= alerts.sidebetSkewPct) {
        push(
          Bingo18OpsAlertType.SidebetSkew,
          pct >= 90 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
          `${Bingo18OpsAlertType.SidebetSkew}:${drawId}`,
          {
            pair: Bingo18PlayType.BigSmallDraw,
            direction: top.dir,
            pct: Math.round(pct),
            total,
            threshold: alerts.sidebetSkewPct,
          },
        );
      }
    }
  }

  // ── bucket_concentration: tiền dồn 1 bucket NHÂN CAO ≥ ngưỡng ──
  // Bucket nhân cao = tập cố định BINGO18_HIGH_MULTIPLIER_BUCKETS (sumTotal 3/18 +
  // tripleMatch specific — ×120). 1 alert / bucket vượt ngưỡng (dedupeKey theo bucket).
  if (alerts.enabled[Bingo18OpsAlertType.BucketConcentration]) {
    for (const b of BINGO18_HIGH_MULTIPLIER_BUCKETS) {
      const bucket = resolveHighBucket(stats, b.playType, b.key);
      if (!bucket || bucket.amount < alerts.bucketConcentrationAmount) continue;
      push(
        Bingo18OpsAlertType.BucketConcentration,
        // Gấp đôi ngưỡng → critical.
        bucket.amount >= alerts.bucketConcentrationAmount * 2 ? OpsAlertSeverity.Critical : OpsAlertSeverity.Warning,
        `${Bingo18OpsAlertType.BucketConcentration}:${b.playType}:${b.key}`,
        {
          playType: b.playType,
          bucketKey: b.key,
          amount: bucket.amount,
          sets: bucket.sets,
          entries: bucket.entries,
          threshold: alerts.bucketConcentrationAmount,
        },
      );
    }
  }

  return out;
}

/** Lấy bucket nhân cao từ stats theo (playType, key) — chỉ 2 nhóm ×120. */
function resolveHighBucket(
  stats: Omit<Bingo18DrawBettingStatsDoc, "_id" | "drawId">,
  playType: typeof Bingo18PlayType.SumTotal | typeof Bingo18PlayType.TripleMatch,
  key: string,
): Bingo18BucketStat | undefined {
  if (playType === Bingo18PlayType.SumTotal) return stats.byPlayType.sumTotal[key];
  return stats.byPlayType.tripleMatch.specific[key];
}
