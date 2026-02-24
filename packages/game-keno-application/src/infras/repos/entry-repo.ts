import { KenoCollections } from "@megawin/game-keno/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: KenoCollections.TicketEntries,
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

  async stampResultOnEntries(
    drawId: string,
    result: {
      winningNumbers: number[];
      publishedAt: Date;
      bigCount: number;
      smallCount: number;
      evenCount: number;
      oddCount: number;
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
