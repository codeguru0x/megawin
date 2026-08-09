import { MongoMapper } from "@megawin/data/mongo";
import type { GlobalConfigEntity, TenantConfigEntity } from "@megawin/game-bingo18/entities";
import type { Document } from "mongodb";

export class GameConfigMapper extends MongoMapper<Document, GlobalConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): GlobalConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as GlobalConfigEntity;
  }
}

export class TenantConfigMapper extends MongoMapper<Document, TenantConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TenantConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TenantConfigEntity;
  }
}
