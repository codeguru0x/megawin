import { longToString, MongoMapper } from "@megawin/data/mongo";
import type { EntryFeedEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (entryFeed collection) → EntryFeedEntity.
 *
 * Xử lý chuyển đổi quan trọng:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `version` (BSON Long) → `version` (string) via longToString().
 *
 * Tất cả field khác giữ nguyên kiểu (Date vẫn là Date ở entity layer).
 */
export class EntryFeedMapper extends MongoMapper<Document, EntryFeedEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): EntryFeedEntity {
    const { _id, version, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      version: longToString(version),
      ...rest,
    } as EntryFeedEntity;
  }
}
