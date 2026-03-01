import { MongoMapper } from "@megawin/data/mongo";
import type { GlobalConfigDoc, GlobalConfigEntity } from "@megawin/game-power655/entities";

export class GlobalConfigMapper extends MongoMapper<GlobalConfigDoc, GlobalConfigEntity> {
  protected mapProps(doc: GlobalConfigDoc): GlobalConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as GlobalConfigEntity;
  }
}
