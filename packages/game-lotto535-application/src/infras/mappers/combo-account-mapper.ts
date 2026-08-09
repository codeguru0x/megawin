import { MongoMapper } from "@megawin/data/mongo";
import type { Lotto535DrawComboAccountEntity } from "@megawin/game-lotto535/entities";
import type { Document } from "mongodb";

/**
 * Map doc `lotto535_draw_combo_accounts` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — mọi field được set đủ ngay từ
 * lần `$inc`/`$setOnInsert` đầu tiên ({@link ComboAccountsRepository.bulkUpsertDelta}),
 * khai tường minh để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class ComboAccountMapper extends MongoMapper<Document, Lotto535DrawComboAccountEntity> {
  protected mapProps(doc: Document): Lotto535DrawComboAccountEntity {
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
    } satisfies Lotto535DrawComboAccountEntity;
  }
}
