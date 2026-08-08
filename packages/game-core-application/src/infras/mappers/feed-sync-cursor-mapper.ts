import { longToString, MongoMapper } from "@megawin/data/mongo";
import type { FeedSyncCursorEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (feedSyncCursor collection) → FeedSyncCursorEntity.
 *
 * Chuyển đổi quan trọng:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `lastVersion` (BSON Long) → `lastVersion` (string) via longToString().
 *
 * Tất cả field khác giữ nguyên kiểu (Date vẫn là Date, null vẫn là null).
 */
export class FeedSyncCursorMapper extends MongoMapper<Document, FeedSyncCursorEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): FeedSyncCursorEntity {
    const { _id, lastVersion, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      lastVersion: longToString(lastVersion),
      ...rest,
    } as FeedSyncCursorEntity;
  }
}
