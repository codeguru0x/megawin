import { MongoMapper } from "@megawin/data/mongo";
import type { KenoDrawComboAccountEntity } from "@megawin/game-keno/entities";
import type { Document } from "mongodb";

/**
 * Map doc `keno_draw_combo_accounts` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link ComboAccountsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class ComboAccountMapper extends MongoMapper<Document, KenoDrawComboAccountEntity> {
  protected mapProps(doc: Document): KenoDrawComboAccountEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      comboKey: doc.comboKey,
      accountId: doc.accountId,
      username: doc.username,
      sets: doc.sets,
      amount: doc.amount,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies KenoDrawComboAccountEntity;
  }
}
