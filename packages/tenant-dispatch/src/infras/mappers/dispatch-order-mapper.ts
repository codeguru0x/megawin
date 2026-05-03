import { MongoMapper } from "@megawin/data/mongo";
import type { TenantDispatchOrderEntity } from "../../entities";
import { Document } from "mongodb";

/**
 * Mapper convert raw MongoDB document → TenantDispatchOrderEntity.
 * Chuyển `_id` ObjectId → `id` hex string, giữ nguyên các field khác.
 */
export class DispatchOrderMapper extends MongoMapper<Document, TenantDispatchOrderEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TenantDispatchOrderEntity {
    const { _id, ...rest } = doc;
    return { id: _id.toHexString(), ...rest } as TenantDispatchOrderEntity;
  }
}
