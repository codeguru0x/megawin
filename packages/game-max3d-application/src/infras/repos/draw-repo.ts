import {
  DrawStatus,
  DRAW_UNFINISHED_STATUSES,
  DRAW_COMPLETED_STATUSES,
} from "@megawin/game-core/entities";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
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

/**
 * Map các chuyển đổi trạng thái hợp lệ trong draw lifecycle.
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
   * - salesClosed → published: lần đầu publish kết quả.
   * - published → published: sửa kết quả trước khi settle.
   * Caller truyền publishedAt sẵn trong result.
   */
  async publishResult(
    drawId: string,
    result: Max3dDrawResult & { publishedAt: Date },
    vietlottRef?: DrawVietlottRef,
  ): Promise<DrawEntity | null> {
    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result,
      updatedAt: new Date(),
    };

    if (vietlottRef) {
      $set.vietlottRef = vietlottRef;
    }

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
   * Gộp `vietlottRef` (optional) vào cùng `$set` để tránh chạy 2 query khi staff
   * vừa sửa result vừa giữ/đổi vietlottRef trước resettle. `vietlottRef` là
   * metadata đối soát, KHÔNG tham gia matching/payout nên việc ghi cùng lần với
   * result không kéo theo hệ quả nghiệp vụ — resettle chỉ phụ thuộc result mới.
   *
   * KHÔNG $unset `settledAt` — đây là high-water mark lịch sử settle, dùng để biết
   * draw đã từng settle (phân biệt với Settle lần đầu).
   */
  async republishResultAfterSettled(
    drawId: string,
    result: Max3dDrawResult & { publishedAt: Date },
    vietlottRef?: DrawVietlottRef,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settled];

    if (!allowed?.has(DrawStatus.Published)) {
      return null;
    }

    const $set: Record<string, unknown> = {
      status: DrawStatus.Published,
      result,
      updatedAt: new Date(),
    };

    if (vietlottRef) {
      $set.vietlottRef = vietlottRef;
    }

    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Settled,
      },
      {
        $set,
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

  /**
   * Tìm kỳ quay CHƯA HOÀN THÀNH gần nhất TRƯỚC drawId (theo thứ tự thời gian).
   *
   * Guard thứ tự kết sổ: phải settle TUẦN TỰ theo thời gian (drawId tăng dần).
   * Không cho kết sổ kỳ T nếu còn kỳ trước đó (drawId < T) chưa "hoàn thành".
   * "Hoàn thành" = đã kết sổ (settled) HOẶC đã huỷ (void) — xem
   * {@link DRAW_COMPLETED_STATUSES}. Mọi status khác coi là chưa hoàn thành và chặn.
   *
   * FAIL-SAFE: tập status truy vấn là {@link DRAW_UNFINISHED_STATUSES} — derive tự
   * động = tất cả DrawStatus − completed. Thêm status mới trong tương lai → mặc định
   * rơi vào nhóm "chưa hoàn thành" → guard vẫn chặn, không bị sót.
   *
   * Tối ưu DB: dùng `$in` (KHÔNG dùng `$nin` vì negation không tạo được tight index
   * bound) → equality prefix trên index `{ status: 1, drawId: 1 }` (idx_status_drawId).
   * Sort `drawId: -1` lấy kỳ dở GẦN T nhất; `findOne` tự thêm limit 1 → IXSCAN dừng
   * ngay record đầu.
   *
   * @param drawId - upper bound (exclusive). Chỉ xét kỳ có drawId < drawId này.
   * @returns kỳ chưa hoàn thành gần T nhất, hoặc null nếu mọi kỳ trước đã settled/void.
   */
  async findUnfinishedDrawBefore(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        drawId: { $lt: drawId },
        status: { $in: [...DRAW_UNFINISHED_STATUSES] },
      },
      // Chỉ cần drawId + status cho thông báo lỗi → projection giảm payload:
      // deserialize/transfer 3 field nhỏ (kèm _id mapper cần) thay vì nguyên doc.
      { sort: { drawId: -1 }, projection: { drawId: 1, status: 1 } },
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

  /** Lấy draw đã settle mới nhất. */
  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne(
      { status: DrawStatus.Settled },
      { sort: { drawDate: -1, drawNo: -1 } },
    );
  }

  /**
   * Lấy kỳ chưa hoàn thành (unfinished) — single source of truth "kỳ đang vận hành".
   *
   * Lọc thuần theo status ∈ `statuses` (subset của DRAW_UNFINISHED_STATUSES), KHÔNG lookback theo
   * drawDate. An toàn về performance: `status` là equality prefix của idx_status_drawId_desc →
   * IXSCAN chỉ chạm kỳ unfinished (vài chục), không bao giờ scan kỳ Settled/Void cũ.
   * Bắt trọn 100% kỳ kẹt bất kể cũ bao lâu.
   *
   * @param statuses - Subset status cần lấy (default: toàn bộ DRAW_UNFINISHED_STATUSES).
   *   Truyền subset hẹp hơn cho consumer cần giới hạn phạm vi (VD: player-facing chỉ
   *   [SalesOpen, SalesClosed] — không lộ Settling/Voiding vốn chỉ dành cho staff).
   */
  async getUnfinishedDraws(
    statuses: readonly UnfinishedDrawStatus[] = DRAW_UNFINISHED_STATUSES,
    options?: FindOptions,
  ): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: [...statuses] } },
      { sort: { drawId: -1 }, ...options },
    );
  }

  /**
   * Lấy N kỳ đã hoàn thành gần nhất (settled/void) — dùng cho nhóm "recent" trên draw selector
   * (tra soát/resettle nhanh), KHÔNG dùng để phát hiện kỳ kẹt (đã có `getUnfinishedDraws`).
   *
   * Lấy theo SỐ PHIÊN thay vì lookback theo ngày: Max 3D chỉ quay T2/T4/T6, lookback theo ngày
   * dễ trả về rỗng đúng lúc cần tra soát. Lấy theo N phiên tự thích ứng tần suất.
   *
   * Performance: `status $in DRAW_COMPLETED_STATUSES` là equality prefix của idx_status_drawId_desc,
   * sort `drawId desc` khớp chiều index → IXSCAN, dừng ngay khi đủ `limit`.
   */
  async getRecentCompletedDraws(limit = 5, options?: FindOptions): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: [...DRAW_COMPLETED_STATUSES] } },
      { sort: { drawId: -1 }, limit, ...options },
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
