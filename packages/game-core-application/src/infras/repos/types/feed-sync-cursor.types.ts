/**
 * Kết quả acquire distributed lock cho feed sync worker.
 * Trả về từ FeedSyncCursorRepository.acquireLock().
 */
export interface AcquireLockResult {
  /** True nếu lock được acquire thành công. */
  acquired: boolean;
  /**
   * Version cuối đã sync (string từ BSON Long).
   * Worker dùng làm afterVersion cho lần chạy tiếp.
   * "0" nếu chưa có bản ghi nào.
   */
  afterVersion: string;
}
