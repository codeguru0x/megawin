import { MongoMapper } from "@megawin/data/mongo";
import type { Power655DrawNumberStatsEntity } from "@megawin/game-power655/entities";
import { Document } from "mongodb";

/**
 * Map doc `power655_draw_number_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link NumberStatsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class NumberStatsMapper extends MongoMapper<Document, Power655DrawNumberStatsEntity> {
  protected mapProps(doc: Document): Power655DrawNumberStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      number: doc.number,
      sets: doc.sets,
      amount: doc.amount,
      boards: doc.boards,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Power655DrawNumberStatsEntity;
  }
}
