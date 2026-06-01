/**
 * Keno – Draw Repository
 *
 * Collection: kenoDraws
 *
 * Quản lý trạng thái kỳ mở thưởng Keno.
 * Tất cả status transitions phải đi qua repo methods để đảm bảo atomic + type-safe.
 *
 * RULE: Use case KHÔNG BAO GIỜ dùng dot notation hay biết cấu trúc MongoDB.
 *       Mọi field update đi qua typed method ở đây.
 *       Khi entity đổi field → chỉ sửa repo, compiler sẽ bắt lỗi ở use case.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import { DrawStatus } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils";
import type { FindOptions } from "mongodb";
import type {
  DrawDoc,
  DrawEntity,
  DrawFinancial,
  DrawResult,
  DrawSettleSummary,
  DrawStats,
  DrawVietlottRef,
  DrawVoidInfo,
  DrawVoidSummary,
} from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper } from "../mappers/draw-mapper";

/**
 * Valid status transitions cho Keno Draw.
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

export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: KenoCollections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  // ─── CRUD ───

  /** Tạo kỳ quay mới. Trả về insertedId string. */
  async createDraw(doc: Omit<DrawDoc, "_id">): Promise<string> {
    return await this.insertOne(doc as any);
  }

  /** Tìm kỳ quay theo drawId. */
  async getDrawById(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne({ drawId });
  }

  /** Lấy nhiều kỳ quay theo danh sách drawIds. Sort theo drawDate + drawNo tăng dần. */
  async getDrawsByIds(drawIds: string[]): Promise<DrawEntity[]> {
    return await this.findMany(
      { drawId: { $in: drawIds } },
      {
        sort: { drawDate: 1, drawNo: 1 },
      },
    );
  }

  /** Paginate danh sách kỳ quay theo filter status và/hoặc date range. Sort drawDate desc. */
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
   * Tất cả kỳ quay đang ở trạng thái allowStatuses.
   * lookbackDays: giới hạn theo ngày để tránh quét toàn bộ collection (dùng cho settled).
   *   - undefined: không filter ngày — dùng cho active draws (không bỏ sót kỳ bị trễ).
   *   - số ngày: chỉ lấy từ (today - lookbackDays) trở về sau.
   * options: MongoDB FindOptions bổ sung (projection, limit...).
   */
  async getActiveDraws(
    allowStatuses: string[],
    lookbackDays?: number,
    options?: FindOptions,
  ): Promise<DrawEntity[]> {
    const query: Record<string, unknown> = {
      status: { $in: allowStatuses },
    };
    // Khi lookbackDays được cung cấp, filter theo ngày để giới hạn số lượng kết quả
    // (dùng cho settled draws có thể rất nhiều). Active draws không filter ngày
    // để không bỏ sót kỳ đang vận hành bị trễ qua ngày.
    if (lookbackDays !== undefined) {
      const fromDateStr = formatVNDate(subDays(new Date(), lookbackDays));
      query.drawDate = { $gte: fromDateStr };
    }
    return await this.findMany(query, {
      sort: { drawDate: 1, drawNo: 1 },
      ...options,
    });
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

  /**
   * Chuyển draw settling → settled + stamp settledAt. Atomic, idempotent.
   *
   * `settledAt` ở đây là **high-water mark** — overwrite mỗi lần settle thành công
   * (cả lần đầu lẫn resettle). Dùng để phân biệt "Settle lần đầu" vs "Resettle"
   * tại API trigger-resettle và UI logic. KHÔNG bị $unset khi republish.
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
   * Open sales: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu lần đầu mở bán.
   * Dùng dot notation để chỉ set field cần thiết, tránh overwrite toàn bộ sales embedded doc.
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
    // Dot notation để không overwrite sales.closeAt đã được set lúc tạo draw.
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
   * Close sales: salesOpen → salesClosed.
   * Stamp sales.closeAt thời điểm đóng bán thực tế.
   * Dùng dot notation để chỉ set field cần thiết, tránh overwrite toàn bộ sales embedded doc.
   */
  async closeSales(drawId: string, salesCloseAt?: Date): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.SalesOpen];
    if (!allowed?.has(DrawStatus.SalesClosed)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesClosed,
      updatedAt: new Date(),
    };
    // Dot notation để không overwrite sales.openAt đã set khi mở bán.
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
   * Void draw: transition → voiding + ghi voidInfo embedded doc.
   * voidInfo là DrawVoidInfo từ entity layer — type-safe, đồng bộ với DrawDoc.
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
   * Atomic, idempotent. Set lần đầu — overwrite toàn bộ voidSummary an toàn.
   */
  async voidComplete(drawId: string, voidSummary: DrawVoidSummary): Promise<DrawEntity | null> {
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

  /**
   * Cập nhật lịch bán: openAt, closeAt, drawTime cho kỳ chưa mở bán hoặc đã lên lịch.
   * Dùng dot notation để partial update sales, không overwrite toàn bộ embedded doc.
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
    // drawTime optional — chỉ update nếu được cung cấp.
    if (sales.drawTime) {
      $set.drawTime = sales.drawTime;
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Ghi financial + stats + settleSummary sau khi settle hoàn tất.
   *
   * Set lần đầu → overwrite toàn bộ financial/stats an toàn.
   * settleSummary optional — chỉ ghi khi được truyền vào.
   * Tất cả fields ghi trong 1 lần `$set` — tối thiểu DB call.
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
   * Danh sách kỳ quay đã settle — cursor-based pagination, xem ngược về quá khứ.
   * Chỉ trả draws có kết quả (status = "settled", result tồn tại).
   * Sort: drawId desc (mới nhất trước).
   *
   * drawId format "YYYY-MM-DD.NNN" → lexicographic order = chronological order.
   *
   * `from` là upper bound (ngưỡng trên): trả về tất cả draws CŨ HƠN HOẶC BẰNG ngày from,
   * đi ngược về quá khứ. Ví dụ: from = "2026-03-07" → trả 2026-03-07.288, ..., 2026-03-06.xxx, ...
   *
   * Cursor pagination:
   *   - Trang đầu (không có cursor): filter drawId <= "${from}.999"
   *     ".999" là safe upper bound cho mọi draw trong ngày (Keno max 288, ".999" > ".288").
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
}
