/**
 * DTO types cho dashboard draw timeline — dùng chung dashboard route + tool AI `getDrawsOverview`.
 *
 * Đặt tại `server/use-cases/draws/` (không phải `app/api/dashboard/draws/_lib/`) vì có 2 consumer
 * trong CHÍNH backoffice (dashboard card, tool AI) — cùng theo nguyên tắc RAW facade trung lập ở
 * `server/use-cases/jackpot/get-current-jackpots.ts`.
 */

/** Trạng thái kỳ quay trên draw timeline. */
export type DrawEventStatus = "active" | "settled" | "scheduled";

/** 1 kỳ quay trên draw timeline — game tần suất thấp (lottery). */
export interface DrawTimelineEvent {
  /** Game product ID. */
  gameProduct: string;
  /** Draw ID thật từ DB (format YYYY-MM-DD.NNN) — dùng cho URL link → /games/:game/operations?drawId=:drawId. */
  drawId: string;
  /** Số kỳ trong ngày (drawNo). */
  drawNo: number;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /**
   * active = đang mở bán / đóng bán / đã publish / đang settle / đang void.
   * settled = đã settle hoặc void.
   * scheduled = chưa mở bao giờ, chờ đến giờ.
   */
  status: DrawEventStatus;
  /** Thời điểm quay / dự kiến quay (ISO string). */
  drawAt: string;
  /** Số entries đang pending (chỉ có khi status = active và draw có stats). */
  pendingEntries?: number;
  /** Tổng stake pending VND (chỉ có khi status = active và draw có stats). */
  pendingStake?: number;
}

/**
 * Summary cho games tần suất cao (keno, bingo18).
 *
 * Trên dashboard không liệt kê từng kỳ mà gộp thành 1 dòng summary
 * vì mỗi game có hàng chục kỳ outstanding cùng lúc.
 */
export interface HighFreqGameSummary {
  /** Game product ID. */
  gameProduct: string;
  /** Số kỳ đang diễn ra (active). */
  activeCount: number;
  /** Số kỳ đã hoàn thành gần đây (N phiên gần nhất). */
  settledCount: number;
  /** Số kỳ chờ mở (scheduled). */
  scheduledCount: number;
  /** Kỳ tiếp theo (nearest scheduled) — ISO string. */
  nextDrawAt: string | null;
  /** Tổng entries đang pending across all active draws. */
  totalPendingEntries: number;
  /** Tổng stake pending VND. */
  totalPendingStake: number;
}

/** Output cho `GetDashboardDrawsUseCase` — dùng chung route `/api/dashboard/draws` + tool AI. */
export interface GetDashboardDrawsOutput {
  /** Events chi tiết cho games tần suất thấp (lottery). */
  events: DrawTimelineEvent[];
  /** Summary cho games tần suất cao (keno, bingo18). */
  highFreqGames: HighFreqGameSummary[];
  /** Thời điểm snapshot (ISO string). */
  snapshotAt: string;
}
