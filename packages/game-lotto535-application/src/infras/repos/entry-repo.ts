import {
  Lotto535Collections,
} from "@megawin/game-lotto535/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import type { MainTuple, Special } from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";

export class EntryRepository extends BaseRepo<
  EntryEntity,
  EntryMapper
> {
  constructor() {
    super({
      collName: Lotto535Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  async getEntriesByDrawId(
    drawId: string,
    page: number,
    size: number,
  ): Promise<EntryEntity[]> {
    return await this.paging(
      { drawId },
      page,
      size,
      { sort: { createdAt: 1 } },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async countLinesByDrawId(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId } },
      { $group: { _id: null, total: { $sum: "$lineCount" } } },
    ]);
    return (result[0] as any)?.total ?? 0;
  }

  /**
   * Batch update entry status for a draw.
   * Used by: CloseSales (scheduled -> active), Settle worker (drawn -> settled).
   */
  async batchTransitionByDrawId(
    drawId: string,
    fromStatus: string,
    toStatus: string,
    extraSet?: Record<string, unknown>,
  ): Promise<number> {
    const $set: Record<string, unknown> = {
      status: toStatus,
      updatedAt: new Date(),
      ...extraSet,
    };
    const result = await this.updateMany(
      { drawId, status: fromStatus },
      { $set },
    );
    return result.modifiedCount;
  }

  /**
   * Copy draw result to all entries for this draw.
   * Called after PublishResult.
   */
  async stampResultOnEntries(
    drawId: string,
    result: {
      winningMain: MainTuple;
      winningSpecial: Special;
      publishedAt: Date;
    },
  ): Promise<number> {
    const updated = await this.updateMany(
      { drawId, status: EntryStatus.Active },
      {
        $set: {
          result,
          status: EntryStatus.Drawn,
          updatedAt: new Date(),
        },
      },
    );
    return updated.modifiedCount;
  }

  /** Revenue aggregation per tenant for a draw. */
  async aggregateRevenueByTenant(
    drawId: string,
  ): Promise<Array<{ tenantId: string; revenue: number; entryCount: number }>> {
    const result = await this.aggregate([
      { $match: { drawId } },
      {
        $group: {
          _id: "$tenantId",
          revenue: { $sum: "$amount" },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      revenue: r.revenue,
      entryCount: r.entryCount,
    }));
  }
}
