import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dproDrawPairAccountEntity } from "@megawin/game-max3dpro/entities";
import type { Document } from "mongodb";

/**
 * Map doc `max3dpro_draw_pair_accounts` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh (không spread `as Entity`) — compiler bắt thiếu/lệch key khi
 * entity đổi shape (code-quality §5.4).
 */
export class PairAccountMapper extends MongoMapper<Document, Max3dproDrawPairAccountEntity> {
  protected mapProps(doc: Document): Max3dproDrawPairAccountEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      pairKey: doc.pairKey,
      accountId: doc.accountId,
      units: doc.units,
      amount: doc.amount,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dproDrawPairAccountEntity;
  }
}
