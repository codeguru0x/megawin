import { MongoMapper } from "@megawin/data/mongo";
import type { TicketEntity } from "@megawin/game-max3d/entities";
import { Document } from "mongodb";

export class TicketMapper extends MongoMapper<Document, TicketEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TicketEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TicketEntity;
  }
}
