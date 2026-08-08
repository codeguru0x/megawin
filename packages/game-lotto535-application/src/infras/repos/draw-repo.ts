import type { UnfinishedDrawStatus } from "@megawin/game-core/entities";
import { DRAW_COMPLETED_STATUSES, DRAW_UNFINISHED_STATUSES, DrawStatus } from "@megawin/game-core/entities";
import type {
  DrawDoc,
  DrawEntity,
  DrawFinancial,
  DrawJackpotSnapshot,
  DrawResult,
  DrawSettleSummary,
  DrawStats,
  DrawVietlottRef,
  DrawVoidSummary,
} from "@megawin/game-lotto535/entities";
import { Lotto535Collections, PrizeTier } from "@megawin/game-lotto535/entities";
import { formatVNDate } from "@megawin/shared/utils";
import type { FindOptions } from "mongodb";

import { DrawMapper } from "../mappers/draw-mapper";
import { BaseRepo } from "./base-repo";

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
  [DrawStatus.SalesClosed]: new Set([DrawStatus.SalesOpen, DrawStatus.Published, DrawStatus.Voiding]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Voiding]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
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
      collName: Lotto535Collections.Draws,
      dataMapper: new DrawMapper(),
    });
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

    return await this.findOneAndUpdate({ drawId, status: DrawStatus.Settling }, { $set }, { returnDocument: "after" });
  }

  /**
   * Open sales: scheduled/salesClosed → salesOpen.
   * Stamp sales.openAt nếu lần đầu mở bán.
   */
  async openSales(drawId: string, fromStatus: string, salesOpenAt?: Date): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[fromStatus];
    if (!allowed?.has(DrawStatus.SalesOpen)) return null;

    const $set: Record<string, unknown> = {
      status: DrawStatus.SalesOpen,
      updatedAt: new Date(),
    };
    if (salesOpenAt) {
      $set["sales.openAt"] = salesOpenAt;
    }

    return await this.findOneAndUpdate({ drawId, status: fromStatus }, { $set }, { returnDocument: "after" });
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

    return await this.findOneAndUpdate({ drawId, status: DrawStatus.SalesOpen }, { $set }, { returnDocument: "after" });
  }

  /**
   * Void draw: transition → void + ghi voidInfo embedded doc.
   */
  async voidDraw(drawId: string, fromStatus: string, voidInfo: VoidInfo): Promise<DrawEntity | null> {
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
   * - salesClosed → published (lần đầu publish)
   * - published → published (sửa kết quả trước khi settle)
   *
   * Caller truyền đầy đủ result (kể cả publishedAt).
   * Luôn set status = published bất kể trạng thái trước đó.
   */
  async publishResult(drawId: string, result: DrawResult, vietlottRef?: DrawVietlottRef): Promise<DrawEntity | null> {
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

    return await this.findOneAndUpdate({ drawId, status: DrawStatus.Published }, { $set }, { returnDocument: "after" });
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
   * Set stats.totalPayoutAmount bằng giá trị tuyệt đối (re-aggregated từ entries).
   *
   * Thay thế incrementTotalPayout ($inc) — **idempotent**: chạy lại bao nhiêu lần
   * cũng cho kết quả đúng vì giá trị được tính lại từ source of truth (entries).
   */
  async setTotalPayout(drawId: string, totalPayout: number): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $set: {
          "stats.totalPayoutAmount": totalPayout,
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
  async patchSettleSummaryJackpotPrize(drawId: string, jackpotPrizeAmount: number): Promise<boolean> {
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
  async listSettledDraws(filter: { from: string; size: number; cursor?: string }): Promise<DrawEntity[]> {
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

  async getLatestSettledDraw(): Promise<DrawEntity | null> {
    return await this.findOne({ status: DrawStatus.Settled }, { sort: { drawDate: -1, drawNo: -1 } });
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
   * Lấy draws đã settled trong 1 vòng Jackpot (cycle) theo khoảng drawId.
   *
   * Dùng cho bảng "Lịch sử Jackpot" lọc theo cycle.
   * drawId format YYYY-MM-DD.NNN → lexicographic = chronological order.
   *
   * - Sort: drawId DESC (mới nhất trên cùng).
   * - Index: { status: 1, drawId: 1 }
   *
   * @param startDrawId - DrawId bắt đầu vòng (inclusive).
   * @param endDrawId - DrawId kết thúc vòng (inclusive). null = active cycle, lấy đến hiện tại.
   * @param page - Trang hiện tại (1-based).
   * @param size - Số lượng mỗi trang.
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
      drawId: { $gte: startDrawId },
    };

    if (endDrawId) {
      (filter.drawId as Record<string, unknown>).$lte = endDrawId;
    }

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
   * @param statuses - Subset status cần lọc (default: TOÀN BỘ `DRAW_UNFINISHED_STATUSES`). Kiểu
   *   {@link UnfinishedDrawStatus} chặn compile-time việc lỡ truyền `Settled`/`Void` vào — 2 status
   *   đó nằm ngoài phạm vi "unfinished" và sẽ phá vỡ tối ưu index (xem dưới). Truyền subset khi
   *   consumer chỉ cần 1 phần (VD player chỉ cần SalesOpen/SalesClosed) — VẪN an toàn tuyệt đối vì
   *   KHÔNG lookback theo drawDate, không bỏ sót kỳ kẹt dù cũ bao lâu.
   * @param options - FindOptions override (sort, limit, projection...).
   *
   * Lọc thuần theo status ∈ subset ⊆ DRAW_UNFINISHED_STATUSES (Scheduled..Voiding), KHÔNG lookback
   * theo drawDate. An toàn về performance: `status` là equality prefix của idx_status_drawId_desc →
   * IXSCAN chỉ chạm kỳ unfinished (vài chục), không bao giờ scan kỳ Settled/Void cũ (đa số dữ liệu).
   * Bắt trọn 100% kỳ kẹt bất kể cũ bao lâu — khắc phục discrepancy giữa trang Lịch sử kỳ quay và
   * trang Vận hành do trước đây mỗi nơi dùng lookbackDays khác nhau (7 ngày vs 1 ngày).
   */
  async getUnfinishedDraws(
    statuses: readonly UnfinishedDrawStatus[] = DRAW_UNFINISHED_STATUSES,
    options?: FindOptions,
  ): Promise<DrawEntity[]> {
    return await this.findMany({ status: { $in: [...statuses] } }, { sort: { drawId: -1 }, ...options });
  }

  /**
   * Status hiện tại của danh sách kỳ — dùng cho stats worker (p0-02) để biết kỳ nào đã
   * TERMINAL (đủ điều kiện `stampFinal` sau khi hút cạn entries).
   *
   * Port từ Power 6/55 (`draw-repo.ts`).
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
   * `drawId` của mọi kỳ chưa hoàn thành — thin version của {@link getUnfinishedDraws} dùng
   * cho `beforeLoop` của stats worker (enroll `ensureDocs`).
   *
   * Port từ Power 6/55 (`draw-repo.ts`) — projection `{drawId}` + filter `status` khớp trọn
   * `idx_status_drawId_desc` (covered query, không chạm document).
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
   * Lấy N kỳ đã hoàn thành gần nhất (settled/void) — dùng cho nhóm "recent" trên draw selector
   * (tra soát/resettle nhanh), KHÔNG dùng để phát hiện kỳ kẹt (đã có `getUnfinishedDraws`).
   *
   * Lấy theo SỐ PHIÊN thay vì lookback theo ngày: game quay ít (vd 3 kỳ/tuần) lookback theo ngày
   * dễ trả về rỗng đúng lúc cần tra soát; game quay nhiều (Keno/Bingo18, hàng trăm kỳ/ngày)
   * lookback theo ngày lại trả về quá nhiều, phải cắt tay. Lấy theo N phiên tự thích ứng tần suất.
   *
   * Performance: `status $in DRAW_COMPLETED_STATUSES` là equality prefix của idx_status_drawId_desc,
   * sort `drawId desc` khớp chiều index → IXSCAN, dừng ngay khi đủ `limit`, không quét toàn bộ
   * lịch sử Settled/Void dù chạy nhiều năm.
   */
  async getRecentCompletedDraws(limit = 5, options?: FindOptions): Promise<DrawEntity[]> {
    return await this.findMany(
      { status: { $in: [...DRAW_COMPLETED_STATUSES] } },
      { sort: { drawId: -1 }, limit, ...options },
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

  async updateSchedule(drawId: string, sales: { openAt: Date; closeAt: Date; drawTime?: Date }): Promise<boolean> {
    const $set: Record<string, unknown> = {
      "sales.openAt": sales.openAt,
      "sales.closeAt": sales.closeAt,
      updatedAt: new Date(),
    };
    if (sales.drawTime) {
      $set.drawTime = sales.drawTime;
      // drawDate phải đồng bộ với ngày của drawTime theo giờ VN.
      $set.drawDate = formatVNDate(sales.drawTime);
    }
    return await this.updateOne({ drawId }, { $set });
  }

  /**
   * Republish kết quả kỳ đã settle — `Settled → Published`, GIỮ `settledAt`.
   * Chỉ `$unset financial, stats, settleSummary` (KHÔNG unset jackpot).
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
        $unset: {
          financial: "",
          stats: "",
          settleSummary: "",
        },
      },
      { returnDocument: "after" },
    );
  }

  /**
   * Mở lại kỳ T+n trong cascade B2 để resettle dù KẾT QUẢ SỐ KHÔNG ĐỔI.
   *
   * Cascade TYPE_B2: sửa kết quả kỳ T kéo theo các kỳ settle sau (T+1…T+n) phải
   * re-settle vì pool jackpot tích luỹ + ranh giới split cycle đổi — NHƯNG số quay
   * của các kỳ này KHÔNG đổi. Luồng publish-result thông thường return sớm khi
   * `resultUnchanged` nên không chuyển `Settled → Published`, khiến kỳ T+n không
   * vào được luồng resettle (`DRAW_NO_NEW_RESULT`). Method này là entry point riêng
   * cho cascade: re-stamp `result.publishedAt = now` (để `publishedAt > settledAt`,
   * mở cổng trigger), GIỮ NGUYÊN `result.winningMain` + `result.winningSpecial`,
   * chuyển `Settled → Published`, $unset data settle cũ. KHÔNG đụng `settledAt`
   * (high-water mark).
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
          // GIỮ winningMain + winningSpecial; chỉ re-stamp publishedAt để vượt cổng
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

  /** Cập nhật vietlottRef không đổi status/result. */
  async updateVietlottRef(drawId: string, vietlottRef: DrawVietlottRef): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $set: {
          vietlottRef,
          updatedAt: new Date(),
        },
      },
    );
  }
}
