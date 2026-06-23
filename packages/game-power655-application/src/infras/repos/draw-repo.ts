/**
 * Power 6/55 – Draw Repository
 *
 * Collection: power655Draws
 *
 * Quản lý toàn bộ lifecycle kỳ quay Power 6/55:
 *   scheduled → salesOpen ⇄ salesClosed → published → settling → settled
 *      ↘ void      ↘ void      ↘ void       ↘ void
 *
 * Khác biệt so với Lotto 5/35:
 *   - Kết quả: 6 số chính (winningMain: string[]) + bonusNumber (thay vì winningSpecial)
 *   - Jackpot kép: openingJackpot1/closingJackpot1 + openingJackpot2/closingJackpot2
 *   - Financial: jackpot1Contribution + jackpot2Contribution + jp1Overflow
 */

import { Power655Collections } from "@megawin/game-power655/entities";
import { DrawStatus, DRAW_UNFINISHED_STATUSES } from "@megawin/game-core/entities";
import { subDays, formatVNDate } from "@megawin/shared/utils";
import type { FindOptions } from "mongodb";
import type {
  DrawDoc,
  DrawJackpot,
  DrawFinancial,
  DrawStats,
  DrawSettleSummary,
  DrawVoidInfo,
  DrawVoidSummary,
  DrawResult,
  DrawEntity,
  DrawVietlottRef,
} from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import { DrawMapper } from "../mappers/draw-mapper";

/**
 * Valid status transitions.
 * Key = current status, Value = set of allowed next statuses.
 *
 * Flow: scheduled → salesOpen → salesClosed → published → settling → settled
 *          ↘ void        ↑↓         ↘ void       ↘ void
 *
 * Resettle path (ngoại lệ): settled → published (PublishResultUseCase,
 * khi staff cập nhật kết quả trên kỳ đã settle → trigger resettle flow).
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

/**
 * Repository cho kỳ quay Power 6/55.
 * Mỗi kỳ quay có kết quả gồm 6 số chính + 1 bonus number,
 * và hệ thống jackpot kép (JP1: trùng 6/6, JP2: trùng 5/6 + bonus).
 */
export class DrawRepository extends BaseRepo<DrawEntity, DrawMapper> {
  constructor() {
    super({
      collName: Power655Collections.Draws,
      dataMapper: new DrawMapper(),
    });
  }

  /** Batch insert nhiều kỳ quay (1 round trip). Trả về số document đã insert. */
  async createDraws(docs: Omit<DrawDoc, "_id">[]): Promise<number> {
    if (docs.length === 0) return 0;
    const result = await this.insertMany(docs as any[]);
    return result.insertedCount;
  }

  /** Lấy 1 kỳ quay theo drawId. */
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
   *     → IXSCAN trên `{status, drawTime}` / `{drawId}` , chỉ chạm tập NHỎ kỳ đang dở.
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

  /** Phân trang draws với filter status + khoảng ngày. */
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
   * Chuyển draw settling → settled + ghi dual jackpot snapshot + stamp settledAt.
   * Dùng dot notation để chỉ cập nhật các field cần thiết.
   *
   * `settledAt` là high-water mark đánh dấu kỳ đã kết sổ — re-stamp mỗi khi
   * settle hoàn tất (cả lần đầu lẫn mỗi phiên resettle). `republishResultAfterSettled`
   * KHÔNG $unset field này; chỉ ghi đè giá trị mới tại đây khi phiên resettle xong.
   */
  async settleComplete(drawId: string, jackpot: DrawJackpot): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settling];
    if (!allowed?.has(DrawStatus.Settled)) return null;

    const now = new Date();
    const $set: Record<string, unknown> = {
      status: DrawStatus.Settled,
      "jackpot.openingJackpot1": jackpot.openingJackpot1,
      "jackpot.closingJackpot1": jackpot.closingJackpot1,
      "jackpot.openingJackpot2": jackpot.openingJackpot2,
      "jackpot.closingJackpot2": jackpot.closingJackpot2,
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
   * Void draw: transition → voiding + ghi DrawVoidInfo vào draw.voidInfo.
   * DrawVoidSummary (stats entries) được điền sau bởi voidComplete().
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

  /** Hoàn tất void: voiding → void + ghi voidSummary đầy đủ. Atomic, idempotent. */
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
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
  }

  /**
   * Publish hoặc cập nhật kết quả quay.
   * Chấp nhận draw ở salesClosed hoặc published.
   *
   * Ghi result gồm winningMain (6 số chính) + bonusNumber (số bonus) + publishedAt.
   * Luôn set status = published (idempotent nếu đã published).
   *
   * @param result - Kết quả quay: 6 số chính + bonus number + thời điểm publish
   * @param vietlottRef - Tham chiếu Vietlott chính thức (optional)
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
        status: {
          $in: [DrawStatus.SalesClosed, DrawStatus.Published],
        },
      },
      { $set },
      { returnDocument: "after" },
    );
  }

  /**
   * Trigger settle: published → settling.
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
   * Cập nhật tổng kết tài chính kỳ quay.
   * Bao gồm jackpot1Contribution, jackpot2Contribution, jp1Overflow.
   * settleSummary: bảng giải thưởng denormalized cho API player.
   */
  async updateSettleResult(
    drawId: string,
    financial: DrawFinancial,
    stats: DrawStats,
    settleSummary: DrawSettleSummary,
  ): Promise<boolean> {
    return await this.updateOne(
      { drawId },
      {
        $set: {
          financial,
          stats,
          settleSummary,
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Lấy kỳ quay settled gần nhất. */
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
        "jackpot.closingJackpot1": { $exists: true },
      },
      {
        sort: { drawTime: -1 },
        skip: (page - 1) * size,
        limit: size,
      },
    );
  }

  /** Lấy tất cả draws đang active (theo danh sách statuses). */
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

  /** Cập nhật lịch mở/đóng bán vé và drawTime. */
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
   * Patch prizeAmount cho JP1 và/hoặc JP2 trong settleSummary.
   * Dùng dot notation với $set trên array element theo filter.
   * Idempotent: ghi đè giá trị (set, không cộng dồn).
   *
   * arrayFilters alias = tên tier chính xác từ input (e.g. "jackpot1", "jackpot2")
   * → query log dễ đọc, không cần ánh xạ tier0/tier1 sang tier tương ứng.
   * MongoDB arrayFilter alias: chỉ cần lowercase + alphanumeric — "jackpot1" hợp lệ.
   */
  async patchSettleSummaryJackpot(
    drawId: string,
    patches: Array<{ tier: string; prizeAmount: number }>,
  ): Promise<void> {
    if (patches.length === 0) return;

    // Update từng tier trong array bằng arrayFilters — MongoDB 3.6+.
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const arrayFilters: Record<string, unknown>[] = [];

    for (const patch of patches) {
      // alias = tên tier chính xác ("jackpot1", "jackpot2") — dễ đọc trong query log.
      // MongoDB yêu cầu alias: lowercase, alphanumeric, không dấu cách — đáp ứng đủ.
      const alias = patch.tier;
      $set[`settleSummary.tiers.$[${alias}].prizeAmount`] = patch.prizeAmount;
      arrayFilters.push({ [`${alias}.tier`]: patch.tier });
    }

    await this.updateOne({ drawId }, { $set }, { arrayFilters });
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
   * Cursor-based list kỳ quay đã settle có kết quả cho API player.
   *
   * Trang đầu (không cursor): drawId ≤ from.999 → đi về quá khứ.
   * Paginate (có cursor): drawId < cursor.
   * Power 6/55 chỉ có 1 kỳ/ngày → ".999" là safe upper bound.
   *
   * Index đề xuất: `{ status: 1, drawId: -1 }` — range scan hiệu quả.
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
      // ".999" là safe upper bound (Power 6/55 chỉ quay 1 kỳ/ngày, ".001" < ".999").
      query.drawId = { $lte: `${filter.from}.999` };
    } else {
      // Paginate: cursor encode đầy đủ vị trí.
      query.drawId = { $lt: filter.cursor };
    }

    return await this.findMany(query, {
      sort: { drawId: -1 },
      limit: filter.size,
    });
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

  /**
   * Lấy danh sách draws đã settled trong 1 jackpot cycle, mới nhất trước.
   *
   * Filter theo `drawId >= startDrawId`. Nếu có `endDrawId` (cycle đã đóng),
   * thêm điều kiện `drawId <= endDrawId` để giới hạn đúng phạm vi cycle.
   * Hỗ trợ phân trang theo `page` và `size`.
   *
   * @param startDrawId - drawId đầu tiên của cycle
   * @param endDrawId - drawId cuối của cycle (undefined nếu cycle vẫn đang active)
   * @param page - Trang hiện tại (1-based)
   * @param size - Số lượng mỗi trang
   */
  async getSettledDrawsInCycle(
    startDrawId: string,
    endDrawId: string | undefined,
    page: number,
    size: number,
  ): Promise<{ draws: DrawEntity[]; total: number }> {
    const drawIdFilter: Record<string, unknown> = { $gte: startDrawId };
    if (endDrawId) drawIdFilter.$lte = endDrawId;

    const query: Record<string, unknown> = {
      status: DrawStatus.Settled,
      drawId: drawIdFilter,
    };

    const [draws, total] = await Promise.all([
      this.findMany(query, {
        sort: { drawId: -1 },
        skip: (page - 1) * size,
        limit: size,
      }),
      this.count(query),
    ]);

    return { draws, total };
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
    if (vietlottRef) $set.vietlottRef = vietlottRef;

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
   * GIỮ NGUYÊN `result.winningMain` + `result.bonusNumber`, chuyển `Settled →
   * Published`, $unset data settle cũ. KHÔNG đụng `settledAt` (high-water mark).
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
          // GIỮ winningMain + bonusNumber; chỉ re-stamp publishedAt để vượt cổng
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

export { VALID_TRANSITIONS };
