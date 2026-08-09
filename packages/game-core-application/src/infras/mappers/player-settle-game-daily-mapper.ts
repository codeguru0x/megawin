import { MongoMapper } from "@megawin/data/mongo";
import type { PlayerSettleGameDailyEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (player_settle_game_daily) → PlayerSettleGameDailyEntity.
 *
 * Chuyển đổi `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu — Date vẫn là Date, GameProduct vẫn là string.
 */
export class PlayerSettleGameDailyMapper extends MongoMapper<Document, PlayerSettleGameDailyEntity> {
  protected mapProps(doc: Document): PlayerSettleGameDailyEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as PlayerSettleGameDailyEntity;
  }
}
