/**
 * Mapper cho `tx_logs` collection — doc → `TxLogEntity`.
 *
 * Map `_id` (ObjectId) → `id` (hex string); copy nguyên các field còn lại.
 */

import { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";

import type { TxLogEntity } from "../../entities";

export class TxLogMapper extends MongoMapper<Document, TxLogEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TxLogEntity {
    const { _id, ...rest } = doc;
    return { id: _id.toHexString(), ...rest } as TxLogEntity;
  }
}
