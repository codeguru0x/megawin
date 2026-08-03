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
import {
  DrawStatus,
  DRAW_UNFINISHED_STATUSES,
  DRAW_COMPLETED_STATUSES,
} from "@megawin/game-core/entities";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
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

  /**
   * Kiểm tra kỳ quay có tồn tại — dùng khi use-case CHỈ cần validate `drawId` hợp lệ,
   * không đọc field nào của draw (VD: guard trước khi query collection phụ thuộc như
   * entries/combo-stats). Nhanh hơn `getDrawById`: `countDocuments({ limit: 1 })` dừng
   * ngay khi thấy 1 match, không map cả document sang `DrawEntity`.
   */
  async existsByDrawId(drawId: string): Promise<boolean> {
    return await this.exists({ drawId });
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

  /**
   * Map `drawId → status` cho một tập kỳ — chỉ đọc 2 field, KHÔNG map `DrawEntity`.
   *
   * Dành cho caller chạy **nhịp cao** và chỉ cần status (worker stats gọi mỗi 10s để biết kỳ
   * đã terminal chưa). `getDrawsByIds` đọc full `DrawDoc` (có `financial`, `settleSummary`,
   * `vietlottRef`…) — kéo hàng chục KB × D kỳ mỗi tick chỉ để đọc 1 chuỗi là write/read
   * amplification thuần (mongodb.mdc §8.4).
   *
   * Projection `{_id:0, drawId:1, status:1}`: IXSCAN `idx_drawId_unique` rồi FETCH doc, nhưng
   * chỉ **truyền về 2 field** — cắt phần lớn chi phí (network + BSON deserialize + map entity).
   * KHÔNG covered được vì không có index nào chứa cả `drawId` và `status` theo thứ tự này
   * (`idx_status_drawId_desc` có `status` làm prefix nên không dùng được cho filter theo `drawId`).
   *
   * @param drawIds - Danh sách kỳ cần biết status.
   * @returns Map chỉ chứa kỳ TỒN TẠI (drawId lạ sẽ không có key).
   */
  async getStatusesByDrawIds(drawIds: string[]): Promise<Map<string, DrawStatus>> {
    if (drawIds.length === 0) return new Map();

    const docs = await this.findManyAsDocuments(
      { drawId: { $in: drawIds } },
      { projection: { _id: 0, drawId: 1, status: 1 } },
    );

    return new Map(docs.map((d) => [d.drawId as string, d.status as DrawStatus]));
  }

  /**
   * `drawId` của mọi kỳ chưa hoàn thành — thin version của {@link getUnfinishedDraws}.
   *
   * Cùng lý do như {@link getStatusesByDrawIds}: worker stats chỉ cần danh sách id để seed
   * stats doc, không cần nội dung draw. Ở đây là **covered query** thật — projection
   * `{drawId}` + filter `status` khớp trọn `idx_status_drawId_desc`, không chạm document.
   *
   * @param limit - Trần số kỳ trả về. `findMany` mặc định cắt 500 và **im lặng** — truyền
   *   tường minh để caller biết mình đang giới hạn ở đâu.
   */
  async listUnfinishedDrawIds(limit = 500): Promise<string[]> {
    const docs = await this.findManyAsDocuments(
      { status: { $in: [...DRAW_UNFINISHED_STATUSES] } },
      { projection: { _id: 0, drawId: 1 }, sort: { drawId: -1 }, limit },
    );

    return docs.map((d) => d.drawId as string);
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
   * Lấy kỳ chưa hoàn thành (unfinished) — single source of truth "kỳ đang vận hành".
   *
   * Lọc thuần theo status ∈ `statuses` (subset của DRAW_UNFINISHED_STATUSES), KHÔNG lookback theo
   * drawDate. An toàn về performance: `status` là equality prefix của idx_status_drawId_desc →
   * IXSCAN chỉ chạm kỳ unfinished, không bao giờ scan kỳ Settled/Void cũ. Bắt trọn 100% kỳ kẹt
   * bất kể cũ bao lâu.
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
   * Lấy theo SỐ PHIÊN thay vì lookback theo ngày — nhất quán với các game khác dù Keno
   * quay tần suất cao (~120 kỳ/ngày), tránh phải lookback + limit riêng lẻ như trước.
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
   * bound) → equality prefix trên index `{ status: 1, drawId: -1 }` (idx_status_drawId_desc).
   * Sort `drawId: -1` lấy kỳ dở GẦN T nhất, khớp luôn thứ tự index; `findOne` tự thêm
   * limit 1 → IXSCAN dừng ngay record đầu.
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
    result: DrawResult,
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
