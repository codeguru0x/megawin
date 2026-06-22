import { MongoMapper } from "@megawin/data/mongo";
import type {
  JackpotCycleEntryDoc,
  JackpotCycleEntryEntity,
} from "@megawin/game-lotto535/entities";

/** Mapper: JackpotCycleEntryDoc → JackpotCycleEntryEntity (_id → id). */
export class JackpotCycleEntryMapper extends MongoMapper<
  JackpotCycleEntryDoc,
  JackpotCycleEntryEntity
> {
  protected mapProps(doc: JackpotCycleEntryDoc): JackpotCycleEntryEntity {
    const { _id, ...rest } = doc as any;
    return { id: _id.toHexString(), ...rest };
  }
}
