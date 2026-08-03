import { MongoMapper } from "@megawin/data/mongo";
import type { Bingo18OpsAlertEntity } from "@megawin/game-bingo18/entities";
import { Document } from "mongodb";

/** Doc `bingo18_ops_alerts` → entity (ObjectId → id hex). */
export class OpsAlertMapper extends MongoMapper<Document, Bingo18OpsAlertEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): Bingo18OpsAlertEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as Bingo18OpsAlertEntity;
  }
}
