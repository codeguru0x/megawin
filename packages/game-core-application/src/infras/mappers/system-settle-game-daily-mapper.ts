import { MongoMapper } from "@megawin/data/mongo";
import type { SystemSettleGameDailyEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (system_settle_game_daily) → SystemSettleGameDailyEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date, GameProduct vẫn là string.
 */
export class SystemSettleGameDailyMapper extends MongoMapper<
  Document,
  SystemSettleGameDailyEntity
> {
  protected mapProps(doc: Document): SystemSettleGameDailyEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as SystemSettleGameDailyEntity;
  }
}
