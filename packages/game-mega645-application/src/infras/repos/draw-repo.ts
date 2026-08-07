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
import {
  DrawStatus,
  DRAW_UNFINISHED_STATUSES,
  DRAW_COMPLETED_STATUSES,
} from "@megawin/game-core/entities";
import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
import type { FindOptions } from "mongodb";
import type {
  DrawDoc,
  DrawJackpotSnapshot,
  DrawFinancial,
  DrawStats,
  DrawSettleSummary,
  DrawResult,
  DrawVietlottRef,
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
  // Resettle path: settled → published khi staff cập nhật kết quả.
  // Sau đó re-trigger settle flow bình thường: published → settling → settled.
  [DrawStatus.Settled]: new Set([DrawStatus.Published]),
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

  /**
   * Guard thứ tự cascade (TYPE_B2): tìm kỳ TRƯỚC `drawId` (XUYÊN CYCLE) đang DỞ
   * resettle — đã republish kết quả mới nhưng chưa re-settle xong.
   *
   * ── Vì sao query trực tiếp trên `draws` (KHÔNG quét ledger) ──────────────────
   * Câu hỏi guard thuần về trạng thái DrawDoc: "có kỳ nào < T đã republish
   * (`result.publishedAt > settledAt`) nhưng chưa Settled không?". Quét toàn bộ
   * ledger trước T (hàng chục nghìn kỳ sau nhiều năm) rồi `getDrawsByIds` là O(n)
   * lãng phí + rủi ro cap limit. Thay vào đó lọc thẳng `draws`:
   *   - `drawId < T` + `status ∈ {Published, Settling}` (đang trong luồng resettle)
   *     → IXSCAN trên `{status, drawId}`, chỉ chạm tập NHỎ kỳ đang dở.
   *   - `$expr publishedAt > settledAt` áp trên tập nhỏ đó (loại kỳ vừa settle lần
   *     đầu — publishedAt < settledAt). $expr chỉ đánh giá trên vài doc đã lọc, KHÔNG
   *     full scan.
   * Chỉ cần 1 kỳ vi phạm gần T nhất để báo lỗi → `findOne` + `limit(1)`, không tải list.
   *
   * Dùng trong `TriggerResettle.assertNoPendingPriorDraw`. Cross-cycle an toàn vì
   * lọc theo `drawId` (chronological) không khoá cycleNo.
   *
   * @param drawId - Kỳ T đang muốn resettle (tìm kỳ dở có drawId < T).
   * @returns Kỳ dở gần T nhất (drawId lớn nhất < T), hoặc `null` nếu mọi kỳ trước đã hoàn tất.
   */
  async findPendingResettleBeforeDraw(drawId: string): Promise<DrawEntity | null> {
    return await this.findOne(
      {
        drawId: { $lt: drawId },
        status: { $in: [DrawStatus.Published, DrawStatus.Settling] },
        $expr: { $gt: ["$result.publishedAt", "$settledAt"] },
      },
      { sort: { drawId: -1 } },
    );
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

  // ─── Status Transitions (atomic, type-safe) ───

  /**
   * Chuyển draw settling → settled + ghi jackpot snapshot.
   * Dùng dot notation để chỉ cập nhật các field cần thiết.
   *
   * `settledAt` là high-water mark đánh dấu kỳ đã kết sổ — re-stamp mỗi khi
   * settle hoàn tất (cả lần đầu lẫn mỗi phiên resettle). `republishResultAfterSettled`
   * KHÔNG $unset field này; chỉ ghi đè giá trị mới tại đây khi phiên resettle xong.
   */
  async settleComplete(drawId: string, jackpot: DrawJackpotSnapshot): Promise<DrawEntity | null> {
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

  /**
   * Lấy kỳ chưa hoàn thành (unfinished) — single source of truth "kỳ đang vận hành".
   *
   * Lọc thuần theo status ∈ `statuses` (subset của DRAW_UNFINISHED_STATUSES), KHÔNG lookback theo
   * drawDate. An toàn về performance: `status` là equality prefix của idx_status_drawId_desc →
   * IXSCAN chỉ chạm kỳ unfinished (vài chục), không bao giờ scan kỳ Settled/Void cũ (đa số dữ liệu).
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

  /**
   * Trạng thái hiện tại của 1 danh sách kỳ — dùng bởi worker stats-sync để biết kỳ nào
   * đã TERMINAL (Settled/Void) và có thể `stampFinal` sau khi hút cạn entries.
   *
   * Projection mỏng `{drawId, status}` — worker không cần nội dung draw đầy đủ.
   *
   * @param drawIds - Danh sách kỳ cần tra (từ hàng đợi `findNotFinal`).
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
   * Lấy N kỳ đã hoàn thành gần nhất (settled/void) — dùng cho nhóm "recent" trên draw selector
   * (tra soát/resettle nhanh), KHÔNG dùng để phát hiện kỳ kẹt (đã có `getUnfinishedDraws`).
   *
   * Lấy theo SỐ PHIÊN thay vì lookback theo ngày: Mega 6/45 chỉ quay 3 kỳ/tuần, lookback theo
   * ngày dễ trả về rỗng đúng lúc cần tra soát. Lấy theo N phiên tự thích ứng tần suất.
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
    await this.updateOne({ drawId }, { $set: { "stats.totalPayoutAmount": totalPayout } });
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
    await this.updateOne({ drawId }, { $inc: { "stats.totalPayoutAmount": amount } });
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

  // ─── Resettle helpers ─────────────────────────────────────────────────────

  /**
   * Publish lại kết quả cho kỳ đã settle (resettle path).
   *
   * Transition: settled → published.
   *
   * Side effects:
   * - $set: `status = published`, `result`, `updatedAt`, (+ `vietlottRef` nếu có).
   * - $unset: `financial`, `stats`, `settleSummary` — dữ liệu lần settle CŨ. Trong
   *   giai đoạn Published-chờ-resettle, draw KHÔNG được mang số liệu tài chính lỗi
   *   thời (API/UI đọc lúc này sẽ sai). Re-settle sẽ ghi lại đầy đủ qua
   *   `updateSettleResult` ($set overwrite).
   *
   * KHÔNG $unset `settledAt` — đây là high-water mark lịch sử settle:
   *   - `PublishResultUseCase` dùng nó (KHÔNG dùng status) để biết kỳ đã từng settle.
   *   - `TriggerResettleUseCase` dùng `settledAt.getTime()` làm token execution name
   *     (deterministic qua các retry BO API → AWS idempotent). $unset sẽ khiến
   *     `draw.settledAt.getTime()` crash và rẽ nhánh sai khi sửa result lần 2.
   *   FinalizeSettle re-stamp `settledAt` ở cuối phiên resettle (settleComplete).
   *
   * Chỉ được gọi bởi `PublishResultUseCase` khi kỳ đang ở status=settled VÀ
   * staff submit kết quả mới. Sau khi hàm này chạy xong, ResettleWorker sẽ
   * trigger settle flow lại bình thường: published → settling → settled.
   *
   * Idempotent: filter `status=settled` → no-op nếu đã về published (retry).
   */
  async republishResultAfterSettled(
    drawId: string,
    result: DrawResult,
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
      { drawId, status: DrawStatus.Settled },
      {
        $set,
        // Xoá data settle CŨ — re-settle sẽ tính lại. KHÔNG đụng `settledAt`
        // (high-water mark, cần cho resettle token + phân biệt đã-từng-settle).
        $unset: { financial: "", stats: "", settleSummary: "" },
      },
      { returnDocument: "after" },
    );
  }

  /**
   * Mở lại kỳ T+n trong cascade B2 để resettle dù KẾT QUẢ SỐ KHÔNG ĐỔI.
   *
   * Cascade TYPE_B2: sửa kết quả kỳ T kéo theo các kỳ settle sau (T+1…T+n) phải
   * re-settle vì pool jackpot tích luỹ đổi — NHƯNG số quay của các kỳ này KHÔNG
   * đổi. Luồng publish-result thông thường return sớm khi `resultUnchanged` nên
   * không chuyển `Settled → Published`, khiến kỳ T+n không vào được luồng resettle
   * (`DRAW_NO_NEW_RESULT`). Method này là entry point riêng cho cascade: re-stamp
   * `result.publishedAt = now` (để `publishedAt > settledAt`, mở cổng trigger),
   * GIỮ NGUYÊN `result.winningNumbers`, chuyển `Settled → Published`, $unset data
   * settle cũ. KHÔNG đụng `settledAt` (high-water mark).
   *
   * Idempotent theo status: filter `status = Settled` → gọi lại trên kỳ đã
   * Published trả null (no-op). Caller (`ReopenForCascadeUseCase`) đã guard chỉ
   * kỳ thực sự nằm trong chain cascade mới được gọi.
   *
   * @param drawId - Kỳ T+n cần mở lại (đang ở status Settled).
   * @param publishedAt - Mốc thời gian re-stamp cho `result.publishedAt`.
   * @returns DrawEntity sau update, hoặc `null` nếu kỳ không còn ở `Settled`.
   */
  async reopenForResettle(drawId: string, publishedAt: Date): Promise<DrawEntity | null> {
    return await this.findOneAndUpdate(
      {
        drawId,
        status: DrawStatus.Settled,
      },
      {
        $set: {
          status: DrawStatus.Published,
          // GIỮ winningNumbers; chỉ re-stamp publishedAt để vượt cổng
          // `publishedAt > settledAt` của TriggerResettle. settledAt giữ nguyên.
          "result.publishedAt": publishedAt,
          updatedAt: new Date(),
        },
        // Xoá data settle CŨ — re-settle sẽ tính lại (giống republishResultAfterSettled).
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
   * Cập nhật vietlottRef trên kỳ đã settle (không đổi status).
   *
   * Dùng khi staff muốn update tham chiếu Vietlott sau khi đã settle,
   * mà không cần trigger lại settle flow (kết quả vẫn đúng).
   * Không $unset settledAt — chỉ update metadata.
   */
  async updateVietlottRef(drawId: string, vietlottRef: DrawVietlottRef): Promise<boolean> {
    return await this.updateOne({ drawId }, { $set: { vietlottRef, updatedAt: new Date() } });
  }
}
