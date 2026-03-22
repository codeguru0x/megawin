import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils/date";
import { Max3dCollections } from "@megawin/game-max3d/entities";
import type {
  DrawVietlottRef,
  DrawVoidInfo,
  DrawVoidSummary,
  Max3dDrawResult,
  DrawStats,
} from "@megawin/game-max3d/entities";
import type { DrawEntity, DrawSettleSummary } from "@megawin/game-max3d/entities";
import type { FindOptions } from "mongodb";
import { DrawMapper } from "../mappers/draw-mapper";
import { BaseRepo } from "./base-repo";
import type { DrawFinancial } from "@megawin/game-max3d/entities";

/** Map các chuyển đổi trạng thái hợp lệ trong draw lifecycle. */
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

/**
 * Repository quản lý toàn bộ lifecycle của kỳ quay Max 3D.
 *
 * Cung cấp state machine transitions (scheduled → salesOpen → ... → settled/void),
 * query methods, settle result writes, và cursor-based pagination cho player API.
 */
export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Max3dCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  /** Tạo kỳ quay mới. Trả về drawId vừa insert. */
  async createDraw(doc: Record<string, unknown>): Promise<string> {
    return await this.insertOne(doc as any);
  }

  /** Lấy draw theo drawId. Trả về null nếu không tìm thấy. */
  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy nhiều draws theo danh sách drawId, sort by drawDate asc. */
  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    if (drawIds.length === 0) return [];
    return await this.findMany({ drawId: { $in: drawIds } }, { sort: { drawDate: 1, drawNo: 1 } });
  }

  /** Lấy tất cả draws trong 1 ngày, sort by drawNo asc. */
  async getDrawsByDate(drawDate: string): Promise<DrawEntity[]> {
    return await this.findMany({ drawDate }, { sort: { drawNo: 1 } });
  }

  /**
   * Liệt kê draws với filter status + date range, paging offset-based.
   * Sort: drawDate desc, drawNo desc.
   */
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
   * Mở bán: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu được truyền vào.
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
      {
        drawId,
        status: fromStatus,
      },
      { $set },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Đóng bán: salesOpen → salesClosed.
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
      {
        drawId,
        status: DrawStatus.SalesOpen,
      },
      { $set },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Công bố kết quả: salesClosed → published.
   * Ghi result + vietlottRef (nếu có) + publishedAt.
   */
  async publishResult(
    drawId: string,
    result: Max3dDrawResult,
    vietlottRef?: DrawVietlottRef,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.SalesClosed];
    if (!allowed?.has(DrawStatus.Published)) return null;

    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result: { ...result, publishedAt: now },
      updatedAt: now,
    };

    if (vietlottRef) {
      $set.vietlottRef = vietlottRef;
    }

    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.SalesClosed,
      },
      { $set },
      {
        returnDocument: "after",
      },
    );
  }

  /** Kích hoạt settle: published → settling. */
  async triggerSettle(drawId: string): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Published];
    if (!allowed?.has(DrawStatus.Settling)) return null;

    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Published,
      },
      {
        $set: {
          status: DrawStatus.Settling,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Hoàn tất settle: settling → settled + stamp settledAt.
   * Atomic, idempotent.
   */
  async settleComplete(drawId: string): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];

    if (!allowed?.has(DrawStatus.Settled)) {
      return null;
    }

    const now = new Date();
    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Settling,
      },
      {
        $set: {
          status: DrawStatus.Settled,
          settledAt: now,
          updatedAt: now,
        },
      },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Bắt đầu void: scheduled/salesClosed/published → voiding.
   * Ghi voidInfo (lý do, người thực hiện).
   */
  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: DrawVoidInfo,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.Voiding)) return null;

    return await this.findOneAndUpdate(
      {
        drawId,
        status: fromStatus,
      },
      {
        $set: {
          status: DrawStatus.Voiding,
          voidInfo,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Hoàn tất void: voiding → void + stamp voidedAt + ghi voidSummary.
   * Atomic, idempotent.
   */
  async voidComplete(drawId: string, voidSummary: DrawVoidSummary): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Voiding];

    if (!allowed?.has(DrawStatus.Void)) {
      return null;
    }

    const now = new Date();
    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Voiding,
      },
      {
        $set: {
          status: DrawStatus.Void,
          voidSummary,
          voidedAt: now,
          updatedAt: now,
        },
      },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Ghi financial, stats và settleSummary vào DrawDoc sau khi settle hoàn tất.
   *
   * Overwrite toàn bộ financial, stats, settleSummary (set lần đầu).
   * settleSummary optional — chỉ ghi khi được truyền vào.
   * Tất cả fields ghi trong 1 lần `$set` — tối thiểu DB call.
   * Idempotent — chạy lại overwrite toàn bộ.
   */
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

    if (settleSummary) {
      $set.settleSummary = settleSummary;
    }
    return await this.updateOne({ drawId }, { $set });
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

  /** Lấy draw mới nhất (theo drawDate desc, drawNo desc). */
  async getLatestDraw(): Promise<DrawEntity | null> {
    return await this.findOne({}, { sort: { drawDate: -1, drawNo: -1 } });
  }

  /** Lấy draw đã settle mới nhất. */
  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  /** Lấy draw đã settle mới nhất trước hoặc bằng drawDate cho trước. */
  async getLatestSettledDrawBefore(drawDate: string): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        status: DrawStatus.Settled,
        drawDate: { $lte: drawDate },
      },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  /**
   * Lấy draw hiện tại (đang mở bán hoặc theo status tuỳ chỉnh).
   * Sort: drawDate asc, drawNo asc — ưu tiên kỳ gần nhất.
   */
  async getCurrentDraw(allowStatuses?: string[]): Promise<DrawEntity | null> {
    const statuses = allowStatuses ?? [DrawStatus.SalesOpen];
    return await this.findOne({ status: { $in: statuses } }, { sort: { drawDate: 1, drawNo: 1 } });
  }

  /**
   * Lấy tất cả draws đang active trong khoảng lookbackDays ngày gần đây.
   *
   * @param lookbackDays - Số ngày nhìn lùi từ hôm nay (default: 2).
   */
  async getActiveDraws(
    allowStatuses: string[],
    lookbackDays = 2,
    options?: FindOptions,
  ): Promise<DrawEntity[]> {
    const fromDateStr = formatVNDate(subDays(new Date(), lookbackDays));
    return await this.findMany(
      {
        status: { $in: allowStatuses },
        drawDate: { $gte: fromDateStr },
      },
      { sort: { drawDate: 1, drawNo: 1 }, ...options },
    );
  }

  /**
   * Cập nhật lịch bán: openAt, closeAt, drawTime (optional).
   * Idempotent — chạy lại overwrite.
   */
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

  /**
   * Cập nhật result sau khi publish (dùng khi cần sửa lại result đã publish).
   * Chỉ update nếu draw đang ở status published.
   */
  async updateResult(
    drawId: string,
    result: Max3dDrawResult & { publishedAt: Date },
    vietlottRef?: DrawVietlottRef,
  ): Promise<boolean> {
    const $set: Record<string, unknown> = {
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.updateOne(
      {
        drawId,
        status: DrawStatus.Published,
      },
      { $set },
    );
  }

  /** Đếm số draws theo status. */
  async countByStatus(status: string): Promise<number> {
    return await this.count({ status });
  }

  /**
   * Cập nhật voidInfo trên draw (partial update — không đổi status).
   * Idempotent.
   */
  async updateVoidInfo(drawId: string, voidInfo: DrawVoidInfo): Promise<boolean> {
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

  /**
   * Lấy danh sách kỳ đã settled cho player API — cursor-based pagination.
   *
   * @param filter.from - Upper bound drawDate (YYYY-MM-DD), exclusive (< from).
   *                      Đây là "trước ngày from" — khác với ý nghĩa thông thường.
   * @param filter.size - Số lượng kỳ cần lấy.
   * @param filter.cursor - Cursor từ response trước: drawId của kỳ cuối.
   */
  async listSettledDraws(filter: {
    from: string;
    size: number;
    cursor?: string;
  }): Promise<DrawEntity[]> {
    const { from, size, cursor } = filter;

    const query: Record<string, unknown> = {
      status: DrawStatus.Settled,
      drawDate: { $lt: from },
    };

    if (cursor) {
      const cursorDraw = await this.findOne({ drawId: cursor });
      if (cursorDraw) {
        // Keyset pagination: lấy draws có drawDate trước cursor, hoặc cùng ngày nhưng drawId lớn hơn.
        // DrawEntity đã có drawDate — không cần cast sang type khác.
        query.$or = [
          { drawDate: { $lt: cursorDraw.drawDate } },
          {
            drawDate: cursorDraw.drawDate,
            drawId: { $gt: cursor },
          },
        ];
        query.drawDate = { $lte: cursorDraw.drawDate };
      }
    }

    return await this.findMany(query, {
      sort: {
        drawDate: -1,
        drawId: -1,
      },
      limit: size,
    });
  }
}

export type { DrawEntity };
