import { MongoMapper } from "@megawin/data/mongo";
import type { Mega645DrawNumberStatsEntity } from "@megawin/game-mega645/entities";
import { Document } from "mongodb";

/**
 * Map doc `mega645_draw_number_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link NumberStatsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class NumberStatsMapper extends MongoMapper<Document, Mega645DrawNumberStatsEntity> {
  protected mapProps(doc: Document): Mega645DrawNumberStatsEntity {
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
    } satisfies Mega645DrawNumberStatsEntity;
  }
}
