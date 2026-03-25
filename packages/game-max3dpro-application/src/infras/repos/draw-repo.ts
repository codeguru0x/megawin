import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils";
import { Max3dproCollections } from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import type { DrawEntity } from "@megawin/game-max3dpro/entities";
import type { FindOptions } from "mongodb";
import { DrawMapper } from "../mappers/draw-mapper";
import { BaseRepo } from "./base-repo";
import type {
  VoidInfo,
  DrawDocBase,
  DrawDocBaseFinancial,
  DrawDocBaseStats,
  DrawDocBaseVoidSummary,
  DrawSettleSummary,
} from "./types/draw.types";

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
 * Repository quản lý toàn bộ lifecycle của kỳ quay Max 3D Pro.
 *
 * Cung cấp state machine transitions (scheduled → salesOpen → ... → settled/void),
 * query methods, settle result writes, và cursor-based pagination cho player API.
 */
export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Max3dproCollections.Draws,
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
   * Publish hoặc cập nhật kết quả quay. Chấp nhận draw ở salesClosed hoặc published.
   *
   * - salesClosed → published (lần đầu publish)
   * - published → published (sửa kết quả trước khi settle)
   *
   * Caller truyền publishedAt sẵn trong result.
   * Ghi vietlottRef nếu được truyền vào.
   */
  async publishResult(
    drawId: string,
    result: Max3dproDrawResult & { publishedAt: Date },
    vietlottRef?: DrawDocBase["vietlottRef"],
  ): Promise<DrawEntity | null> {
    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result,
      updatedAt: new Date(),
    };
    if (vietlottRef) $set.vietlottRef = vietlottRef;

    return await this.findOneAndUpdate(
      {
        drawId,
        status: {
          $in: [DrawStatus.SalesClosed, DrawStatus.Published],
        },
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
    if (!allowed?.has(DrawStatus.Settled)) return null;

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
    voidInfo: VoidInfo,
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
  async voidComplete(
    drawId: string,
    voidSummary: DrawDocBaseVoidSummary,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Voiding];
    if (!allowed?.has(DrawStatus.Void)) return null;

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

  /** Lấy draw đã settle mới nhất. */
  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  /**
   * Lấy tất cả draws đang active trong khoảng lookbackDays ngày gần đây.
   *
   * @param lookbackDays - Số ngày nhìn lùi từ hôm nay (default: 2).
   */
  async getActiveDraws(
    allowStatuses: string[],
    lookbackDays = 7,
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
        // Cast sang DrawDocBase để đọc drawDate từ cursor draw.
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
}

export type { DrawEntity };
export { VALID_TRANSITIONS };
