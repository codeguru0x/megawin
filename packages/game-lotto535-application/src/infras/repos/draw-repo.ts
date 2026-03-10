import { Lotto535Collections, PrizeTier } from "@megawin/game-lotto535/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils/date";
import type {
  DrawDoc,
  DrawJackpotSnapshot,
  DrawFinancial,
  DrawStats,
  DrawSettleSummary,
} from "@megawin/game-lotto535/entities";
import type { MainTuple, Special, ISODateString } from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper, type DrawEntity } from "../mappers/draw-mapper";

/**
 * Valid status transitions.
 * Key = current status, Value = set of allowed next statuses.
 *
 * Flow: scheduled → salesOpen → salesClosed → published → settling → settled
 *          ↘ void        ↑↓         ↘ void       ↘ void
 */
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

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Lotto535Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc);
  }

  async createDraws(docs: Omit<DrawDoc, "_id">[]): Promise<number> {
    if (docs.length === 0) return 0;
    const result = await this.insertMany(docs as any[]);
    return result.insertedCount;
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy nhiều draws cùng lúc theo danh sách drawIds (1 query). */
  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany({ drawId: { $in: drawIds } }, { sort: { drawDate: 1, drawNo: 1 } });
  }

  async getDrawsByDate(drawDate: ISODateString): Promise<DrawEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
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
    return await this.paging(query, page, size, {
      sort: { drawDate: -1, drawNo: -1 },
    });
  }

  /**
   * Cursor-based pagination: dùng _id thay vì skip/offset.
   * Sort: drawDate DESC, drawNo DESC (mới nhất trước).
   * Trả về size+1 để biết có trang tiếp hay không.
   */
  async listDrawsCursor(
    filter: { status?: string; fromDate?: string; toDate?: string },
    cursor: string | undefined,
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
    if (cursor) {
      query.drawId = { ...((query.drawId as Record<string, unknown>) ?? {}), $lt: cursor };
    }
    return await this.findMany(query, {
      sort: { drawDate: -1, drawNo: -1 },
      limit: size + 1,
    });
  }

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Atomic status transition cơ bản (không kèm extra data).
   */
  async transitionStatus(
    drawId: string,
    fromStatus: string,
    toStatus: string,
  ): Promise<DrawEntity | null> {
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

  /**
   * Chuyển draw settling → settled + ghi jackpot snapshot.
   * Dùng dot notation để chỉ cập nhật các field cần thiết,
   * tránh overwrite jackpot.split đã set bởi triggerSettle().
   */
  async settleComplete(
    drawId: string,
    jackpot: Pick<DrawJackpotSnapshot, "openingAmount" | "closingAmount" | "isSplitCycle">,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];
    if (!allowed?.has(DrawStatus.Settled)) return null;

    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Settled,
      "jackpot.openingAmount": jackpot.openingAmount ?? 0,
      "jackpot.closingAmount": jackpot.closingAmount ?? 0,
      settledAt: now,
      updatedAt: now,
    };

    if (jackpot.isSplitCycle !== undefined) {
      $set["jackpot.isSplitCycle"] = jackpot.isSplitCycle;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Settling },
      { $set },
      { returnDocument: "after" },
    );
  }

  /**
   * Open sales: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu lần đầu mở bán.
   */
  async openSales(
    drawId: string,
    fromStatus: string,
    salesOpenAt?: Date,
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
      { returnDocument: "after" },
    );
  }

  /**
   * Close sales: salesOpen → salesClosed.
   * Stamp sales.closeAt thời điểm đóng bán thực tế.
   */
  async closeSales(drawId: string, salesCloseAt?: Date): Promise<DrawEntity | null> {
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

  /**
   * Void draw: transition → void + ghi voidInfo embedded doc.
   */
  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: VoidInfo,
  ): Promise<DrawEntity | null> {
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
  async voidComplete(
    drawId: string,
    voidSummary: NonNullable<DrawDoc["voidSummary"]>,
  ): Promise<DrawEntity | null> {
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

  /**
   * Publish kết quả: salesClosed → published + ghi result + vietlottRef.
   */
  async publishResult(
    drawId: string,
    result: {
      winningMain: MainTuple;
      winningSpecial: Special;
    },
    vietlottRef?: DrawDoc["vietlottRef"],
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
      { returnDocument: "after" },
    );
  }

  /**
   * Trigger settle: published → settling.
   * isSplitCycle được xác định tại thời điểm trigger nếu đã biết,
   * nhưng cũng có thể ghi lại ở FinalizeSettle (idempotent overwrite).
   */
  async triggerSettle(drawId: string, isSplitCycle?: boolean): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Published];
    if (!allowed?.has(DrawStatus.Settling)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.Settling,
      updatedAt: new Date(),
    };
    if (isSplitCycle !== undefined) {
      $set["jackpot.isSplitCycle"] = isSplitCycle;
    }

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Published },
      { $set },
      { returnDocument: "after" },
    );
  }

  async updateSettleResult(
    drawId: string,
    financial: DrawFinancial,
    stats: DrawStats,
    settleSummary?: DrawSettleSummary,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      financial,
      stats,
      updatedAt: new Date(),
    };
    if (settleSummary !== undefined) {
      $set.settleSummary = settleSummary;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Cộng thêm jackpot prize vào stats.totalPayoutAmount khi có JP winner.
   * Gọi bởi PatchJackpotPrize (step 4a) SAU khi patch entries.
   *
   * KHÔNG tự idempotent ($inc cộng dồn) — caller phải đảm bảo chỉ gọi
   * khi patchJackpotPrize thực sự patch (modifiedCount > 0).
   */
  async incrementTotalPayout(drawId: string, additionalPayout: number): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $inc: {
          "stats.totalPayoutAmount": additionalPayout,
        },
        $set: {
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Cập nhật jackpot tier prizeAmount trong settleSummary sau khi PatchJackpotPrize chạy.
   *
   * Dùng dot notation để chỉ cập nhật 1 phần tử mảng (tier = "jackpot").
   * Idempotent: set cùng giá trị nhiều lần cho kết quả giống nhau.
   */
  async patchSettleSummaryJackpotPrize(
    drawId: string,
    jackpotPrizeAmount: number,
  ): Promise<boolean> {
    return await this.updateOne(
      {
        drawId,
        "settleSummary.tiers.tier": PrizeTier.Jackpot,
      },
      {
        $set: {
          "settleSummary.tiers.$.prizeAmount": jackpotPrizeAmount,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Danh sách kỳ quay đã settle — cursor-based pagination, xem ngược về quá khứ.
   * Chỉ trả draws có kết quả (status = "settled", result tồn tại).
   * Sort: drawId desc (mới nhất trước).
   *
   * drawId format "YYYY-MM-DD.NNN" → lexicographic order = chronological order.
   *
   * `from` là upper bound (ngưỡng trên): trả về tất cả draws CŨ HƠN HOẶC BẰNG ngày from,
   * đi ngược về quá khứ. Ví dụ: from = "2026-03-07" → trả 2026-03-07.003, ..., 2026-03-06.xxx, ...
   *
   * Cursor pagination:
   *   - Trang đầu (không có cursor): filter drawId <= "${from}.999"
   *     ".999" là safe upper bound cho mọi draw trong ngày (Lotto535 max 003, ".999" > ".003").
   *   - Trang tiếp theo (có cursor): filter drawId < cursor.
   *     cursor luôn <= from.999 (vì đến từ trang trước đã bị constrain) → from không cần thiết.
   *
   * Index dùng: { status: 1, drawId: -1 } → idx_status_drawId_desc
   */
  async listSettledDraws(filter: {
    from: string;
    size: number;
    cursor?: string;
  }): Promise<DrawEntity[]> {
    const query: Record<string, unknown> = {
      status: DrawStatus.Settled,
      result: { $exists: true },
    };

    if (!filter.cursor) {
      // Trang đầu: bắt đầu từ ngày from đi về quá khứ
      query.drawId = { $lte: `${filter.from}.999` };
    } else {
      // Paginate: cursor encode đầy đủ vị trí (drawDate + drawNo)
      query.drawId = { $lt: filter.cursor };
    }

    return await this.findMany(query, {
      sort: { drawId: -1 },
      limit: filter.size,
    });
  }

  async getLatestDraw(): Promise<DrawEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  async getLatestSettledDrawBefore(drawDate: string): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  async getNextScheduledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        status: {
          $in: [DrawStatus.Scheduled, DrawStatus.SalesOpen, DrawStatus.SalesClosed],
        },
      },
      { sort: { drawTime: 1 } },
    );
  }

  async getSettledDrawsWithJackpot(page: number, size: number): Promise<DrawEntity[]> {
    return await this.findMany(
      {
        status: DrawStatus.Settled,
        "jackpot.closingAmount": { $exists: true },
      },
      {
        sort: { drawTime: -1 },
        skip: (page - 1) * size,
        limit: size,
      },
    );
  }

  async getCurrentDraw(allowStatuses?: string[]): Promise<DrawEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];

    const draw = await this.findOne(
      { status: { $in: statuses } },
      { sort: { drawDate: 1, drawNo: 1 } },
    );
    return draw;
  }

  /**
   * Lấy các draws đang active theo danh sách statuses.
   *
   * Thêm `drawDate >= today - lookbackDays` để tận dụng compound index
   * { status: 1, drawDate: 1 } — tránh full scan collection khi có hàng trăm nghìn draws.
   *
   * Active draws luôn nằm trong khoảng vài ngày gần đây (game quay 2 lần/ngày),
   * nên lookback 7 ngày là đủ dư.
   *
   * Recommended index: { status: 1, drawDate: 1 }
   */
  async getActiveDraws(allowStatuses: string[], lookbackDays = 7): Promise<DrawEntity[]> {
    const fromDateStr = formatVNDate(subDays(new Date(), lookbackDays));

    return await this.findMany(
      {
        status: { $in: allowStatuses },
        drawDate: { $gte: fromDateStr },
      },
      { sort: { drawDate: 1, drawNo: 1 } },
    );
  }

  /**
   * Tìm draw tiếp theo (chưa settle) sau drawId cụ thể.
   *
   * drawId format "YYYY-MM-DD.NNN" → lexicographic order = chronological order,
   * nên dùng drawId comparison trực tiếp thay vì fetch drawTime trước.
   * Chỉ cần 1 query duy nhất. Recommended index: { drawId: 1, status: 1 }
   * → single range scan từ afterDrawId, check status match, limit 1 dừng ngay.
   */
  async findNextPendingDraw(afterDrawId: string): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        drawId: { $gt: afterDrawId },
        status: {
          $in: [
            DrawStatus.Scheduled,
            DrawStatus.SalesOpen,
            DrawStatus.SalesClosed,
            DrawStatus.Published,
            DrawStatus.Settling,
          ],
        },
      },
      { sort: { drawId: 1 } },
    );
  }

  async updateVoidSummary(
    drawId: string,
    summary: NonNullable<DrawDoc["voidSummary"]>,
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $set: {
          voidSummary: summary,
          updatedAt: new Date(),
        },
      },
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
    result: {
      winningMain: MainTuple;
      winningSpecial: Special;
      publishedAt: Date;
    },
    vietlottRef?: DrawDoc["vietlottRef"],
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.updateOne({ drawId, status: DrawStatus.Published }, { $set });
  }
}

export { VALID_TRANSITIONS };
