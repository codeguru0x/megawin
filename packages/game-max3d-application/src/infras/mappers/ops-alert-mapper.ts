import { MongoMapper } from "@megawin/data/mongo";
import type { Max3dOpsAlertEntity } from "@megawin/game-max3d/entities";
import type { Document } from "mongodb";

/** Doc `max3d_ops_alerts` → entity (ObjectId → id hex). */
export class OpsAlertMapper extends MongoMapper<Document, Max3dOpsAlertEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): Max3dOpsAlertEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as Max3dOpsAlertEntity;
  }
}
