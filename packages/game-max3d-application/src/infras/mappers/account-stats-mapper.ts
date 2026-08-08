import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dDrawAccountStatsEntity } from "@megawin/game-max3d/entities";
import type { Document } from "mongodb";

/**
 * Map doc `max3d_draw_account_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link AccountStatsRepository.bulkUpsertDelta}), khai
 * tường minh để compiler bắt thiếu/lệch key khi entity đổi shape.
 */
export class AccountStatsMapper extends MongoMapper<Document, Max3dDrawAccountStatsEntity> {
  protected mapProps(doc: Document): Max3dDrawAccountStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      accountId: doc.accountId,
      username: doc.username,
      amount: doc.amount,
      entries: doc.entries,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dDrawAccountStatsEntity;
  }
}
