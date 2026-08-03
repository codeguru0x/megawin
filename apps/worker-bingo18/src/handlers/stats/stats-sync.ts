/**
 * Lambda: stats-sync (Bingo 18)
 *
 * Cập nhật collection pre-aggregated `bingo18_draw_betting_stats` cho mọi kỳ chưa `final` —
 * nguồn dữ liệu cho trang Vận hành (đọc findOne O(1), không aggregate on-demand).
 * KHÔNG đụng hot path place-bet.
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop (`TickLoopWorker`) có
 * `sleep(tickSeconds)` (~55s budget) để đạt nhịp cập nhật <1 phút, rồi thoát cho invocation
 * kế tiếp takeover. Distributed lock `bingo18:stats-sync` (TTL 120s) đảm bảo 1 invocation
 * chạy tại 1 thời điểm.
 *
 * CRASH RECOVERY: watermark `lastEntryId` lưu trong từng stats doc, cộng dồn bằng `$inc`
 * per-doc idempotent (không đọc baseline). Invocation sau đọc lại đúng batch chưa áp rồi
 * tiếp tục — không cần recompute. Kỳ ở trạng thái TERMINAL (Settled/Void) và đã hút cạn
 * entries mới được đóng dấu `final`, dừng quét.
 */

import { SyncBettingStatsUseCase } from "@megawin/game-bingo18-application/use-cases/operations";

const useCase = new SyncBettingStatsUseCase();

export async function handler() {
  return useCase.run();
}
