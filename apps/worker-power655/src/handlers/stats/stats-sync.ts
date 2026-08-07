/**
 * Lambda: stats-sync (Power 6/55)
 *
 * Cập nhật collection pre-aggregated `power655_draw_betting_stats` (+ number/account/combo
 * stats) cho mọi kỳ đang mở — nguồn dữ liệu cho trang Vận hành (đọc findOne O(1), không
 * aggregate on-demand). KHÔNG đụng hot path place-bet (analysis §3.1–3.3).
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop có `sleep(tickSeconds)`
 * (~55s budget) để đạt nhịp cập nhật <1 phút, rồi thoát cho invocation kế tiếp takeover.
 * Distributed lock `power655:stats-sync` (TTL 120s) đảm bảo 1 invocation chạy tại 1 thời điểm.
 *
 * CRASH RECOVERY: watermark `lastEntryId` lưu trong từng stats/number/account/combo doc →
 * invocation sau đọc lại qua `findNotFinal` và tiếp tục từ đúng batch chưa áp — không cần
 * recompute lại từ đầu.
 */

import { SyncBettingStatsUseCase } from "@megawin/game-power655-application/use-cases/operations";

const useCase = new SyncBettingStatsUseCase();

export async function handler() {
  return useCase.run();
}
