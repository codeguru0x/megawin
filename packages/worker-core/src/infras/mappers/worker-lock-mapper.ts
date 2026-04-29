import { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import type { WorkerLockEntity } from "../../entities";

/**
 * Map MongoDB document (`worker_locks` collection) → `WorkerLockEntity`.
 *
 * Chuyển đổi duy nhất: `_id: ObjectId` → `id: string` (hex).
 * Các field khác (`lockKey`, `ownerToken`, `expiresAt`, `acquiredAt`, `isEnabled`,
 * `meta`) giữ nguyên kiểu dữ liệu từ MongoDB.
 */
export class WorkerLockMapper extends MongoMapper<Document, WorkerLockEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): WorkerLockEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as WorkerLockEntity;
  }
}
