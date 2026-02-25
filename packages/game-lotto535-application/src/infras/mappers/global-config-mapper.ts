import { MongoMapper } from "@megawin/data/mongo/mapper";
import type { GlobalConfigDoc } from "@megawin/game-lotto535/entities";
import { Document } from "mongodb";

export type GlobalConfigEntity = GlobalConfigDoc & { id: string };

export class GameConfigMapper extends MongoMapper<Document, GlobalConfigEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): GlobalConfigEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as GlobalConfigEntity;
  }
}
