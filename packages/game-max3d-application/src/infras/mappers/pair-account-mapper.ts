import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dDrawPairAccountEntity } from "@megawin/game-max3d/entities";
import type { Document } from "mongodb";

/**
 * Map doc `max3d_draw_pair_accounts` → entity (ObjectId → id hex).
 *
 * Field-by-field tường minh — chỉ dùng để đếm distinct account (`countAccountsByPair`),
 * không có UI drill-down riêng nên shape tối giản (khác Keno combo-accounts).
 */
export class PairAccountMapper extends MongoMapper<Document, Max3dDrawPairAccountEntity> {
  protected mapProps(doc: Document): Max3dDrawPairAccountEntity {
    return {
      id: doc._id.toHexString(),
      drawId: doc.drawId,
      pairKey: doc.pairKey,
      accountId: doc.accountId,
      lastEntryId: doc.lastEntryId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    } satisfies Max3dDrawPairAccountEntity;
  }
}
