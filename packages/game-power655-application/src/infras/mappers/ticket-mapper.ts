import { MongoMapper } from "@megawin/data/mongo";
import type { TicketDoc, TicketEntity } from "@megawin/game-power655/entities";

export class TicketMapper extends MongoMapper<TicketDoc, TicketEntity> {
  protected mapProps(doc: TicketDoc): TicketEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest } as TicketEntity;
  }
}
