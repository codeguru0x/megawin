/**
 * Lambda: stats-sync (Keno)
 *
 * Cập nhật collection pre-aggregated `keno_draw_betting_stats` cho mọi kỳ đang mở —
 * nguồn dữ liệu cho trang Vận hành (đọc findOne O(1), không aggregate on-demand).
 * KHÔNG đụng hot path place-bet (analysis §3.1–3.3).
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop có `sleep(tickSeconds)`
 * (~55s budget) để đạt nhịp cập nhật <1 phút, rồi thoát cho invocation kế tiếp takeover.
 * Distributed lock `keno:stats-sync` (TTL 120s) đảm bảo 1 invocation chạy tại 1 thời điểm.
 *
 * CRASH RECOVERY: watermark `lastEntryId` lưu trong từng stats doc → invocation sau đọc lại
 * qua `findNotFinal` và tiếp tục từ đúng batch chưa áp — không cần recompute lại từ đầu.
 */

import { SyncBettingStatsUseCase } from "@megawin/game-keno-application/use-cases/operations";

const useCase = new SyncBettingStatsUseCase();

export async function handler() {
  return useCase.run();
}
