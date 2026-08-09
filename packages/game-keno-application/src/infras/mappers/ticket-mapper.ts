import { MongoMapper } from "@megawin/data/mongo";
import type { TicketDoc, TicketEntity } from "@megawin/game-keno/entities";
import type { Document } from "mongodb";

export class TicketMapper extends MongoMapper<Document, TicketEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TicketEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TicketEntity;
  }
}
