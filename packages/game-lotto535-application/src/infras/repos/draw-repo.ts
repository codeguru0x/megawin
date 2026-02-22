import {
  Lotto535Collections,
  Lotto535DrawStatus,
  type DrawResultSource,
} from "@megawin/game-lotto535/entities";
import type {
  Lotto535DrawDoc,
  Lotto535DrawSplit,
  Lotto535DrawTenantFinancial,
} from "@megawin/game-lotto535/entities";
import type { Lotto535MainTuple, Lotto535Special, ISODateString } from "@megawin/game-lotto535/entities";
import { Lotto535BaseRepo } from "./lotto535-base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

/**
 * Valid status transitions.
 * Key = current status, Value = set of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [Lotto535DrawStatus.Scheduled]: new Set([Lotto535DrawStatus.SalesOpen, Lotto535DrawStatus.Void]),
  [Lotto535DrawStatus.SalesOpen]: new Set([Lotto535DrawStatus.SalesClosed, Lotto535DrawStatus.Void]),
  [Lotto535DrawStatus.SalesClosed]: new Set([Lotto535DrawStatus.Drawing, Lotto535DrawStatus.Void]),
  [Lotto535DrawStatus.Drawing]: new Set([Lotto535DrawStatus.Published, Lotto535DrawStatus.Void]),
  [Lotto535DrawStatus.Published]: new Set([Lotto535DrawStatus.Settling]),
  [Lotto535DrawStatus.Settling]: new Set([Lotto535DrawStatus.Settled]),
};

export class DrawRepository extends Lotto535BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  async createDraw(doc: Omit<Lotto535DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  async getDrawsByDate(drawDate: ISODateString): Promise<DrawEntity[]> {
    return await this.findMany(
      { drawDate },
      { sort: { drawNo: 1 } },
    );
  }

  async listDraws(
    filter: { status?: string; fromDate?: string; toDate?: string },
    page: number,
    size: number,
  ): Promise<DrawEntity[]> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.fromDate || filter.toDate) {
      const dateRange: Record<string, unknown> = {};
      if (filter.fromDate) dateRange.$gte = filter.fromDate;
      if (filter.toDate) dateRange.$lte = filter.toDate;
      query.drawDate = dateRange;
    }
    return await this.paging(query, page, size, { sort: { drawDate: -1, drawNo: -1 } });
  }

  /**
   * Atomic status transition with optimistic guard.
   * Returns updated entity or null if transition is invalid / draw not found.
   */
  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string,
    extraSet?: Record<string, unknown>,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return null;

    const $set: Record<string, unknown> = {
      status: toStatus,
      updatedAt: new Date(),
      ...extraSet,
    };

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set },
      { returnDocument: "after" },
    );
  }

  async publishResult(
    drawId: string,
    result: {
      winningMain: Lotto535MainTuple;
      winningSpecial: Lotto535Special;
      source: DrawResultSource;
      checksum?: string;
    },
    vietlottRef?: Lotto535DrawDoc["vietlottRef"],
  ): Promise<DrawEntity | null> {
    const now = new Date();
    const extra: Record<string, unknown> = {
      result: { ...result, publishedAt: now },
    };
    if (vietlottRef) extra.vietlottRef = vietlottRef;

    return await this.transitionStatus(
      drawId,
      Lotto535DrawStatus.Drawing,
      Lotto535DrawStatus.Published,
      extra,
    );
  }

  async updateJackpot(
    drawId: string,
    jackpot: {
      closingAmount: number;
      isSplitCycle?: boolean;
      split?: Lotto535DrawSplit;
    },
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "jackpot.closingAmount": jackpot.closingAmount,
      updatedAt: new Date(),
    };
    if (jackpot.isSplitCycle !== undefined) {
      $set["jackpot.isSplitCycle"] = jackpot.isSplitCycle;
    }
    if (jackpot.split) {
      $set["jackpot.split"] = jackpot.split;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  async updateFinancial(
    drawId: string,
    financial: {
      totalRevenue: number;
      totalFixedPrizes: number;
      totalAgentCommission: number;
      companyTake: number;
      jackpotContribution: number;
      tenantBreakdown?: Lotto535DrawTenantFinancial[];
    },
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } },
    );
  }

  async updateStats(
    drawId: string,
    stats: Lotto535DrawDoc["stats"],
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } },
    );
  }

  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: Lotto535DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }
}

export { VALID_TRANSITIONS };
