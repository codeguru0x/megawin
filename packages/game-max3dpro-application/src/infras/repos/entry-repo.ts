import {
  Max3dproCollections,
  PayoutStatus,
  type EntryPayout,
  type EntryVoidInfo,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import { AbstractEntryRepository } from "@megawin/game-max3d-core/repos";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";

export class EntryRepository extends AbstractEntryRepository<
  EntryEntity,
  EntryMapper,
  Max3dproDrawResult,
  string,
  EntryPayout,
  EntryVoidInfo
> {
  constructor() {
    super({
      collName: Max3dproCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  protected get payoutStatusPending() {
    return PayoutStatus.Pending;
  }
  protected get payoutStatusFailed() {
    return PayoutStatus.Failed;
  }
  protected get payoutStatusDispatched() {
    return PayoutStatus.Dispatched;
  }
}

export type { EntryEntity };
