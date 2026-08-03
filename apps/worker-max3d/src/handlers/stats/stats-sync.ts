/**
 * Lambda: stats-sync (Max 3D)
 *
 * Cập nhật collection pre-aggregated `max3d_draw_betting_stats` cho mọi kỳ chưa `final` —
 * nguồn dữ liệu cho trang Vận hành (đọc findOne O(1), không aggregate on-demand). KHÔNG
 * đụng hot path place-bet.
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop có `sleep(tickSeconds)`
 * (~55s budget, tick mặc định 30s — Max 3D 3 kỳ/tuần bán nhiều ngày) rồi thoát cho
 * invocation kế tiếp takeover. Distributed lock `max3d:stats-sync` (TTL 120s).
 *
 * CRASH RECOVERY: watermark `lastEntryId` lưu ngay trong stats doc (cùng lệnh `$inc`) →
 * invocation sau đọc lại và tiếp tục — KHÔNG cần recompute (p0-01: `$inc` idempotent
 * theo watermark thay `$set` full snapshot).
 *
 * Đánh giá alert nghiệp vụ KHÔNG còn ở worker này — xem handler `ops-alerts.ts`.
 */

import { SyncBettingStatsUseCase } from "@megawin/game-max3d-application/use-cases/operations";

const useCase = new SyncBettingStatsUseCase();

export async function handler() {
  return useCase.run();
}
