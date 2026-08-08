/**
 * Lotto 5/35 Operations — Hằng số & label dùng chung cho trang Vận hành (p0-03).
 *
 * Đặt tách khỏi component để adapters + panels + badge dùng chung 1 nguồn. Ngưỡng
 * vận hành THẬT (largeBetAmount, fixedExposureWarnAmount, comboAccountsWarn,
 * coverHighStakeAmount, specialSkewRatio, specialSkewMinAmount) đến từ
 * `snapshot.thresholds` (server đọc GlobalConfig) — KHÔNG hardcode ở đây (mirror Power 6/55).
 */

import { Lotto535OpsAlertType, Lotto535StatsPlayKey, OpsAlertSeverity } from "@megawin/game-lotto535/entities";
import { LOTTO535_PLAY_TYPE_LABELS } from "@megawin/game-lotto535/labels";

/**
 * Label tiếng Việt cho từng loại alert vận hành Lotto 5/35.
 *
 * Khoá đầy đủ theo `Lotto535OpsAlertType` → thêm loại mới, compiler bắt thiếu khoá
 * (Record dẫn xuất từ const-as-const). 2 loại để dành (`revenue_anomaly`,
 * `settle_stuck`) vẫn cần label vì `describeAlert`/group panel có thể gặp (dù P0
 * không bắn) — tránh render "undefined" nếu worker tương lai bật.
 */
export const LOTTO535_OPS_ALERT_TYPE_LABELS: Record<Lotto535OpsAlertType, string> = {
  [Lotto535OpsAlertType.LargeBet]: "Cược lớn",
  [Lotto535OpsAlertType.ExposureThreshold]: "Rủi ro chi trả",
  [Lotto535OpsAlertType.ComboConcentration]: "Dồn bộ số",
  [Lotto535OpsAlertType.CoverHighStake]: "Vé Bao mức cao",
  [Lotto535OpsAlertType.SpecialSkew]: "Dồn số đặc biệt",
  [Lotto535OpsAlertType.RevenueAnomaly]: "Bất thường doanh thu",
  [Lotto535OpsAlertType.SettleStuck]: "Kết sổ treo",
};

/** Thứ tự severity để so sánh/sort (cao hơn = nghiêm trọng hơn). */
export const OPS_ALERT_SEVERITY_RANK: Record<string, number> = {
  [OpsAlertSeverity.Info]: 0,
  [OpsAlertSeverity.Warning]: 1,
  [OpsAlertSeverity.Critical]: 2,
};

/**
 * Thứ tự cố định 13 key thống kê `byPlayType` — nguồn DUY NHẤT để PlayTypeCard/adapter
 * lặp qua (Standard → MainCover4 → MainCover6..15 → SpecialCover). Đổi thứ tự hiển thị
 * chỉ cần sửa 1 chỗ này.
 */
export const LOTTO535_STATS_PLAY_KEY_ORDER: Lotto535StatsPlayKey[] = [
  Lotto535StatsPlayKey.Standard,
  Lotto535StatsPlayKey.MainCover4,
  Lotto535StatsPlayKey.MainCover6,
  Lotto535StatsPlayKey.MainCover7,
  Lotto535StatsPlayKey.MainCover8,
  Lotto535StatsPlayKey.MainCover9,
  Lotto535StatsPlayKey.MainCover10,
  Lotto535StatsPlayKey.MainCover11,
  Lotto535StatsPlayKey.MainCover12,
  Lotto535StatsPlayKey.MainCover13,
  Lotto535StatsPlayKey.MainCover14,
  Lotto535StatsPlayKey.MainCover15,
  Lotto535StatsPlayKey.SpecialCover,
];

/**
 * Label hiển thị cho 1 key thống kê `byPlayType`. `standard`/`mainCover4`/`specialCover`
 * dùng `LOTTO535_PLAY_TYPE_LABELS` (label chuẩn game); `mainCoverN` (N=6..15) sinh label
 * "Bao {N} số chính" — không có label tĩnh sẵn vì N là tham số, không phải `PlayType` riêng.
 */
export function describeStatsPlayKey(key: Lotto535StatsPlayKey): string {
  switch (key) {
    case Lotto535StatsPlayKey.Standard:
      return LOTTO535_PLAY_TYPE_LABELS.standard;
    case Lotto535StatsPlayKey.MainCover4:
      return LOTTO535_PLAY_TYPE_LABELS.mainCover4;
    case Lotto535StatsPlayKey.SpecialCover:
      return LOTTO535_PLAY_TYPE_LABELS.specialCover;
    default: {
      // mainCoverN (N=6..15) — key dạng "mainCover6".."mainCover15", tách số N từ suffix.
      const n = key.replace("mainCover", "");
      return `Bao ${n} số chính`;
    }
  }
}
