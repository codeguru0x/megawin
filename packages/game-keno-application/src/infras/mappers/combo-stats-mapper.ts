import { MongoMapper } from "@megawin/data/mongo";
import type { KenoDrawComboStatsEntity } from "@megawin/game-keno/entities";
import type { Document } from "mongodb";

/**
 * Map doc `keno_draw_combo_stats` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`): mọi field của doc này được set đủ
 * ngay từ lần `$inc`/`$setOnInsert` đầu tiên ({@link ComboStatsRepository.bulkUpsertDelta})
 * nên không cần normalize default như `BettingStatsMapper` — nhưng vẫn khai field-by-field
 * để compiler bắt thiếu/lệch key khi entity đổi shape (code-quality §5.4 Q2).
 */
export class ComboStatsMapper extends MongoMapper<Document, KenoDrawComboStatsEntity> {
  protected mapProps(doc: Document): KenoDrawComboStatsEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      comboKey: doc.comboKey,
      playType: doc.playType,
      numbers: doc.numbers,
      sets: doc.sets,
      amount: doc.amount,
      accountCount: doc.accountCount,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies KenoDrawComboStatsEntity;
  }
}
