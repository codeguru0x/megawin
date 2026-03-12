import { MongoMapper } from "@megawin/data/mongo";
import type { DrawDoc, DrawEntity } from "@megawin/game-power655/entities";

export class DrawMapper extends MongoMapper<DrawDoc, DrawEntity> {
  protected mapProps(doc: DrawDoc): DrawEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as DrawEntity;
  }
}

export type { DrawEntity };
