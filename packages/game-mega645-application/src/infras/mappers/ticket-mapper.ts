import { MongoMapper } from "@megawin/data/mongo";
import type { TicketDoc } from "@megawin/game-mega645/entities";
import { Document } from "mongodb";

type TicketEntity = TicketDoc & { id: string };

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
