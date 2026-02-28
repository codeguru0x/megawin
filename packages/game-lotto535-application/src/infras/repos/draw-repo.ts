import { Lotto535Collections } from "@megawin/game-lotto535/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import type { DrawDoc, DrawSplit } from "@megawin/game-lotto535/entities";
import type {
  MainTuple,
  Special,
  ISODateString,
} from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

/**
 * Valid status transitions.
 * Key = current status, Value = set of allowed next statuses.
 *
 * Flow: scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *          ↘ void      ↘ void      ↘ void       ↘ void
 */
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Void]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed, DrawStatus.Void]),
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

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy nhiều draws cùng lúc theo danh sách drawIds (1 query). */
  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany(
      { drawId: { $in: drawIds } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async getDrawsByDate(drawDate: ISODateString): Promise<DrawEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  async listDraws(
    filter: { status?: string; fromDate?: string; toDate?: string },
    page: number,
    size: number
  ): Promise<DrawEntity[]> {
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

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Atomic status transition cơ bản (không kèm extra data).
   */
  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      { $set: { status: toStatus, updatedAt: new Date() } },
      { returnDocument: "after" }
    );
  }

  /**
   * Open sales: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu lần đầu mở bán.
   */
  async openSales(
    drawId: string,
    fromStatus: string,
    salesOpenAt?: Date
  ): Promise<DrawEntity | null> {
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
   * Void draw: transition → void + ghi voidInfo embedded doc.
   */
  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: VoidInfo
  ): Promise<DrawEntity | null> {
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

  /**
   * Publish kết quả: salesClosed → published + ghi result + vietlottRef.
   */
  async publishResult(
    drawId: string,
    result: {
      winningMain: MainTuple;
      winningSpecial: Special;
    },
    vietlottRef?: DrawDoc["vietlottRef"]
  ): Promise<DrawEntity | null> {
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

  /**
   * Trigger settle: published → settling + ghi jackpot split info.
   */
  async triggerSettle(
    drawId: string,
    splitInfo?: {
      isSplitCycle: boolean;
      split: DrawSplit;
    }
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Published];
    if (!allowed?.has(DrawStatus.Settling)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.Settling,
      updatedAt: new Date(),
    };
    if (splitInfo) {
      $set["jackpot.isSplitCycle"] = splitInfo.isSplitCycle;
      $set["jackpot.split"] = splitInfo.split;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Published },
      { $set },
      { returnDocument: "after" }
    );
  }

  async updateJackpot(
    drawId: string,
    jackpot: {
      openingAmount: number;
      closingAmount: number;
      isSplitCycle?: boolean;
      split?: DrawSplit;
    }
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "jackpot.openingAmount": jackpot.openingAmount,
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
    financial: NonNullable<DrawDoc["financial"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { financial, updatedAt: new Date() } }
    );
  }

  async updateStats(
    drawId: string,
    stats: NonNullable<DrawDoc["stats"]>
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      { $set: { stats, updatedAt: new Date() } }
    );
  }

  async getLatestDraw(): Promise<DrawEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  async getLatestSettledDrawBefore(
    drawDate: string
  ): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } }
    );
  }

  async getCurrentDraw(allowStatuses?: string[]): Promise<DrawEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];

    const draw = await this.findOne(
      { status: { $in: statuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
    return draw;
  }

  async getActiveDraws(allowStatuses: string[]): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: allowStatuses } },
      { sort: { drawDate: 1, drawNo: 1 } }
    );
  }

  async updateVoidSummary(
    drawId: string,
    summary: NonNullable<DrawDoc["voidSummary"]>
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
    result: {
      winningMain: MainTuple;
      winningSpecial: Special;
      publishedAt: Date;
    },
    vietlottRef?: DrawDoc["vietlottRef"]
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
}

export { VALID_TRANSITIONS };
