import { MongoMapper } from "@megawin/data/mongo";
import type { DrawCounterDoc } from "@megawin/game-keno/entities";
import { Document } from "mongodb";

type DrawCounterEntity = DrawCounterDoc & { id: string };

export class DrawCounterMapper extends MongoMapper<Document, DrawCounterEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): DrawCounterEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as DrawCounterEntity;
  }
}

export type { DrawCounterEntity };
