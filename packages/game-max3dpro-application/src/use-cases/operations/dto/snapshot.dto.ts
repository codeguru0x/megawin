import type { DrawStatus } from "@megawin/game-core/entities";
import type { Max3dproDrawBettingStatsEntity, TopAccountStat } from "@megawin/game-max3dpro/entities";
import type { Max3dproExposureResult } from "@megawin/game-max3dpro/rules";

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
 * alert (alert do worker sinh server-side). Max 3D Pro: ngưỡng TUYỆT ĐỐI VND.
 */
export interface SnapshotThresholds {
  /** Ngưỡng cược lớn (VND) — tô đỏ entry lớn trong live feed. */
  largeBetAmount: number;
  /** Ngưỡng worst-case tổng (VND tuyệt đối) — tô gauge Exposure card. */
  exposureWarnAmount: number;
  /** Ngưỡng liability ĐB 1 cặp plus (VND) — tô đỏ hàng pair vượt ngưỡng. */
  pairLiabilityWarnAmount: number;
  /** Số account distinct 1 cặp → nghi syndicate — tô amber cột accounts. */
  comboAccountsWarn: number;
}

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — nguồn cho **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 6 request aggregation on-demand cũ bằng 1 findOne pre-aggregated. `stats` null
 * khi worker chưa tạo doc (kỳ vừa mở, chưa có cược). FE dùng `select` slice từng field
 * để section này đổi không kéo section khác re-render.
 */
export interface GetOpsSnapshotOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** Trạng thái kỳ — FE tắt poll khi settled/voided + invalidate draw selector khi đổi pha. */
  drawStatus: DrawStatus | null;
  /** Stats pre-aggregated; null nếu worker chưa tạo doc (chưa có cược). */
  stats: Max3dproDrawBettingStatsEntity | null;
  /**
   * Exposure (basic EXACT greedy + pair liability + plus tail proxy) — tính thuần từ
   * tripletStakes/topPairs lúc build response, KHÔNG lưu trong doc (Keno Risk #4).
   * null khi chưa có stats.
   */
  exposure: Max3dproExposureResult | null;
  /**
   * Top account theo dòng tiền — derive từ `max3dpro_draw_account_stats` (KHÔNG còn trong
   * stats doc — p0-01 §1). Rỗng khi chưa có stats.
   */
  topAccounts: TopAccountStat[];
  /**
   * Số account distinct đã cược kỳ này — `countDocuments` trên `account_stats` (nguồn CHÍNH
   * XÁC, thay `uniquePlayers: null` proxy cũ). null khi chưa có stats.
   */
  uniquePlayers: number | null;
  /** Đếm alert cho badge header. */
  alertCounts: SnapshotAlertCounts;
  /** Ngưỡng vận hành từ config — FE tô màu đúng cấu hình. */
  thresholds: SnapshotThresholds;
  /** Nhịp poll FE nên dùng (giây) = `ops.stats.tickSeconds` — khớp cadence worker. */
  pollSeconds: number;
}
