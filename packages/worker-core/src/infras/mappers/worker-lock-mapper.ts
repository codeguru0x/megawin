import { MongoMapper } from "@megawin/data/mongo";
import type { WorkerLockDoc, WorkerLockEntity } from "../../entities";

/**
 * Map MongoDB document (`worker_locks` collection) → `WorkerLockEntity`.
 *
 * Map tường minh từng field (KHÔNG `doc as any` / `as WorkerLockEntity`) — generic
 * `MongoMapper<WorkerLockDoc, WorkerLockEntity>` cho compiler tự bắt field thiếu/sai
 * tên khi `WorkerLockDoc` đổi shape.
 *
 * `stalledItems`/`description` vẫn cần xử lý field CÓ THỂ THIẾU trên doc cũ (từ trước
 * 03/08/2026) — `description` optional thật (business lock không khai), nhưng
 * `stalledItems` chỉ optional vì doc cũ. `kind` KHÔNG còn optional — mọi doc đã backfill
 * `kind`, mapper đọc thẳng `doc.kind` không cần `??`.
 */
export class WorkerLockMapper extends MongoMapper<WorkerLockDoc, WorkerLockEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: WorkerLockDoc): WorkerLockEntity {
    return {
      id: doc._id.toHexString(),
      lockKey: doc.lockKey,
      ownerToken: doc.ownerToken,
      expiresAt: doc.expiresAt,
      acquiredAt: doc.acquiredAt,
      isEnabled: doc.isEnabled,
      cursor: doc.cursor,
      lastSuccessAt: doc.lastSuccessAt,
      lastError: doc.lastError,
      // Doc tạo trước 03/08/2026 thiếu field → [] (rỗng ≡ không item nào kẹt).
      stalledItems: doc.stalledItems ?? [],
      description: doc.description,
      kind: doc.kind,
    } satisfies WorkerLockEntity;
  }
}
