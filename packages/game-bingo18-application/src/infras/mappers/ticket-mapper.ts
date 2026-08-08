import { MongoMapper } from "@megawin/data/mongo";
import type { TicketEntity } from "@megawin/game-bingo18/entities";
import { type Document, ObjectId } from "mongodb";

export class TicketMapper extends MongoMapper<Document, TicketEntity> {
  constructor() {
    super();
  }

  protected mapProps(doc: Document): TicketEntity {
    const { _id, ...rest } = doc as any;
    // _id có thể là ObjectId hoặc string tuỳ cách document được insert
    const id = _id instanceof ObjectId ? _id.toHexString() : String(_id);
    return { id, ...rest } as TicketEntity;
  }
}
