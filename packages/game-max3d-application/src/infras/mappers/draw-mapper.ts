import { MongoMapper } from "@megawin/data/mongo";
import type { DrawDoc } from "@megawin/game-max3d/entities";
import { Document } from "mongodb";

type DrawEntity = DrawDoc & { id: string };

export class DrawMapper extends MongoMapper<Document, DrawEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): DrawEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as DrawEntity;
  }
}

export type { DrawEntity };
