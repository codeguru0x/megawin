import { MongoMapper } from "@megawin/data/mongo";
import type { TenantConfigDoc, TenantConfigEntity } from "@megawin/game-power655/entities";

export class TenantConfigMapper extends MongoMapper<TenantConfigDoc, TenantConfigEntity> {
  protected mapProps(doc: TenantConfigDoc): TenantConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TenantConfigEntity;
  }
}
