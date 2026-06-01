/**
 * Bingo 18 – Draw Repository
 *
 * Collection: bingo18_draws
 *
 * Quản lý trạng thái kỳ mở thưởng Bingo 18.
 * Tất cả status transitions phải đi qua repo methods để đảm bảo atomic + type-safe.
 *
 * RULE: Use case KHÔNG BAO GIỜ dùng dot notation hay biết cấu trúc MongoDB.
 *       Mọi field update đi qua typed method ở đây.
 *       Khi entity đổi field → chỉ sửa repo, compiler sẽ bắt lỗi ở use case.
 */

import { Bingo18Collections } from "@megawin/game-bingo18/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils";
import type { FindOptions } from "mongodb";
import type {
  DrawDoc,
  DrawFinancial,
  DrawStats,
  DrawSettleSummary,
  DrawVoidSummary,
  DrawVoidInfo,
  DrawResult,
  DrawVietlottRef,
} from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper } from "../mappers/draw-mapper";
import type { DrawEntity } from "@megawin/game-bingo18/entities";

/**
 * Valid status transitions cho Bingo 18 Draw.
 *
 * Flow chính: scheduled → salesOpen → salesClosed → published → settling → settled
 *               ↘ void          ↑↓         ↘ void       ↘ void
 *
 * Resettle path: settled → published (chỉ qua republishResultAfterSettled).
 *   Cho phép sửa kết quả sau settle, sau đó nhấn "Kết sổ lại" để chạy resettle.
 *   KHÔNG cho phép settled → voiding (đã kết sổ là chốt, không thể huỷ).
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
  [DrawStatus.Settled]: new Set([DrawStatus.Published]),
  [DrawStatus.Voiding]: new Set([DrawStatus.Void]),
};

// ─────────────────────────────────────────────
// Typed extra-set payloads cho transition
// ─────────────────────────────────────────────

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  // ─── CRUD ───

  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
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

  async getActiveDraws(
    allowStatuses: string[],
    lookbackDays?: number,
    options?: FindOptions,
  ): Promise<DrawEntity[]> {
    const query: Record<string, unknown> = {
      status: { $in: allowStatuses },
    };
    // Khi lookbackDays được cung cấp, filter theo ngày để giới hạn số lượng kết quả
    // (dùng cho settled/void draws có thể rất nhiều). Active draws không filter ngày
    // để không bỏ sót kỳ đang vận hành bị trễ qua ngày.
    if (lookbackDays !== undefined) {
      const fromDateStr = formatVNDate(subDays(new Date(), lookbackDays));
      query.drawDate = { $gte: fromDateStr };
    }
    return await this.findMany(query, { sort: { drawDate: 1, drawNo: 1 }, ...options });
  }

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Trigger settle: published → settling (atomic, idempotent).
   * Trả về entity sau update hoặc null nếu draw không ở trạng thái published.
   */
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

  /** Chuyển draw settling → settled + stamp settledAt. Atomic, idempotent.
   *
   * `settledAt` ở đây là **high-water mark** — overwrite mỗi lần settle thành công
   * (cả lần đầu lẫn resettle). Dùng để phân biệt "Settle lần đầu" vs "Resettle"
   * tại API trigger-resettle và UI logic. KHÔNG bị $unset khi republish.
   */
  async settleComplete(drawId: string): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];

    if (!allowed?.has(DrawStatus.Settled)) {
      return null;
    }

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
   * Void draw: transition → voiding + ghi voidInfo embedded doc.
   */
  async voidDraw(
    drawId: string,
    fromStatus: string,
    voidInfo: DrawVoidInfo,
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

    if (!allowed?.has(DrawStatus.Void)) {
      return null;
    }

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
   * Publish hoặc cập nhật kết quả quay.
   *
   * Chấp nhận draw ở salesClosed (lần đầu publish) hoặc published (sửa lại result).
   * Cả hai trường hợp đều set `status: published` + ghi `result` + optional `vietlottRef`.
   * Atomic — trả về null nếu draw không ở trạng thái hợp lệ.
   */
  async publishResult(
    drawId: string,
    result: DrawResult,
    vietlottRef?: DrawVietlottRef,
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
        status: { $in: [DrawStatus.SalesClosed, DrawStatus.Published] },
      },
      { $set },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Re-publish kết quả khi draw đã settled — bước đầu của workflow Resettle.
   *
   * Transition `settled → published` (atomic, idempotent).
   * KHÔNG cho phép sửa qua `publishResult` thông thường vì status filter ở đó
   * không bao gồm `settled`.
   *
   * Side effects:
   * - Set: `status = published`, `result = newResult`, `updatedAt`.
   * - $unset: `financial`, `stats`, `settleSummary` — đây là dữ liệu của lần settle
   *   cũ, sau khi resettle sẽ được tính lại.
   *
   * KHÔNG đụng `vietlottRef` — sửa metadata tham chiếu thuộc endpoint riêng
   * `updateVietlottRef`. Tách ra để tránh kéo theo resettle khi staff chỉ
   * cần sửa drawPeriod/drawDate.
   *
   * KHÔNG $unset `settledAt` — đây là high-water mark lịch sử settle, dùng để biết
   * draw đã từng settle (phân biệt với Settle lần đầu).
   */
  async republishResultAfterSettled(
    drawId: string,
    result: DrawResult,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settled];
    if (!allowed?.has(DrawStatus.Published)) {
      return null;
    }

    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Settled,
      },
      {
        $set: {
          status: DrawStatus.Published,
          result,
          updatedAt: new Date(),
        },
        $unset: {
          financial: "",
          stats: "",
          settleSummary: "",
        },
      },
      {
        returnDocument: "after",
      },
    );
  }

  /**
   * Cập nhật CHỈ `vietlottRef` — không đụng status / result / settle data.
   *
   * `vietlottRef` là metadata tham chiếu sang Vietlott (drawPeriod, drawDate),
   * KHÔNG tham gia matching numbers / payout calculation → sửa field này
   * KHÔNG yêu cầu resettle.
   *
   * Cho phép ở `Published` / `Settling` / `Settled` (sau publish trở đi).
   * Trước publish staff dùng `publishResult` để nhập cả vietlottRef cùng result.
   *
   * Atomic, idempotent — gọi nhiều lần với cùng giá trị OK.
   * Return null nếu draw status không nằm trong scope cho phép.
   */
  async updateVietlottRef(
    drawId: string,
    vietlottRef: DrawVietlottRef,
  ): Promise<DrawEntity | null> {
    return await this.findOneAndUpdate(
      {
        drawId,
        status: { $in: [DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled] },
      },
      {
        $set: { vietlottRef, updatedAt: new Date() },
      },
      {
        returnDocument: "after",
      },
    );
  }

  // ─── Data Updates (type-safe) ───

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
   * Ghi financial, stats và settleSummary vào DrawDoc sau khi settle hoàn tất.
   *
   * settleSummary optional — chỉ ghi khi được truyền vào.
   * IDEMPOTENT: Overwrite toàn bộ financial + stats + settleSummary.
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
   * Lấy danh sách kỳ đã settled cho player API — cursor-based pagination.
   *
   * @param filter.from - Upper bound drawDate (YYYY-MM-DD), exclusive.
   * @param filter.size - Số lượng kỳ cần lấy.
   * @param filter.cursor - drawId kỳ cuối trang trước.
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
        query.drawDate = { $lte: cursorDraw.drawDate };
        query.$or = [
          { drawDate: { $lt: cursorDraw.drawDate } },
          { drawDate: cursorDraw.drawDate, drawId: { $gt: cursor } },
        ];
      }
    }
    return await this.findMany(query, { sort: { drawDate: -1, drawId: -1 }, limit: size });
  }
}

export { VALID_TRANSITIONS };
