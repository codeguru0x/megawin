import { MongoMapper } from "@megawin/data/mongo";
import type { GlobalConfigDoc, GlobalConfigEntity } from "@megawin/game-mega645/entities";
import { Document } from "mongodb";

export class GameConfigMapper extends MongoMapper<Document, GlobalConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): GlobalConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as GlobalConfigEntity;
  }
}
