import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dDrawPairStatsEntity } from "@megawin/game-max3d/entities";
import { Document } from "mongodb";

/**
 * Map doc `max3d_draw_pair_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link PairStatsRepository.bulkUpsertDelta}), khai
 * tường minh để compiler bắt thiếu/lệch key khi entity đổi shape.
 */
export class PairStatsMapper extends MongoMapper<Document, Max3dDrawPairStatsEntity> {
  protected mapProps(doc: Document): Max3dDrawPairStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      pairKey: doc.pairKey,
      triplet1: doc.triplet1,
      triplet2: doc.triplet2,
      units: doc.units,
      amount: doc.amount,
      accountCount: doc.accountCount,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dDrawPairStatsEntity;
  }
}
