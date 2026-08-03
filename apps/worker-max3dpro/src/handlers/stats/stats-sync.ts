/**
 * Lambda: stats-sync (Max 3D Pro)
 *
 * Cập nhật collection pre-aggregated `max3dpro_draw_betting_stats` (+ pair/pair-account/account
 * stats) cho mọi kỳ chưa `final` — nguồn dữ liệu cho trang Vận hành (đọc findOne O(1), không
 * aggregate on-demand). KHÔNG đụng hot path place-bet.
 *
 * EventBridge gọi mỗi 1 phút; use case chạy intra-invocation loop có `sleep(tickSeconds)`
 * (~55s budget, tick mặc định 30s — Max 3D Pro 3 kỳ/tuần T3/5/7 bán nhiều ngày) rồi thoát cho
 * invocation kế tiếp takeover. Distributed lock `max3dpro:stats-sync` (TTL 120s).
 *
 * CRASH RECOVERY: watermark `lastEntryId` lưu trong từng stats doc → invocation sau đọc tiếp
 * từ đúng vị trí. `$inc` idempotent theo watermark `$lt` nên đọc lại 1 batch = no-op — không
 * cần bước recompute full. Đánh giá alert nằm ở worker riêng `ops-alerts.handler`.
 */

import { SyncBettingStatsUseCase } from "@megawin/game-max3dpro-application/use-cases/operations";

const useCase = new SyncBettingStatsUseCase();

export async function handler() {
  return useCase.run();
}
