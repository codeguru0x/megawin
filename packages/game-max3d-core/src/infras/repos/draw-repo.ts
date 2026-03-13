import { DrawStatus } from "@megawin/game-core/entities";
import type { BaseEntity } from "@megawin/data/mongo";
import type { MongoMapper } from "@megawin/data/mongo";
import type { Document } from "mongodb";
import { BaseRepo } from "./base-repo";

const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Voiding]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed]),
  [DrawStatus.SalesClosed]: new Set([
    DrawStatus.SalesOpen,
    DrawStatus.Published,
    DrawStatus.Voiding,
  ]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Voiding]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
  [DrawStatus.Voiding]: new Set([DrawStatus.Void]),
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
  financial?: DrawDocBaseFinancial;
  stats?: DrawDocBaseStats;
  voidInfo?: DrawDocBaseVoidInfo;
  voidSummary?: DrawDocBaseVoidSummary;
  vietlottRef?: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface DrawDocBaseFinancial {
  totalRevenue: number;
  totalFixedPrizes: number;
  totalAgentCommission: number;
  /** = profit cho game không có Jackpot (Max3D, Max3D Pro). */
  companyTake: number;
}

export interface DrawDocBaseStats {
  ticketEntryCount: number;
  totalLineCount: number;
  totalSalesAmount: number;
  totalPayoutAmount: number;
}

/**
 * Chi tiết giải thưởng 1 hạng trong kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials khi settle hoàn tất.
 * Dùng bởi GetDrawResultPlayerUseCase để trả bảng giải thưởng — 1 DB call.
 */
export interface DrawSettleSummaryTier {
  /** Hạng giải: "special", "first", "second", "third", ... (giá trị từ PrizeTier của game). */
  tier: string;
  /** Số lượt trúng hạng này (tổng hit count từ tất cả entries). */
  winnerCount: number;
  /**
   * Tổng tiền thưởng hạng này (VND).
   * = Σ(entry.payout.tiers[tier].amount) aggregate từ entries.
   */
  prizeAmount: number;
}

/**
 * Tổng kết bảng giải thưởng kỳ quay — denormalized cho API player.
 *
 * Ghi vào DrawDoc.settleSummary bởi CalculateFinancials (step 4 settle pipeline).
 * Tất cả tiers có winnerCount > 0 được ghi; tiers không có winner được bỏ qua
 * hoặc ghi với winnerCount = 0 tùy game.
 */
export interface DrawSettleSummary {
  /**
   * Bảng giải thưởng theo từng hạng.
   * Tất cả tiers luôn có mặt (kể cả winnerCount = 0).
   */
  tiers: DrawSettleSummaryTier[];
}

export interface DrawDocBaseVoidInfo {
  reason: string;
  voidedBy?: string;
  voidedAt: Date;
}

export interface DrawDocBaseVoidSummary {
  totalVoidedEntries: number;
  totalOriginalAmount: number;
  totalRefundAmount: number;
  totalRefundDispatched?: number;
  completedAt?: Date;
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
    return await this.findMany({ drawId: { $in: drawIds } }, { sort: { drawDate: 1, drawNo: 1 } });
  }

  async getDrawsByDate(drawDate: string): Promise<TEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  async listDraws(
    filter: { status?: string; fromDate?: string; toDate?: string },
    page: number,
    size: number,
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
    toStatus: string,
  ): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(toStatus)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      {
        $set: {
          status: toStatus,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  }

  /** Chuyển draw settling → settled + stamp settledAt. Atomic, idempotent. */
  async settleComplete(drawId: string): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];
    if (!allowed?.has(DrawStatus.Settled)) return null;

    const now = new Date();
    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Settling },
      {
        $set: {
          status: DrawStatus.Settled,
          settledAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  }

  async openSales(drawId: string, fromStatus: string, salesOpenAt?: Date): Promise<TEntity | null> {
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
      { returnDocument: "after" },
    );
  }

  /**
   * Close sales: salesOpen → salesClosed.
   * Stamp sales.closeAt thời điểm đóng bán thực tế.
   */
  async closeSales(drawId: string, salesCloseAt?: Date): Promise<TEntity | null> {
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
      { returnDocument: "after" },
    );
  }

  async voidDraw(drawId: string, fromStatus: string, voidInfo: VoidInfo): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.Voiding)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: fromStatus },
      {
        $set: {
          status: DrawStatus.Voiding,
          voidInfo,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
  }

  /** Hoàn tất void: voiding → void + stamp voidedAt + ghi voidSummary. Atomic, idempotent. */
  async voidComplete(drawId: string, voidSummary: DrawDocBaseVoidSummary): Promise<TEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Voiding];
    if (!allowed?.has(DrawStatus.Void)) return null;

    const now = new Date();
    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Voiding },
      {
        $set: {
          status: DrawStatus.Void,
          voidSummary,
          voidedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  }

  async publishResult(
    drawId: string,
    result: TDrawResult,
    vietlottRef?: DrawDocBase["vietlottRef"],
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
      { returnDocument: "after" },
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
      { returnDocument: "after" },
    );
  }

  /**
   * Ghi financial, stats và settleSummary vào DrawDoc sau khi settle hoàn tất.
   *
   * Overwrite toàn bộ financial, stats, settleSummary (set lần đầu).
   * settleSummary optional — chỉ ghi khi được truyền vào.
   * Tất cả fields ghi trong 1 lần `$set` — tối thiểu DB call.
   */
  async updateSettleResult(
    drawId: string,
    financial: DrawDocBaseFinancial,
    stats: DrawDocBaseStats,
    settleSummary?: DrawSettleSummary,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      financial,
      stats,
      updatedAt: new Date(),
    };
    if (settleSummary) {
      $set.settleSummary = settleSummary;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Lấy danh sách kỳ đã settled cho player API — cursor-based pagination.
   *
   * @param filter.from - Upper bound drawDate (YYYY-MM-DD), exclusive (< from).
   *                      Khác với ý nghĩa thông thường — đây là "trước ngày from".
   * @param filter.size - Số lượng kỳ cần lấy.
   * @param filter.cursor - Cursor từ response trước: drawId của kỳ cuối.
   */
  async listSettledDraws(filter: {
    from: string;
    size: number;
    cursor?: string;
  }): Promise<TEntity[]> {
    const { from, size, cursor } = filter;
    const query: Record<string, unknown> = {
      status: DrawStatus.Settled,
      drawDate: { $lt: from },
    };
    if (cursor) {
      const cursorDraw = await this.findOne({ drawId: cursor });
      if (cursorDraw) {
        const doc = cursorDraw as unknown as DrawDocBase;
        query.drawDate = { $lte: doc.drawDate };
        query.$or = [
          { drawDate: { $lt: doc.drawDate } },
          { drawDate: doc.drawDate, drawId: { $gt: cursor } },
        ];
      }
    }
    return await this.findMany(query, { sort: { drawDate: -1, drawId: -1 }, limit: size });
  }

  /**
   * Cập nhật prizeAmount cho các tiers trong settleSummary — dùng arrayFilters.
   *
   * Dùng sau khi biết chính xác số tiền thưởng (ví dụ sau dispatch hoặc sau finalize).
   * Idempotent — ghi đè nếu chạy lại.
   */
  async patchSettleSummaryTiers(
    drawId: string,
    patches: Array<{ tier: string; prizeAmount: number; winnerCount?: number }>,
  ): Promise<void> {
    if (patches.length === 0) return;

    const $set: Record<string, unknown> = {};
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      if (!patch) continue;
      $set[`settleSummary.tiers.$[tier${i}].prizeAmount`] = patch.prizeAmount;
      if (patch.winnerCount !== undefined) {
        $set[`settleSummary.tiers.$[tier${i}].winnerCount`] = patch.winnerCount;
      }
    }

    const arrayFilters = patches.map((p, i) => ({
      [`tier${i}.tier`]: p.tier,
    }));

    await this.updateOne({ drawId }, { $set }, { arrayFilters });
  }

  async getLatestDraw(): Promise<TEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  async getLatestSettledDraw(): Promise<TEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  async getLatestSettledDrawBefore(drawDate: string): Promise<TEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  async getCurrentDraw(allowStatuses?: string[]): Promise<TEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];
    return await this.findOne({ status: { $in: statuses } }, { sort: { drawDate: 1, drawNo: 1 } });
  }

  async getActiveDraws(allowStatuses: string[]): Promise<TEntity[]> {
    return await this.findMany(
      { status: { $in: allowStatuses } },
      { sort: { drawDate: 1, drawNo: 1 } },
    );
  }

  async updateSchedule(
    drawId: string,
    sales: { openAt: Date; closeAt: Date; drawTime?: Date },
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
    vietlottRef?: DrawDocBase["vietlottRef"],
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.updateOne({ drawId, status: DrawStatus.Published }, { $set });
  }

  async countByStatus(status: string): Promise<number> {
    return await this.count({ status });
  }

  async updateVoidInfo(drawId: string, voidInfo: DrawDocBaseVoidInfo): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $set: {
          voidInfo,
          updatedAt: new Date(),
        },
      },
    );
  }
}

export { VALID_TRANSITIONS };
