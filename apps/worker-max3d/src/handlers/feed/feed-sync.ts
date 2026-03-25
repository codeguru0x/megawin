/**
 * Lambda: feed-sync (Max 3D)
 *
 * Sync entry data từ max3dTicketEntries → entryFeed (game-core) cho tenant polling.
 * EventBridge gọi mỗi 1 phút. Use case tự quản lý toàn bộ lifecycle.
 *
 * FLOW:
 *   1. acquireLock() — atomic acquire distributed lock, TTL 3 phút.
 *      - Thành công: đọc afterVersion từ cursor, bắt đầu sync loop.
 *      - Thất bại (lock đang bị giữ): log rõ lý do, return { skipped: true }.
 *   2. Loop batches (500 entries/batch):
 *      - getChangedEntries(afterVersion, 500) — query entries có version > cursor.
 *      - buildBatchContext: bulk load draws để lấy drawTime/drawDate chính xác.
 *      - mapToFeedDoc: map boards (triplets) → Max3dFeedBetContent.
 *      - bulkUpsertFeedEntries: 1 MongoDB bulkWrite (unordered) cho cả batch.
 *      - saveAndExtendLock: save cursor + gia hạn lock thêm 3 phút.
 *      - Timeout check ở cuối iteration — batch hiện tại luôn hoàn thành trước khi dừng.
 *   3. Kết thúc khi:
 *      - Không còn entries mới (done = true).
 *      - Vượt quá 10 phút (log + done = false, Lambda sau tiếp tục).
 *   4. releaseLock() — giải phóng lock để Lambda tiếp theo chạy ngay.
 *
 * CONCURRENCY:
 *   EventBridge gọi Lambda mỗi 1 phút. Nếu Lambda trước chưa xong
 *   (lock còn hiệu lực), Lambda sau tự động skip và log lý do.
 *   Lock TTL = 3 phút → crash recovery tự động sau tối đa 3 phút.
 *
 * CRASH RECOVERY:
 *   Cursor được save sau MỖI batch. Crash → mất tối đa 500 entries
 *   (1 batch chưa save). Upsert idempotent (version guard) → không sai data.
 *
 * HIỆU NĂNG:
 *   bulkWrite 500 entries ~80-150ms. Bình thường (10K entries) ~3s.
 */

import { SyncEntryFeedUseCase } from "@megawin/game-max3d-application/use-cases/feed";

const useCase = new SyncEntryFeedUseCase();

export async function handler() {
  return useCase.run();
}
