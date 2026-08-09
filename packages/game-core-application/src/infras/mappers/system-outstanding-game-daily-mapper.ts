import { MongoMapper } from "@megawin/data/mongo";
import type { SystemOutstandingGameDailyEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (system_outstanding_game_daily) → SystemOutstandingGameDailyEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date, GameProduct vẫn là string.
 */
export class SystemOutstandingGameDailyMapper extends MongoMapper<Document, SystemOutstandingGameDailyEntity> {
  protected mapProps(doc: Document): SystemOutstandingGameDailyEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as SystemOutstandingGameDailyEntity;
  }
}
