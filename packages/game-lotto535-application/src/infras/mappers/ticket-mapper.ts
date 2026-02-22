import { MongoMapper } from "@megawin/data/mongo/mapper";
import type { Lotto535TicketDoc } from "@megawin/game-lotto535/entities";
import { Document } from "mongodb";

type TicketEntity = Lotto535TicketDoc & { id: string };

export class TicketMapper extends MongoMapper<Document, TicketEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TicketEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TicketEntity;
  }
}

export type { TicketEntity };
