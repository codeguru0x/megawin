import { MongoMapper } from "@megawin/data/mongo";
import type { Lotto535DrawNumberStatsEntity } from "@megawin/game-lotto535/entities";
import type { Document } from "mongodb";

/**
 * Map doc `lotto535_draw_number_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link NumberStatsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class NumberStatsMapper extends MongoMapper<Document, Lotto535DrawNumberStatsEntity> {
  protected mapProps(doc: Document): Lotto535DrawNumberStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      kind: doc.kind,
      number: doc.number,
      sets: doc.sets,
      amount: doc.amount,
      boards: doc.boards,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Lotto535DrawNumberStatsEntity;
  }
}
