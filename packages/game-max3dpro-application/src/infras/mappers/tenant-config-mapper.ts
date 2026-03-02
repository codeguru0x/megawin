import { MongoMapper } from "@megawin/data/mongo";
import type { TenantConfigDoc } from "@megawin/game-max3dpro/entities";
import { Document } from "mongodb";

export type TenantConfigEntity = TenantConfigDoc & { id: string };

export class TenantConfigMapper extends MongoMapper<Document, TenantConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TenantConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TenantConfigEntity;
  }
}
