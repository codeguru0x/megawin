import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dproOpsAlertEntity } from "@megawin/game-max3dpro/entities";
import { Document } from "mongodb";

/** Doc `max3dpro_ops_alerts` → entity (ObjectId → id hex). */
export class OpsAlertMapper extends MongoMapper<Document, Max3dproOpsAlertEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): Max3dproOpsAlertEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as Max3dproOpsAlertEntity;
  }
}
