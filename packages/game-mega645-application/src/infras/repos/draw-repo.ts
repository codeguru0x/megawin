/**
 * Mega 6/45 – Draw Repository
 *
 * Collection: mega645_draws
 *
 * Quản lý toàn bộ lifecycle kỳ quay Mega 6/45:
 *   scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *      ↘ void      ↘ void      ↘ void       ↘ void
 *
 * Khác biệt so với Lotto 5/35:
 *   - Kết quả: chỉ có 6 số chính (winningNumbers: string[], thứ tự quay gốc), KHÔNG có winningSpecial
 *   - Single jackpot (openingAmount / closingAmount)
 *   - Financial: jackpotContribution (single)
 */

import { Mega645Collections, PrizeTier } from "@megawin/game-mega645/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils";
import type { FindOptions } from "mongodb";
import type {
  DrawDoc,
  DrawJackpotSnapshot,
  DrawFinancial,
  DrawStats,
  DrawSettleSummary,
  DrawResult,
  DrawVoidSummary,
} from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper } from "../mappers/draw-mapper";
import type { DrawEntity } from "@megawin/game-mega645/entities";

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
      collName: Mega645Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  /** Batch insert nhiều kỳ quay (1 round trip). Trả về số document đã insert. */
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

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Chuyển draw settling → settled + ghi jackpot snapshot.
   * Dùng dot notation để chỉ cập nhật các field cần thiết.
   */
  async settleComplete(
    drawId: string,
    jackpot: Pick<DrawJackpotSnapshot, "openingAmount" | "closingAmount">,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];
    if (!allowed?.has(DrawStatus.Settled)) return null;

    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Settled,
      "jackpot.openingAmount": jackpot.openingAmount,
      "jackpot.closingAmount": jackpot.closingAmount,
      settledAt: now,
      updatedAt: now,
    };

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
  async voidComplete(drawId: string, voidSummary: DrawVoidSummary): Promise<DrawEntity | null> {
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
   * Publish hoặc cập nhật kết quả quay. Chấp nhận draw ở salesClosed hoặc published.
   *
   * Mega 6/45: chỉ có winningNumbers (6 số chính, thứ tự quay gốc), KHÔNG có winningSpecial.
   * Caller truyền đầy đủ result (kể cả publishedAt) — method không tự tạo timestamp.
   */
  async publishResult(
    drawId: string,
    result: DrawResult,
    vietlottRef?: DrawDoc["vietlottRef"],
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

  /**
   * Trigger settle: published → settling.
   * Mega 6/45 không có split info — chỉ chuyển status.
   */
  async triggerSettle(drawId: string): Promise<DrawEntity | null> {
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
   * Ghi financial + stats + settleSummary vào DrawDoc sau khi settle hoàn tất.
   *
   * Overwrite toàn bộ financial và stats (set lần đầu, không partial update).
   * settleSummary là optional — chỉ ghi khi được truyền vào.
   *
   * Tất cả fields ghi trong 1 lần `$set` duy nhất — tối thiểu DB call.
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
    if (settleSummary !== undefined) {
      $set.settleSummary = settleSummary;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Cập nhật jackpot tier prizeAmount trong settleSummary sau khi FinalizeSettle tính pool.
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
   * `from` là upper bound: trả về tất cả draws CŨ HƠN HOẶC BẰNG ngày from,
   * đi ngược về quá khứ.
   *
   * Cursor pagination:
   *   - Trang đầu (không có cursor): filter drawId <= "${from}.999"
   *   - Trang tiếp theo (có cursor): filter drawId < cursor.
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
      // Trang đầu: bắt đầu từ ngày from đi về quá khứ.
      // ".999" là safe upper bound (Mega645 chỉ quay 1 kỳ/ngày, ".001" < ".999").
      query.drawId = { $lte: `${filter.from}.999` };
    } else {
      // Paginate: cursor encode đầy đủ vị trí
      query.drawId = { $lt: filter.cursor };
    }

    return await this.findMany(query, {
      sort: { drawId: -1 },
      limit: filter.size,
    });
  }

  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
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

  /**
   * Lấy draws đã settled trong 1 Jackpot Cycle theo khoảng drawId.
   * Dùng cho bảng "Lịch sử Jackpot" lọc theo vòng cụ thể.
   *
   * Lọc: drawId >= startDrawId (và <= endDrawId nếu cycle đã đóng).
   * Sort: drawId giảm dần (draw mới nhất lên đầu).
   * Index: { status: 1, drawId: 1 }
   */
  async getSettledDrawsInCycle(
    startDrawId: string,
    endDrawId: string | null,
    page: number,
    size: number,
  ): Promise<{ draws: DrawEntity[]; total: number }> {
    const filter: Record<string, unknown> = {
      status: DrawStatus.Settled,
      "jackpot.closingAmount": { $exists: true },
      drawId: endDrawId ? { $gte: startDrawId, $lte: endDrawId } : { $gte: startDrawId },
    };

    const [draws, total] = await Promise.all([
      this.findMany(filter, {
        sort: { drawId: -1 },
        skip: (page - 1) * size,
        limit: size,
      }),
      this.count(filter),
    ]);

    return { draws, total };
  }

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
   * Set stats.totalPayoutAmount bằng giá trị tuyệt đối (re-aggregated từ entries).
   *
   * Thay thế incrementTotalPayout ($inc) — **idempotent**: chạy lại bao nhiêu lần
   * cũng cho kết quả đúng vì giá trị được tính lại từ source of truth (entries).
   */
  async setTotalPayout(drawId: string, totalPayout: number): Promise<void> {
    await this.updateOne({ drawId }, { $set: { "stats.totalPayoutAmount": totalPayout } as any });
  }

  /**
   * @deprecated Dùng setTotalPayout thay thế — $set idempotent, không cần guard.
   *
   * Tăng stats.totalPayoutAmount thêm amount sau khi patch Jackpot prize vào entries.
   *
   * Dùng $inc — KHÔNG idempotent, phải guard bởi caller:
   * chỉ gọi khi patchJackpotPrize trả về modifiedCount > 0
   * (entries chưa được patch → $inc chạy đúng 1 lần).
   */
  async incrementTotalPayout(drawId: string, amount: number): Promise<void> {
    await this.updateOne({ drawId }, { $inc: { "stats.totalPayoutAmount": amount } as any });
  }

  /**
   * Tìm draw tiếp theo (sau drawId hiện tại) đang ở trạng thái chờ xử lý.
   * Dùng bởi FinalizeSettle để lấy startDrawId cho jackpot cycle mới.
   *
   * Index đề xuất: `{ drawId: 1, status: 1 }` — range scan từ afterDrawId, limit 1.
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
}

export { VALID_TRANSITIONS };
