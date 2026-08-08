/**
 * Bingo 18 Operations — Hằng số & label dùng chung cho trang Vận hành (p0-05).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn.
 * Ngưỡng vận hành THẬT (exposureWarnRevenuePct, sidebetSkewPct, bucketConcentrationAmount,
 * largeBetAmount) đến từ `snapshot.thresholds` (server đọc GlobalConfig). Hằng số fallback
 * ở đây CHỈ dùng khi slice threshold chưa về (loading) — tô màu, KHÔNG sinh alert.
 */

import { Bingo18OpsAlertType, Bingo18PlayType, OpsAlertSeverity } from "@megawin/game-bingo18/entities";
import { BINGO18_BIG_SMALL_BET_LABELS } from "@megawin/game-bingo18/labels";

/**
 * Label tiếng Việt cho từng loại alert vận hành Bingo 18.
 *
 * NHÃN PHẢI KHỚP `ALERT_META` trong config `_lib/ops-section.tsx` — 2 trang cùng nhãn
 * cho cùng alert type (guideline ops-config §4). Khoá đầy đủ theo `Bingo18OpsAlertType`
 * → thêm loại mới, compiler bắt thiếu khoá.
 */
export const BINGO18_OPS_ALERT_TYPE_LABELS: Record<Bingo18OpsAlertType, string> = {
  [Bingo18OpsAlertType.LargeBet]: "Cược lớn",
  [Bingo18OpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Bingo18OpsAlertType.SidebetSkew]: "Lệch Lớn/Hòa/Nhỏ",
  [Bingo18OpsAlertType.BucketConcentration]: "Dồn cửa nhân cao",
  [Bingo18OpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Bingo18OpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Nhãn hướng bigSmallDraw — tái dùng labels domain (không viết lại text). */
export const BINGO18_DIRECTION_LABELS = BINGO18_BIG_SMALL_BET_LABELS;

/**
 * Nhãn 1 bucket nhân cao trong payload `bucket_concentration` — build từ playType + key.
 * VD: (sumTotal, "18") → "Tổng 18"; (tripleMatch, "6") → "Bộ ba số 6".
 */
export function describeHighBucket(playType: string, bucketKey: string): string {
  if (playType === Bingo18PlayType.SumTotal) return `Tổng ${bucketKey}`;
  return `Bộ ba số ${bucketKey}`;
}

/**
 * Ngưỡng lệch bigSmallDraw (%) — fallback client CHỈ khi `snapshot.thresholds` chưa về
 * (loading). Server sinh alert theo config; UI tô màu theo threshold từ snapshot.
 */
export const SIDEBET_SKEW_PCT_DEFAULT = 70;

/** Ngưỡng % doanh thu cảnh báo exposure — fallback loading (server: exposureWarnRevenuePct). */
export const EXPOSURE_WARN_REVENUE_PCT_DEFAULT = 300;

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};
