import { MongoMapper } from "@megawin/data/mongo";
import type { DrawDoc, DrawEntity } from "@megawin/game-bingo18/entities";
import type { Document } from "mongodb";

export class DrawMapper extends MongoMapper<Document, DrawEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): DrawEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as DrawEntity;
  }
}
