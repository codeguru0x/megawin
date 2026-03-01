import { MongoMapper } from "@megawin/data/mongo";
import type { JackpotCycleDoc, JackpotCycleEntity } from "@megawin/game-power655/entities";

export class JackpotCycleMapper extends MongoMapper<JackpotCycleDoc, JackpotCycleEntity> {
  protected mapProps(doc: JackpotCycleDoc): JackpotCycleEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as JackpotCycleEntity;
  }
}
