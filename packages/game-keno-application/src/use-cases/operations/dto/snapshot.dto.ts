import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  ComboSetsWarn,
  KenoDrawBettingStatsEntity,
  KenoTopCombo,
  TopAccountStat,
} from "@megawin/game-keno/entities";

/** Input snapshot vận hành — 1 kỳ cụ thể. */
export interface GetOpsSnapshotInput {
  /** Kỳ cần đọc snapshot. */
  drawId: string;
}

/** Đếm alert theo mức độ — cho badge header (không timer riêng — analysis §4.1). */
export interface SnapshotAlertCounts {
  /** Alert `status: new` (chưa ack). */
  new: number;
  /** Alert `severity: critical` (badge đỏ + âm thanh tuỳ chọn). */
  critical: number;
}

/**
 * Ngưỡng vận hành từ GlobalConfig gửi kèm snapshot — để FE TÔ MÀU đúng cấu hình thực
 * (analysis §4.3). Trước đây FE hardcode default (60/70/50/12/5) dễ lệch config server;
 * nay đọc thẳng từ response. KHÔNG dùng để sinh alert (alert do worker sinh server-side).
 */
export interface SnapshotThresholds {
  /** % cap kỳ để cảnh báo exposure (`ops.alerts.exposureWarnPct`). Tô gauge. */
  exposureWarnPct: number;
  /** % lệch 1 hướng side bet để cảnh báo (`ops.alerts.sidebetSkewPct`). Tô progress bar. */
  sidebetSkewPct: number;
  /** Ngưỡng số bộ cappable gần cap (`ops.alerts.comboSetsWarn`). */
  comboSetsWarn: ComboSetsWarn;
  /** Mẫu số cap `maxSetsForFixed` per bậc — dùng làm mẫu số ratio capSets trên Exposure card. */
  maxSetsForFixed: { pick8: number; pick9: number; pick10: number };
}

/**
 * Exposure worst-case ĐÃ áp cap `maxPerDraw` (analysis §3.4). Doc lưu RAW (chưa cap) để
 * cộng/trừ delta void không lệch; use-case cap lúc build response.
 */
export interface SnapshotCappedExposure {
  /** Worst-case theo kiểu chơi (VND) sau cap. */
  worstCaseByPlayType: Record<string, number>;
  /** Tổng worst-case (VND) sau cap = Σ trên. */
  worstCaseTotal: number;
}

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — nguồn cho **timer 1 duy nhất** (analysis §4.1).
 *
 * Thay 5–6 request aggregation on-demand cũ bằng 1 findOne pre-aggregated. `stats` null
 * khi worker chưa tạo doc (kỳ vừa mở, chưa có cược). FE dùng `select` slice từng field
 * để section này đổi không kéo section khác re-render (§4.2).
 */
export interface GetOpsSnapshotOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** Trạng thái kỳ — FE tắt poll khi settled/voided. */
  drawStatus: DrawStatus | null;
  /** Stats pre-aggregated; null nếu worker chưa tạo doc (chưa có cược). */
  stats: KenoDrawBettingStatsEntity | null;
  /**
   * Top combo bị dồn cược — derive lúc ĐỌC từ `keno_draw_combo_stats`
   * (`sort({sets:-1}).limit(topCombosK)`).
   *
   * KHÔNG còn nằm trong stats doc: mảng top-K theo metric TÍCH LUỸ không thể seed lại chính
   * xác giữa các tick (combo rơi khỏi top-K mất lịch sử → drift, p2-01 §3.5). Rỗng khi chưa
   * ai cược.
   */
  topCombos: KenoTopCombo[];
  /**
   * Top người chơi theo tiền cược — derive lúc ĐỌC từ `keno_draw_account_stats`
   * (`sort({amount:-1}).limit(topAccountsK)`). Cùng lý do như {@link topCombos}.
   */
  topAccounts: TopAccountStat[];
  /**
   * Số người chơi distinct trong kỳ — `countDocuments` trên `keno_draw_account_stats`
   * (1 doc/account).
   *
   * Trước p2-01 KPI này để trống vì stats doc chỉ có mảng top-K (đếm `length` của top-K là
   * SAI — bị chặn ở K).
   */
  uniquePlayers: number;
  /**
   * Exposure worst-case ĐÃ cap — null khi chưa có stats. Dùng cho Exposure card thay cho
   * `stats.exposure.worstCaseTotal` (là RAW chưa cap).
   */
  cappedExposure: SnapshotCappedExposure | null;
  /** Đếm alert cho badge header. */
  alertCounts: SnapshotAlertCounts;
  /** Ngưỡng vận hành từ config — FE tô màu đúng cấu hình (§4.3). */
  thresholds: SnapshotThresholds;
  /** Nhịp poll FE nên dùng (giây) = `ops.stats.tickSeconds` — khớp cadence worker. */
  pollSeconds: number;
}
