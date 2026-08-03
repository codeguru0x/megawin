import type { DrawStatus } from "@megawin/game-core/entities";
import type { Bingo18DrawBettingStatsEntity, TopAccountStat } from "@megawin/game-bingo18/entities";
import type { Bingo18ExposureResult } from "@megawin/game-bingo18/rules";

/** Input snapshot vận hành — 1 kỳ cụ thể. */
export interface GetOpsSnapshotInput {
  /** Kỳ cần đọc snapshot. */
  drawId: string;
}

/** Đếm alert theo mức độ — cho badge header (không timer riêng). */
export interface SnapshotAlertCounts {
  /** Alert `status: new` (chưa ack). */
  new: number;
  /** Alert `severity: critical` chưa ack (badge đỏ + âm thanh tuỳ chọn). */
  critical: number;
}

/**
 * Ngưỡng vận hành từ GlobalConfig gửi kèm snapshot — để FE TÔ MÀU đúng cấu hình thực
 * (bài học Keno Risk #9). Hằng số client chỉ là fallback loading. KHÔNG dùng để sinh
 * alert (alert do worker sinh server-side).
 */
export interface SnapshotThresholds {
  /** Ngưỡng cược lớn (VND) — tô đỏ entry lớn trong live feed. */
  largeBetAmount: number;
  /** % doanh thu kỳ để cảnh báo exposure — tô gauge Exposure card. */
  exposureWarnRevenuePct: number;
  /** Sàn tuyệt đối (VND) exposure — dưới sàn gauge luôn xanh (tooltip giải thích). */
  exposureWarnMinAmount: number;
  /** % lệch 1 hướng bigSmallDraw — tô split bar side bet. */
  sidebetSkewPct: number;
  /** Ngưỡng tiền dồn 1 bucket nhân cao (VND) — tô amber bar sumTotal. */
  bucketConcentrationAmount: number;
}

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — nguồn cho **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 5 request aggregation on-demand cũ bằng 1 findOne pre-aggregated. `stats` null
 * khi worker chưa tạo doc (kỳ vừa mở, chưa có cược). FE dùng `select` slice từng field
 * để section này đổi không kéo section khác re-render.
 */
export interface GetOpsSnapshotOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** Trạng thái kỳ — FE tắt poll khi settled/voided + invalidate draw selector khi đổi pha. */
  drawStatus: DrawStatus | null;
  /** Stats pre-aggregated; null nếu worker chưa tạo doc (chưa có cược). */
  stats: Bingo18DrawBettingStatsEntity | null;
  /**
   * Exposure CHÍNH XÁC per-outcome (216) — tính thuần từ bucket lúc build response,
   * KHÔNG lưu trong doc (bài học Keno Risk #4). null khi chưa có stats.
   */
  exposure: Bingo18ExposureResult | null;
  /**
   * Top người chơi theo tiền cược — derive lúc ĐỌC từ `bingo18_draw_account_stats`
   * (`sort({amount:-1}).limit(topAccountsK)`). Rỗng khi chưa ai cược.
   *
   * KHÔNG còn nằm trong `stats` doc: mảng top-K theo metric TÍCH LUỸ không thể seed lại
   * chính xác giữa các tick (account rơi khỏi top-K mất lịch sử → drift, p0-03).
   */
  topAccounts: TopAccountStat[];
  /**
   * Số người chơi distinct trong kỳ — `countDocuments` trên `bingo18_draw_account_stats`
   * (1 doc/account).
   *
   * Trước p0-03 KPI này để trống (`null`) vì stats doc chỉ có mảng top-K (đếm `length` của
   * top-K là SAI — bị chặn ở K).
   */
  uniquePlayers: number;
  /** Đếm alert cho badge header. */
  alertCounts: SnapshotAlertCounts;
  /** Ngưỡng vận hành từ config — FE tô màu đúng cấu hình. */
  thresholds: SnapshotThresholds;
  /** Nhịp poll FE nên dùng (giây) = `ops.stats.tickSeconds` — khớp cadence worker. */
  pollSeconds: number;
}
