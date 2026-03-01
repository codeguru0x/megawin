import { MongoMapper } from "@megawin/data/mongo";
import type { TicketEntryDoc } from "@megawin/game-keno/entities";
import { Document } from "mongodb";

type EntryEntity = TicketEntryDoc & { id: string };

export class EntryMapper extends MongoMapper<Document, EntryEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): EntryEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as EntryEntity;
  }
}

export type { EntryEntity };
