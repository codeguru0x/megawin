import type { WorkerLockKind } from "../../../entities";

/**
 * Input cho `WorkerLockRepository.tryAcquire`.
 *
 * Caller chịu trách nhiệm sinh `ownerToken` ngẫu nhiên (`crypto.randomUUID()`)
 * và reuse token đó cho tất cả các thao tác trên lock (extend/release/updateMeta).
 */
export interface AcquireOptions {
  /**
   * Lock key — domain-specific, unique toàn hệ thống.
   * Convention: `"{worker-name}:{lane}"`. VD: `"tenant-dispatch:main"`.
   */
  lockKey: string;

  /**
   * Token đại diện owner hiện tại.
   * Khuyến nghị dùng `crypto.randomUUID()` — đảm bảo unique per invocation.
   */
  ownerToken: string;

  /**
   * TTL (giây) cho lock. Nên `> Lambda timeout + buffer` để lock không hết
   * hạn giữa chừng khi worker đang chạy.
   */
  ttlSeconds: number;

  /**
   * Mô tả worker làm gì — ghi qua `$set` (KHÔNG `$setOnInsert`, xem
   * `worker-lock-repo.ts`). Bỏ trống để giữ nguyên giá trị đã có trên doc.
   */
  description?: string;

  /**
   * Loại lock — `SingleRunWorker` luôn truyền `WorkerLockKind.Worker`,
   * `DistributedMutex` truyền `WorkerLockKind.Business`.
   */
  kind: WorkerLockKind;
}
