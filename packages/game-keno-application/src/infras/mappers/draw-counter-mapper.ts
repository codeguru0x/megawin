import { MongoMapper } from "@megawin/data/mongo";
import type { DrawCounterDoc, DrawCounterEntity } from "@megawin/game-keno/entities";
import { Document } from "mongodb";

export class DrawCounterMapper extends MongoMapper<Document, DrawCounterEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): DrawCounterEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as DrawCounterEntity;
  }
}
