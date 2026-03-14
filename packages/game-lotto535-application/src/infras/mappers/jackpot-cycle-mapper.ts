import { MongoMapper } from "@megawin/data/mongo";
import type { JackpotCycleDoc, JackpotCycleEntity } from "@megawin/game-lotto535/entities";
import { Document } from "mongodb";

export class JackpotCycleMapper extends MongoMapper<
  Document,
  JackpotCycleEntity
> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): JackpotCycleEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as JackpotCycleEntity;
  }
}
