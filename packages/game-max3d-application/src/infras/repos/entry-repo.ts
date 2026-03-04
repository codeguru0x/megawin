import { Max3dCollections, PayoutStatus } from "@megawin/game-max3d/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { AbstractEntryRepository } from "@megawin/game-max3d-core/repos";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";

export class EntryRepository extends AbstractEntryRepository<
  EntryEntity,
  EntryMapper,
  Max3dDrawResult,
  string
> {
  constructor() {
    super({
      collName: Max3dCollections.TicketEntries,
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

  async getScheduledEntries(
    drawId: string,
    limit: number
  ): Promise<EntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit }
    );
  }
}

export type { EntryEntity };
