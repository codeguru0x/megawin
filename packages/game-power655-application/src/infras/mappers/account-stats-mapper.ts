import { MongoMapper } from "@megawin/data/mongo";
import type { Power655DrawAccountStatsEntity } from "@megawin/game-power655/entities";
import { Document } from "mongodb";

/**
 * Map doc `power655_draw_account_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link AccountStatsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class AccountStatsMapper extends MongoMapper<Document, Power655DrawAccountStatsEntity> {
  protected mapProps(doc: Document): Power655DrawAccountStatsEntity {
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
    } satisfies Power655DrawAccountStatsEntity;
  }
}
