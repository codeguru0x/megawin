import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dproDrawAccountStatsEntity } from "@megawin/game-max3dpro/entities";
import { Document } from "mongodb";

/**
 * Map doc `max3dpro_draw_account_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — compiler bắt thiếu/lệch key khi
 * entity đổi shape (code-quality §5.4).
 */
export class AccountStatsMapper extends MongoMapper<Document, Max3dproDrawAccountStatsEntity> {
  protected mapProps(doc: Document): Max3dproDrawAccountStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      accountId: doc.accountId,
      username: doc.username,
      amount: doc.amount,
      entries: doc.entries,
      sets: doc.sets,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dproDrawAccountStatsEntity;
  }
}
