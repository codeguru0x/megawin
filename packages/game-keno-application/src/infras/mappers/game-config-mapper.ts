import { MongoMapper } from "@megawin/data/mongo/mapper";
import type { GlobalConfigDoc, TenantConfigDoc } from "@megawin/game-keno/entities";
import { Document } from "mongodb";

type GlobalConfigEntity = GlobalConfigDoc & { id: string };
type TenantConfigEntity = TenantConfigDoc & { id: string };

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

export type { GlobalConfigEntity, TenantConfigEntity };
