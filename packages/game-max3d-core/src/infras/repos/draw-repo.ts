import { DrawStatus } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import { BaseRepo } from "./base-repo";

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Void]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed]),
  [DrawStatus.SalesClosed]: new Set([
    DrawStatus.SalesOpen,
    DrawStatus.Published,
    DrawStatus.Void,
  ]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Void]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
};

export interface VoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

export interface DrawDocBase {
  _id: unknown;
  drawId: string;
  drawDate: string;
  financialDate: string;
  drawTime: Date;
  status: string;
  sales: { openAt?: Date; closeAt: Date };
  financial?: {
    totalRevenue: number;
    totalFixedPrizes: number;
    totalAgentCommission: number;
    companyTake: number;
    companyTakeRate: number;
    companyTakeMax: number;
  };
  stats?: {
    ticketEntryCount: number;
    totalLineCount: number;
    totalSalesAmount: number;
    totalPayoutAmount: number;
  };
  voidInfo?: { reason: string; voidedBy?: string; voidedAt: Date };
  voidSummary?: {
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
    totalRefundDispatched?: number;
    completedAt?: Date;
  };
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
    drawSession: number | string;
  };
}

export abstract class AbstractDrawRepository<
  TEntity extends BaseEntity,
  TMapper extends MongoMapper<Document, TEntity>,
  TDrawResult extends object,
> extends BaseRepo<TEntity, TMapper> {
  async createDraw(doc: Record<string, unknown>): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getDrawById(drawId: string): Promise<TEntity | null> {
    return await this.findOne({ drawId });
  }

  async getDrawsByIds(drawIds: string[]): Promise<TEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany(
      { drawId: { $in: drawIds } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async getDrawsByDate(drawDate: string): Promise<TEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  async listDraws(
    filter: { status?: string; fromDate?: string; toDate?: string },
    page: number,
    size: number
  ): Promise<TEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.fromDate || filter.toDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.fromDate) dateRange.$gte = filter.fromDate;
      if (filter.toDate) dateRange.$lte = filter.toDate;
      query.drawDate = dateRange;
    }
    return await this.paging(query, page, size, {
      sort: { drawDate: -1, drawNo: -1 },
    });
  }

  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string
  ): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set: { status: toStatus, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  async openSales(
    drawId: string,
    fromStatus: string,
    salesOpenAt?: Date
  ): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.SalesOpen)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesOpen,
      updatedAt: new Date(),
    };
    if (salesOpenAt) {
      $set["sales.openAt"] = salesOpenAt;
    }

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set },
      { returnDocument: "after" }
    );
  }

  /**
   * Close sales: salesOpen → salesClosed.
   * Stamp sales.closeAt thời điểm đóng bán thực tế.
   */
  async closeSales(
    drawId: string,
    salesCloseAt?: Date
  ): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.SalesOpen];
    if (!allowed?.has(DrawStatus.SalesClosed)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesClosed,
      updatedAt: new Date(),
    };
    if (salesCloseAt) {
      $set["sales.closeAt"] = salesCloseAt;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.SalesOpen },
      { $set },
      { returnDocument: "after" }
    );
  }

  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: VoidInfo
  ): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.Void)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      {
        $set: {
          status: DrawStatus.Void,
          voidInfo,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  }

  async publishResult(
    drawId: string,
    result: TDrawResult,
    vietlottRef?: DrawDocBase["vietlottRef"]
  ): Promise<TEntity | null> {
    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result: { ...result, publishedAt: now },
      updatedAt: now,
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    const allowed = VALID_TRANSITIONS[DrawStatus.SalesClosed];
    if (!allowed?.has(DrawStatus.Published)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.SalesClosed },
      { $set },
      { returnDocument: "after" }
    );
  }

  async triggerSettle(drawId: string): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Published];
    if (!allowed?.has(DrawStatus.Settling)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Published },
      {
        $set: {
          status: DrawStatus.Settling,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
  }

  async updateFinancial(
    drawId: string,
    financial: NonNullable<DrawDocBase["financial"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } }
    );
  }

  async updateStats(
    drawId: string,
    stats: NonNullable<DrawDocBase["stats"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } }
    );
  }

  async getLatestDraw(): Promise<TEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  async getLatestSettledDraw(): Promise<TEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  async getLatestSettledDrawBefore(drawDate: string): Promise<TEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  async getCurrentDraw(allowStatuses?: string[]): Promise<TEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];
    return await this.findOne(
      { status: { $in: statuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async getActiveDraws(allowStatuses: string[]): Promise<TEntity[]> {
    return await this.findMany(
      { status: { $in: allowStatuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async updateVoidSummary(
    drawId: string,
    summary: NonNullable<DrawDocBase["voidSummary"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { voidSummary: summary, updatedAt: new Date() } }
    );
  }

  async updateSchedule(
    drawId: string,
    sales: { openAt: Date; closeAt: Date; drawTime?: Date }
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "sales.openAt": sales.openAt,
      "sales.closeAt": sales.closeAt,
      updatedAt: new Date(),
    };
    if (sales.drawTime) {
      $set.drawTime = sales.drawTime;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  async updateResult(
    drawId: string,
    result: TDrawResult & { publishedAt: Date },
    vietlottRef?: DrawDocBase["vietlottRef"]
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.updateOne(
      { drawId, status: DrawStatus.Published },
      { $set }
    );
  }

  async countByStatus(status: string): Promise<number> {
    return await this.count({ status });
  }

  async updateVoidInfo(
    drawId: string,
    voidInfo: NonNullable<DrawDocBase["voidInfo"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { voidInfo, updatedAt: new Date() } }
    );
  }
}

export { VALID_TRANSITIONS };
