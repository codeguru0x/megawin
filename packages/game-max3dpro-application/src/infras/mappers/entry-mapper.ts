import { MongoMapper, longToString } from "@megawin/data/mongo";
import type { TicketEntryDoc, TicketEntryEntity } from "@megawin/game-max3dpro/entities";
import { Document } from "mongodb";

export class EntryMapper extends MongoMapper<Document, TicketEntryEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TicketEntryEntity {
    const { _id, ...rest } = doc as any;
    return {
      id: _id.toHexString(),
      ...rest,
      version: longToString(rest.version),
    } as TicketEntryEntity;
  }
}
