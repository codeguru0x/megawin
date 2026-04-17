import { MongoMapper } from "@megawin/data/mongo";
import type { TxIntentDoc, TxIntentEntity } from "@megawin/game-core/entities";
import type { Document } from "mongodb";

/**
 * Map MongoDB document (tx_intents collection) → TxIntentEntity.
 *
 * Chuyển đổi duy nhất: `_id` (ObjectId) → `id` (hex string).
 * Tất cả field khác giữ nguyên kiểu (Date vẫn là Date, null vẫn là null).
 */
export class TxIntentMapper extends MongoMapper<Document, TxIntentEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TxIntentEntity {
    const { _id, ...rest } = doc as unknown as TxIntentDoc;

    return {
      id: (_id as { toHexString(): string }).toHexString(),
      ...rest,
    } as TxIntentEntity;
  }
}
