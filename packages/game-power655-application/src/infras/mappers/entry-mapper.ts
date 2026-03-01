import { MongoMapper, longToString } from "@megawin/data/mongo";
import type { TicketEntryDoc, TicketEntryEntity } from "@megawin/game-power655/entities";

export class EntryMapper extends MongoMapper<TicketEntryDoc, TicketEntryEntity> {
  protected mapProps(doc: TicketEntryDoc): TicketEntryEntity {
    const { _id, ...rest } = doc as any;
    return {
      id: _id.toHexString(),
      ...rest,
      version: longToString(rest.version),
    } as TicketEntryEntity;
  }
}
