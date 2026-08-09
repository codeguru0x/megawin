import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dproDrawPairStatsEntity } from "@megawin/game-max3dpro/entities";
import type { Document } from "mongodb";

/**
 * Map doc `max3dpro_draw_pair_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`): mọi field được set đủ ngay từ lần
 * `$inc`/`$setOnInsert` đầu tiên (`PairStatsRepository.bulkUpsertDelta`) nên không cần
 * normalize default — nhưng vẫn khai field-by-field để compiler bắt thiếu/lệch key khi
 * entity đổi shape (code-quality §5.4).
 */
export class PairStatsMapper extends MongoMapper<Document, Max3dproDrawPairStatsEntity> {
  protected mapProps(doc: Document): Max3dproDrawPairStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      pairKey: doc.pairKey,
      first: doc.first,
      second: doc.second,
      units: doc.units,
      amount: doc.amount,
      accountCount: doc.accountCount,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dproDrawPairStatsEntity;
  }
}
