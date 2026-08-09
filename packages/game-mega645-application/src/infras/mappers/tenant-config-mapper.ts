import { MongoMapper } from "@megawin/data/mongo";
import type { TenantConfigDoc, TenantConfigEntity } from "@megawin/game-mega645/entities";
import type { Document } from "mongodb";

export class TenantConfigMapper extends MongoMapper<Document, TenantConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TenantConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TenantConfigEntity;
  }
}
