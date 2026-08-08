/**
 * Keno – Entry Repository
 *
 * Collection: kenoTicketEntries
 *
 * VERSION TRACKING:
 * Mỗi khi entry thay đổi trạng thái business (insert, status transition, settle, void),
 * field `version` được gán 1 giá trị mới từ global entryChangeSeq.
 * Worker sync-entry-feed dùng `version` để detect changes → copy sang entryFeed.
 *
 * Payout/refund dispatch KHÔNG bump version vì đây chỉ là trạng thái giao dịch
 * nội bộ, không thay đổi kết quả thắng thua hay số tiền trong báo cáo tenant.
 */

import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type { TicketEntryEntity } from "@megawin/game-keno/entities";
import {
  type EntryPayout,
  type EntryResult,
  type EntryVoidInfo,
  KENO_SIDE_BET_PLAY_TYPES,
  KenoCollections,
} from "@megawin/game-keno/entities";
import { type Long, ObjectId } from "mongodb";

import { mapDocToEntryForStats } from "../mappers/entry-for-stats-mapper";
import { EntryMapper } from "../mappers/entry-mapper";
import { BaseRepo } from "./base-repo";
import type {
  EntryForStats,
  OutstandingDrawCounts,
  OutstandingDrawMetrics,
  OwnedBoard,
  SettledFinancialSummary,
  VoidedEntryForDispatch,
  WinningEntryForDispatch,
} from "./types";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: KenoCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. Dùng cho place-bet, settle, void... */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  /**
   * Insert nhiều entries — tự allocate version từ global sequence.
   * Tất cả entries trong batch nhận cùng 1 version (atomic batch).
   */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const version = await this.nextVersion();
    const stamped = docs.map((doc) => ({ ...doc, version }));
    const result = await this.insertMany(stamped as any[]);
    return result.insertedCount;
  }

  // ─── Query ───

  async getEntryById(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  async getEntriesByDrawId(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  async getScheduledEntriesBatch(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ drawId, status: EntryStatus.Scheduled }, { sort: { createdAt: 1 }, limit });
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawId: 1 } });
  }

  // ─── Operations Stats: insert-stream & void watermark reads ───

  /**
   * Đọc entries MỚI của 1 DRAW theo watermark insert-stream — cho stats worker
   * (analysis §3.3 bước 1). Watermark PER-DRAW (không dùng min toàn cục) → không đọc
   * thừa entry đã cộng của draw khác (tránh lãng phí I/O + double-count).
   *
   * Entries là insert-only tại place-bet → `_id` ObjectId tăng đơn điệu là watermark
   * tin cậy. Lấy `{ drawId, _id > afterId }`, sort `_id: 1`, limit batch. Dùng index
   * `idx_draw_id` (`{ drawId: 1, _id: 1 }`) — equality prefix + range `_id`, index-only cursor.
   * Projection tối thiểu (không kéo payout/result — chưa settle) → nhẹ.
   *
   * Loại `status: Void` NGAY TẠI NGUỒN đọc — betting stats không bao giờ tính entry đã
   * huỷ (dù void toàn kỳ hay per-entry sau này). Đơn giản + an toàn hơn "cộng rồi trừ bù":
   * cách cũ có khoảng hở khi draw đang `Voiding` giữa chừng — đếm nhầm entry chưa kịp void
   * rồi đóng dấu `final` vĩnh viễn sai (p2-01 §3.5).
   *
   * @param drawId - Draw đang mở/chưa chốt cần theo dõi.
   * @param afterId - Watermark: chỉ lấy entry có `_id` lớn hơn (exclusive). undefined = từ đầu.
   * @param limit - Kích thước batch.
   */
  async getEntriesForStatsAfter(drawId: string, afterId: string | undefined, limit: number): Promise<EntryForStats[]> {
    const filter: Record<string, unknown> = { drawId, status: { $ne: EntryStatus.Void } };
    if (afterId) {
      filter._id = { $gt: new ObjectId(afterId) };
    }
    const docs = await this.findManyAsDocuments(filter, {
      sort: { _id: 1 },
      limit,
      projection: {
        _id: 1,
        drawId: 1,
        tenantId: 1,
        accountId: 1,
        username: 1,
        amount: 1,
        "tenant.commissionAmount": 1,
        "entrySummary.boards": 1,
      },
    });
    return docs.map(mapDocToEntryForStats);
  }

  /**
   * Đọc boards của CHÍNH account trong 1 kỳ — cho ownership-gate minh bạch combo (p1-01).
   *
   * Chỉ lấy `entrySummary.boards` của entries account đang có trong draw (thường vài doc).
   * Projection cực nhẹ (không kéo payout/result/amount) — chỉ đủ để so combo player yêu
   * cầu có thuộc về họ không. Loại entry Void (đã huỷ = không còn sở hữu combo).
   *
   * KHÔNG index mới (analysis §3.8): tận dụng index chứa `{ accountId, drawId }` sẵn có.
   *
   * @param accountId - Account đang yêu cầu (từ auth).
   * @param drawId - Kỳ cần soi.
   */
  async getBoardsByAccountDraw(accountId: string, drawId: string): Promise<OwnedBoard[]> {
    const docs = await this.findManyAsDocuments(
      { accountId, drawId, status: { $ne: EntryStatus.Void } },
      {
        projection: { _id: 0, "entrySummary.boards.playType": 1, "entrySummary.boards.numbers": 1 },
      },
    );
    const boards: OwnedBoard[] = [];
    for (const d of docs as any[]) {
      for (const b of d.entrySummary?.boards ?? []) {
        if (b.numbers) boards.push({ playType: b.playType, numbers: b.numbers });
      }
    }
    return boards;
  }

  // ─── Status Transitions ───

  /** Batch update entry status cho 1 draw. Gán version mới cho toàn batch. */
  async batchTransitionByDrawId(
    drawId: string,
    fromStatus: string,
    toStatus: string,
    extraSet?: Record<string, unknown>,
  ): Promise<number> {
    const version = await this.nextVersion();
    const $set: Record<string, unknown> = {
      status: toStatus,
      version,
      updatedAt: new Date(),
      ...extraSet,
    };
    const result = await this.updateMany({ drawId, status: fromStatus }, { $set });
    return result.modifiedCount;
  }

  /**
   * Bulk settle entries: scheduled → settled + ghi result/payout.
   * Mỗi entry có data khác nhau (match result), gom 1 bulkWrite.
   *
   * hasCappablePrize: flag đánh dấu entry có board trúng top prize bậc 8/9/10.
   * Được SettleEntries tính sẵn → ghi vào document để ApplyPayoutCaps query nhanh.
   */
  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      /**
       * true nếu entry có ≥1 board mà pickCount ∈ {8,9,10} VÀ matchCount === pickCount.
       * Dùng cho ApplyPayoutCaps step query index-friendly.
       */
      hasCappablePrize: boolean;
      payout: EntryPayout;
      /** "win" hoặc "loss". */
      outcome: string;
      /** Snapshot kết quả quay gắn vào entry. */
      result: EntryResult;
    }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) {
      return { modifiedCount: 0 };
    }

    const version = await this.nextVersion();
    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.entryId), status: EntryStatus.Scheduled },
        update: {
          $set: {
            status: EntryStatus.Settled,
            result: item.result,
            payout: item.payout,
            outcome: item.outcome,
            // Flag để ApplyPayoutCaps query nhanh: chỉ ghi true khi thực sự có board cappable
            ...(item.hasCappablePrize ? { hasCappablePrize: true } : {}),
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─── Aggregation ───

  /**
   * Aggregate tổng doanh thu và hoa hồng cho 1 draw (exclude voided entries).
   * Group by null — 1 document kết quả, hiệu quả hơn group by tenant
   * khi caller chỉ cần 2 scalar tổng.
   */
  async aggregateTotalRevenue(drawId: string): Promise<{
    totalRevenue: number;
    totalAgentCommission: number;
  }> {
    const result = await this.aggregate([
      { $match: { drawId, status: { $ne: EntryStatus.Void } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalAgentCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);
    const row = result[0] as any;
    return {
      totalRevenue: row?.totalRevenue ?? 0,
      totalAgentCommission: row?.totalAgentCommission ?? 0,
    };
  }

  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalPrizes: number;
  }> {
    const summaryResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $group: {
          _id: null,
          totalSettled: { $sum: 1 },
          totalPrizes: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
    ]);
    const summary = (summaryResult[0] as any) ?? {};
    return {
      totalSettled: summary.totalSettled ?? 0,
      totalPayoutAmount: summary.totalPayoutAmount ?? 0,
      totalPrizes: summary.totalPrizes ?? 0,
    };
  }

  /**
   * Aggregate tổng hợp tài chính entries đã settle cho 1 draw — gộp revenue + payout.
   *
   * Tại thời điểm CalculateFinancials, TẤT CẢ entries đã là Settled
   * (SettleEntries hoàn tất trước đó, chưa có Void) → 1 pipeline với filter
   * { status: Settled } đủ lấy cả revenue, commission lẫn payout metrics.
   * Tiết kiệm 1 DB round-trip so với gọi riêng aggregateTotalRevenue + aggregateSettledPayoutSummary.
   */
  async aggregateSettledFinancialSummary(drawId: string): Promise<SettledFinancialSummary> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
        },
      },
      {
        $group: {
          _id: null,
          totalSettled: { $sum: 1 },
          totalRevenue: { $sum: "$amount" },
          totalAgentCommission: { $sum: "$tenant.commissionAmount" },
          totalPrizes: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
    ]);
    const row = result[0] ?? {};
    return {
      totalSettled: row.totalSettled ?? 0,
      totalRevenue: row.totalRevenue ?? 0,
      totalAgentCommission: row.totalAgentCommission ?? 0,
      totalPrizes: row.totalPrizes ?? 0,
      totalPayoutAmount: row.totalPayoutAmount ?? 0,
    };
  }

  async aggregateTenantReport(
    drawId: string,
    financialDate: string,
  ): Promise<
    Array<{
      tenantId: string;
      totalStake: number;
      totalWin: number;
      totalPayout: number;
      entryCount: number;
      commissionRate: number;
      totalCommission: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId, financialDate } },
      {
        $group: {
          _id: "$tenantId",
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
          entryCount: { $sum: 1 },
          commissionRate: { $first: "$tenant.commissionRate" },
          totalCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      entryCount: r.entryCount,
      commissionRate: r.commissionRate ?? 0,
      totalCommission: r.totalCommission ?? 0,
    }));
  }

  async aggregatePlayerReport(
    drawId: string,
    financialDate: string,
  ): Promise<
    Array<{
      tenantId: string;
      accountId: string;
      totalStake: number;
      totalWin: number;
      totalPayout: number;
      entryCount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId, financialDate } },
      {
        $group: {
          _id: { tenantId: "$tenantId", accountId: "$accountId" },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id.tenantId,
      accountId: r._id.accountId,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      entryCount: r.entryCount,
    }));
  }

  // ─── Payout Caps ───
  //
  // Quy tắc Vietlott Keno: giải thưởng bậc 8/9/10 (trúng hết) có giới hạn mỗi kỳ.
  // Nếu tổng số bộ trúng top prize > ngưỡng cấu hình (maxSetsForFixed),
  // giải mỗi bộ = maxPerDraw / winnerCount (chia đều) thay vì giải cố định.
  //
  // SettleEntries gắn hasCappablePrize = true cho entries cần kiểm tra.
  // Các method dưới đây dùng flag này để query nhanh (index-friendly).

  /**
   * Đếm số bộ (board) trúng top prize cho các bậc cần cap.
   *
   * "Top prize" = board có pickCount === matchCount (trúng hết tất cả số đã chọn):
   *   - pick8 trùng 8/8 (giải cố định 200tr/bộ)
   *   - pick9 trùng 9/9 (giải cố định 800tr/bộ)
   *   - pick10 trùng 10/10 (giải cố định 2 tỷ/bộ)
   *
   * Chỉ đếm entries đã settled và có flag hasCappablePrize = true.
   * Dùng flag để pre-filter trước khi $unwind → giảm khối lượng scan.
   *
   * Sau $unwind, dùng $or match cụ thể từng cặp {pickCount, matchCount}
   * thay vì $expr (không index-friendly) — vì đã pre-filter nên dataset nhỏ.
   *
   * Return: số bộ (KHÔNG phải số entries — 1 entry có thể có 2 boards).
   */
  async aggregateTopPrizeWinnerCounts(drawId: string): Promise<{
    /** Số bộ pick8 trùng 8/8. */
    pick8Match8: number;
    /** Số bộ pick9 trùng 9/9. */
    pick9Match9: number;
    /** Số bộ pick10 trùng 10/10. */
    pick10Match10: number;
  }> {
    const result = await this.aggregate([
      // Pre-filter: chỉ entries đã đánh dấu có board trúng top prize bậc 8/9/10.
      // hasCappablePrize = true → entry có ít nhất 1 board cappable.
      { $match: { drawId, status: EntryStatus.Settled, hasCappablePrize: true } },
      // Tách mảng boardPayouts → 1 document per board
      { $unwind: "$payout.boardPayouts" },
      // Chỉ giữ board trúng hết ở bậc 8/9/10.
      // Dùng $or match cụ thể từng cặp (pickCount, matchCount) thay vì $expr.
      // Lý do: sau pre-filter hasCappablePrize dataset đã rất nhỏ,
      // nhưng 1 entry có thể có 2 boards (A, B) — cần loại board không cappable.
      // Ví dụ: board A = pick10 trùng 10 (cappable), board B = pick3 trùng 2 (không).
      {
        $match: {
          $or: [
            { "payout.boardPayouts.pickCount": 8, "payout.boardPayouts.matchCount": 8 },
            { "payout.boardPayouts.pickCount": 9, "payout.boardPayouts.matchCount": 9 },
            { "payout.boardPayouts.pickCount": 10, "payout.boardPayouts.matchCount": 10 },
          ],
        },
      },
      // Đếm theo pickCount
      {
        $group: {
          _id: "$payout.boardPayouts.pickCount",
          count: { $sum: 1 },
        },
      },
    ]);

    const counts = { pick8Match8: 0, pick9Match9: 0, pick10Match10: 0 };
    for (const row of result) {
      const r = row as any;
      if (r._id === 8) counts.pick8Match8 = r.count;
      else if (r._id === 9) counts.pick9Match9 = r.count;
      else if (r._id === 10) counts.pick10Match10 = r.count;
    }
    return counts;
  }

  /**
   * Lấy batch entries có board trúng top prize bậc 8/9/10 (cursor pagination).
   *
   * Dùng cho ApplyPayoutCaps khi cần update lại winAmount sau khi xác định
   * tổng số bộ trúng vượt ngưỡng. Filter bằng hasCappablePrize = true + $elemMatch
   * để chỉ lấy entries có board đúng bậc cần cap.
   *
   * @param drawId - ID kỳ quay
   * @param pickCount - Bậc cần lấy (8, 9, hoặc 10)
   * @param limit - Số entries tối đa
   * @param lastEntryId - Cursor: lấy entries có _id > lastEntryId (pagination)
   */
  async getCappableEntries(
    drawId: string,
    pickCount: number,
    limit: number,
    lastEntryId?: string,
  ): Promise<TicketEntryEntity[]> {
    const filter: any = {
      drawId,
      status: EntryStatus.Settled,
      hasCappablePrize: true,
      "payout.boardPayouts": {
        $elemMatch: {
          pickCount,
          matchCount: pickCount,
        },
      },
    };
    if (lastEntryId) {
      filter._id = { $gt: new ObjectId(lastEntryId) };
    }
    return await this.findMany(filter, { sort: { _id: 1 }, limit });
  }

  /**
   * Bulk update winAmount cho entries bị cap.
   *
   * Khi tổng số bộ trúng top prize vượt ngưỡng (maxSetsForFixed), giải thưởng
   * mỗi bộ = maxPerDraw / winnerCount. Method này cập nhật:
   *   - payout.boardPayouts[].winAmount cho board bị cap
   *   - payout.winAmount và payout.payoutAmount (tổng mới)
   *
   * Chỉ update entries status = Settled (atomic).
   *
   * @param items - Danh sách entries cần update với giải thưởng đã tính lại
   */
  async bulkApplyPayoutCap(
    items: Array<{
      entryId: string;
      /** Tổng tiền thắng mới sau khi cap. */
      newWinAmount: number;
      /** Tiền trả player mới (= newWinAmount). */
      newPayoutAmount: number;
      /** boardPayouts đã recalc winAmount cho board bị cap. */
      boardPayouts: Array<{
        boardNo: string;
        playType: string;
        matchCount: number | null;
        pickCount: number | null;
        betCount: number;
        winAmount: number;
      }>;
    }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

    const version = await this.nextVersion();
    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.entryId), status: EntryStatus.Settled },
        update: {
          $set: {
            "payout.winAmount": item.newWinAmount,
            "payout.payoutAmount": item.newPayoutAmount,
            "payout.boardPayouts": item.boardPayouts,
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─── Payout Dispatch (enqueue to outbox) ───

  /**
   * Lấy winning entries cho 1 draw để enqueue vào tenant_dispatch_orders.
   *
   * Chỉ trả về fields tối thiểu cần build `TenantDispatchOrderDoc` — giảm payload
   * khi kỳ quay có hàng ngàn winners.
   *
   * Filter: status=Settled + payout.winAmount > 0 + có payoutTx.
   */
  async getWinningEntriesForDispatch(params: {
    drawId: string;
    afterTx?: string;
    limit: number;
  }): Promise<WinningEntryForDispatch[]> {
    const { drawId, afterTx, limit } = params;

    const docs = await this.findManyAsDocuments(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.winAmount": { $gt: 0 },
        "payout.payoutTx": afterTx ? { $gt: afterTx } : { $exists: true },
      },
      {
        sort: { "payout.payoutTx": 1 },
        limit,
        projection: {
          _id: 1,
          tenantId: 1,
          accountId: 1,
          username: 1,
          "entrySummary.ticketNo": 1,
          "payout.payoutAmount": 1,
          "payout.payoutTx": 1,
        },
      },
    );

    return docs.map((d) => ({
      id: d._id.toHexString(),
      tenantId: d.tenantId,
      accountId: d.accountId,
      username: d.username,
      ticketNo: d.entrySummary?.ticketNo ?? "",
      payoutAmount: d.payout?.payoutAmount ?? 0,
      payoutTx: d.payout?.payoutTx,
    }));
  }

  // ─── Void Draw ───

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled.
   */
  async getVoidableEntriesBatch(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Scheduled,
      },
      { sort: { createdAt: 1 }, limit },
    );
  }

  /**
   * Bulk void entries: chuyển status → void, ghi voidInfo.
   * Chỉ update entries đang ở status Scheduled (atomic per entry).
   */
  async bulkVoidEntries(
    items: Array<{ entryId: string; voidInfo: EntryVoidInfo }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

    const version = await this.nextVersion();
    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.entryId), status: EntryStatus.Scheduled },
        update: {
          $set: {
            status: EntryStatus.Void,
            outcome: EntryOutcome.Void,
            voidInfo: item.voidInfo,
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  /** Lấy voided entries cho 1 draw để enqueue refund dispatch. */
  async getVoidedEntriesForDispatch(params: {
    drawId: string;
    afterTx?: string;
    limit: number;
  }): Promise<VoidedEntryForDispatch[]> {
    const { drawId, afterTx, limit } = params;

    const docs = await this.findManyAsDocuments(
      {
        drawId,
        status: EntryStatus.Void,
        "voidInfo.refundAmount": { $gt: 0 },
        "voidInfo.refundTx": afterTx ? { $gt: afterTx } : { $exists: true },
      },
      {
        sort: { "voidInfo.refundTx": 1 },
        limit,
        projection: {
          _id: 1,
          tenantId: 1,
          accountId: 1,
          username: 1,
          "entrySummary.ticketNo": 1,
          "voidInfo.refundAmount": 1,
          "voidInfo.refundTx": 1,
        },
      },
    );

    return docs.map((d) => ({
      id: d._id.toHexString(),
      tenantId: d.tenantId,
      accountId: d.accountId,
      username: d.username,
      ticketNo: d.entrySummary?.ticketNo ?? "",
      refundAmount: d.voidInfo?.refundAmount ?? 0,
      refundTx: d.voidInfo?.refundTx,
    }));
  }

  /** Aggregate tổng kết void cho 1 draw. */
  async aggregateVoidRefundSummary(drawId: string): Promise<{
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
  }> {
    const result = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Void } },
      {
        $group: {
          _id: null,
          totalVoidedEntries: { $sum: 1 },
          totalOriginalAmount: { $sum: "$voidInfo.originalAmount" },
          totalRefundAmount: { $sum: "$voidInfo.refundAmount" },
        },
      },
    ]);
    const summary = result[0] ?? {};
    return {
      totalVoidedEntries: summary.totalVoidedEntries ?? 0,
      totalOriginalAmount: summary.totalOriginalAmount ?? 0,
      totalRefundAmount: summary.totalRefundAmount ?? 0,
    };
  }

  // ─── Ticket Summary Aggregation ───

  /**
   * Batch aggregate summaries cho nhiều tickets cùng lúc.
   * $match ticketId ∈ batch → $group by ticketId → Map<ticketId, summary>.
   * Dùng index idx_ticketId trên entries collection.
   */
  async aggregateTicketSummariesBatch(ticketIds: string[]): Promise<
    Map<
      string,
      {
        settledCount: number;
        voidedCount: number;
        totalWinAmount: number;
        totalVoidedAmount: number;
        totalRefundedAmount: number;
        voidedDrawIds: string[];
      }
    >
  > {
    const result = await this.aggregate([
      { $match: { ticketId: { $in: ticketIds } } },
      {
        $group: {
          _id: "$ticketId",
          settledCount: {
            $sum: { $cond: [{ $eq: ["$status", EntryStatus.Settled] }, 1, 0] },
          },
          voidedCount: {
            $sum: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, 1, 0] },
          },
          totalWinAmount: {
            $sum: { $ifNull: ["$payout.winAmount", 0] },
          },
          totalVoidedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.originalAmount", 0] }, 0],
            },
          },
          totalRefundedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.refundAmount", 0] }, 0],
            },
          },
          voidedDrawIds: {
            $addToSet: {
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$drawId", "$$REMOVE"],
            },
          },
        },
      },
    ]);

    const map = new Map<
      string,
      {
        settledCount: number;
        voidedCount: number;
        totalWinAmount: number;
        totalVoidedAmount: number;
        totalRefundedAmount: number;
        voidedDrawIds: string[];
      }
    >();

    for (const row of result) {
      const r = row as any;
      map.set(r._id, {
        settledCount: r.settledCount ?? 0,
        voidedCount: r.voidedCount ?? 0,
        totalWinAmount: r.totalWinAmount ?? 0,
        totalVoidedAmount: r.totalVoidedAmount ?? 0,
        totalRefundedAmount: r.totalRefundedAmount ?? 0,
        voidedDrawIds: r.voidedDrawIds ?? [],
      });
    }

    return map;
  }

  /**
   * Lấy danh sách distinct ticketIds từ entries của 1 draw.
   * Dùng cho SyncTicketSummaries — biết cần sync ticket nào.
   */
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<ObjectId[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<ObjectId[]>;
  }

  // ─── Settle Summary (denormalize cho player API) ───

  /**
   * Aggregate số bộ trúng theo pickCount × matchCount cho tất cả entries settled.
   *
   * boardPayouts[] giờ bao gồm cả basic + side bet — filter chỉ lấy basic boards
   * (pickCount !== null). Side bet boards có pickCount = null.
   *
   * Pre-filter: chỉ entries có ít nhất 1 board thắng ($elemMatch: winAmount > 0).
   * Sau đó unwind → filter basic boards → group theo {pickCount, matchCount} → đếm boards + lấy prizePerUnit.
   * Dùng bởi CalculateFinancials để denormalize vào draw.settleSummary.basicPrizes.
   */
  async aggregateBasicPrizeSummary(drawId: string): Promise<
    Array<{
      pickCount: number;
      matchCount: number;
      winnerCount: number;
      prizePerUnit: number;
    }>
  > {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          // $elemMatch để index-friendly: chỉ lấy entries có ít nhất 1 board thắng
          "payout.boardPayouts": { $elemMatch: { winAmount: { $gt: 0 } } },
        },
      },
      { $unwind: "$payout.boardPayouts" },
      // Lọc basic boards thắng sau unwind — loại side bet boards (pickCount = null)
      // và boards không thắng (winAmount === 0)
      {
        $match: {
          "payout.boardPayouts.pickCount": { $ne: null },
          "payout.boardPayouts.winAmount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            pickCount: "$payout.boardPayouts.pickCount",
            matchCount: "$payout.boardPayouts.matchCount",
          },
          winnerCount: { $sum: 1 },
          // $max thay vì $first: giải cố định nên mọi doc trong nhóm đều bằng nhau,
          // nhưng $max không phụ thuộc thứ tự document → deterministic hơn $first.
          prizePerUnit: { $max: "$payout.boardPayouts.winAmount" },
        },
      },
      { $sort: { "_id.pickCount": -1, "_id.matchCount": -1 } },
    ]);

    return result.map((r: any) => ({
      pickCount: r._id.pickCount,
      matchCount: r._id.matchCount,
      winnerCount: r.winnerCount,
      prizePerUnit: r.prizePerUnit,
    }));
  }

  /**
   * Aggregate số người trúng side bet (Lớn/Nhỏ, Chẵn/Lẻ) theo {playType, bet}.
   *
   * Side bets nay nằm chung trong `payout.boardPayouts[]` — filter theo playType
   * thuộc KENO_SIDE_BET_PLAY_TYPES ("bigSmall", "evenOdd").
   *
   * Pre-filter: chỉ entries có ít nhất 1 side bet board thắng ($elemMatch: winAmount > 0 + playType in sideBets).
   * Sau đó unwind → group theo {playType, bet} → đếm winners + lấy prizePerUnit.
   * Dùng bởi CalculateFinancials để denormalize vào draw.settleSummary.sideBetPrizes.
   *
   * Một kỳ quay có thể có nhiều bet values trúng trong cùng playType.
   * Ví dụ bigSmall: kết quả 10 lớn + 10 nhỏ → cả "big", "small", "bigSmallDraw" có thể trúng.
   */
  async aggregateSideBetPrizeSummary(drawId: string): Promise<
    Array<{
      playType: string;
      bet: string;
      winnerCount: number;
      prizePerUnit: number;
    }>
  > {
    const sideBetPlayTypes = [...KENO_SIDE_BET_PLAY_TYPES];

    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          // Pre-filter index-friendly: chỉ entries có ít nhất 1 side bet board thắng
          "payout.boardPayouts": {
            $elemMatch: {
              playType: { $in: sideBetPlayTypes },
              winAmount: { $gt: 0 },
            },
          },
        },
      },
      { $unwind: "$payout.boardPayouts" },
      // Lọc board side bet thắng sau unwind (entry có thể mix basic + side bet boards)
      {
        $match: {
          "payout.boardPayouts.playType": { $in: sideBetPlayTypes },
          "payout.boardPayouts.winAmount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            playType: "$payout.boardPayouts.playType",
            bet: "$payout.boardPayouts.bet",
          },
          winnerCount: { $sum: 1 },
          // $max thay vì $first: giải cố định nên mọi doc trong nhóm đều bằng nhau,
          // nhưng $max không phụ thuộc thứ tự document → deterministic hơn $first.
          prizePerUnit: { $max: "$payout.boardPayouts.winAmount" },
        },
      },
      { $sort: { "_id.playType": 1, "_id.bet": 1 } },
    ]);

    return result.map((r: any) => ({
      playType: r._id.playType,
      bet: r._id.bet,
      winnerCount: r.winnerCount,
      prizePerUnit: r.prizePerUnit,
    }));
  }

  // ─── Financial Report Aggregations ──────────────────────────────────────────
  //
  // Các methods dưới đây dùng bởi BuildSettleReport, BuildVoidReport, SyncOutstanding.
  // Keno KHÔNG có lineCount — không aggregate lineCount trong bất kỳ method nào.

  /**
   * Đếm playerCount per tenant cho 1 draw đã settle.
   *
   * Group by {tenantId, accountId} để distinct player per tenant,
   * sau đó group by tenantId → đếm unique players.
   * Dùng song song với aggregateTenantSettleMetrics trong BuildSettleReport.
   */
  async aggregatePlayerCountByTenant(drawId: string): Promise<Array<{ tenantId: string; playerCount: number }>> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
        },
      },
      {
        $group: {
          _id: {
            tenantId: "$tenantId",
            accountId: "$accountId",
          },
        },
      },
      {
        $group: {
          _id: "$_id.tenantId",
          playerCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r) => ({
      tenantId: r._id,
      playerCount: r.playerCount ?? 0,
    }));
  }

  /**
   * Aggregate metrics tài chính per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để build SettleTenantReport[].
   * Keno KHÔNG có lineCount — bỏ qua lineCount trong aggregate.
   */
  async aggregateTenantSettleMetrics(drawId: string): Promise<
    Array<{
      tenantId: string;
      entryCount: number;
      totalStake: number;
      totalWin: number;
      totalPayout: number;
      totalCommission: number;
    }>
  > {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
        },
      },
      {
        $group: {
          _id: "$tenantId",
          entryCount: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
          totalCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);
    return result.map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount ?? 0,
      totalStake: r.totalStake ?? 0,
      totalWin: r.totalWin ?? 0,
      totalPayout: r.totalPayout ?? 0,
      totalCommission: r.totalCommission ?? 0,
    }));
  }

  /**
   * Aggregate metrics tổng hợp cho void report của 1 draw.
   *
   * Đếm entry, player, tenant đã void; tổng tiền cược gốc và tiền hoàn.
   * Dùng bởi BuildVoidReport.
   */
  async aggregateVoidMetrics(drawId: string): Promise<{
    entryCount: number;
    playerCount: number;
    tenantCount: number;
    totalOriginalStake: number;
    totalRefundAmount: number;
  }> {
    // Dùng $facet để chia 1 $match → 3 nhánh tính song song trong server.
    // Tránh $addToSet "$accountId" vào 1 document duy nhất — khi player rất nhiều,
    // array này có thể vượt giới hạn 16MB BSON document và tốn nhiều RAM.
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Void,
        },
      },
      {
        $facet: {
          // Nhánh tài chính: tổng tiền + entryCount (không dùng $addToSet)
          financials: [
            {
              $group: {
                _id: null,
                entryCount: { $sum: 1 },
                totalOriginalStake: { $sum: "$amount" },
                totalRefundAmount: { $sum: { $ifNull: ["$voidInfo.refundAmount", "$amount"] } },
              },
            },
          ],
          // Nhánh đếm distinct players: double-group by accountId → $count
          players: [
            {
              $group: {
                _id: "$accountId",
              },
            },
            {
              $count: "playerCount",
            },
          ],
          // Nhánh đếm distinct tenants: double-group by tenantId → $count
          tenants: [
            {
              $group: {
                _id: "$tenantId",
              },
            },
            {
              $count: "tenantCount",
            },
          ],
        },
      },
    ]);

    const facet = result[0] as any;
    if (!facet || facet.financials?.length === 0) {
      return {
        entryCount: 0,
        playerCount: 0,
        tenantCount: 0,
        totalOriginalStake: 0,
        totalRefundAmount: 0,
      };
    }

    const fin = facet.financials[0];
    return {
      entryCount: fin.entryCount ?? 0,
      playerCount: facet.players[0]?.playerCount ?? 0,
      tenantCount: facet.tenants[0]?.tenantCount ?? 0,
      totalOriginalStake: fin.totalOriginalStake ?? 0,
      totalRefundAmount: fin.totalRefundAmount ?? 0,
    };
  }

  /**
   * Aggregate numerical metrics cho các draws active (status: scheduled, drawId in activeDrawIds).
   *
   * Tách riêng khỏi aggregateOutstandingCountsByDraw để tránh $addToSet lớn trong 1 group.
   * Keno không có lineCount.
   */
  async aggregateOutstandingMetricsByDraw(activeDrawIds: string[]): Promise<OutstandingDrawMetrics[]> {
    const result = await this.aggregate([
      {
        $match: {
          drawId: { $in: activeDrawIds },
          status: EntryStatus.Scheduled,
        },
      },
      {
        $group: {
          _id: "$drawId",
          financialDate: { $first: "$financialDate" },
          entryCount: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          estimatedCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return result.map((r) => ({
      drawId: r._id as string,
      financialDate: r.financialDate,
      entryCount: r.entryCount,
      totalStake: r.totalStake,
      estimatedCommission: r.estimatedCommission ?? 0,
    }));
  }

  /**
   * Đếm unique players và tenants per draw, dùng double-$group để tránh tích luỹ mảng lớn.
   *
   * Bước 1: group by (drawId, accountId, tenantId) → unique combinations.
   * Bước 2: group by drawId → đếm số combination (playerCount) và $addToSet tenantId (an toàn vì ít tenants).
   */
  async aggregateOutstandingCountsByDraw(activeDrawIds: string[]): Promise<OutstandingDrawCounts[]> {
    const result = await this.aggregate([
      {
        $match: {
          drawId: { $in: activeDrawIds },
          status: EntryStatus.Scheduled,
        },
      },
      {
        // Bước 1: dedup (drawId, accountId, tenantId) — 1 document = 1 unique player trong 1 draw
        $group: {
          _id: { drawId: "$drawId", accountId: "$accountId", tenantId: "$tenantId" },
        },
      },
      {
        // Bước 2: count players và collect tenantIds (ít tenants → $addToSet an toàn)
        $group: {
          _id: "$_id.drawId",
          playerCount: { $sum: 1 },
          tenants: { $addToSet: "$_id.tenantId" },
        },
      },
    ]);

    return result.map((r) => ({
      drawId: r._id as string,
      playerCount: r.playerCount ?? 0,
      tenantCount: r.tenants?.length ?? 0,
    }));
  }

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  /**
   * Lấy N entries mới nhất của một kỳ quay cho live feed.
   *
   * Sort createdAt desc để hiện entries vừa đặt trước.
   * Dùng projection để tránh truyền cả payout (nặng) sang UI.
   */
  async getLatestEntriesByDrawId(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ drawId }, { sort: { createdAt: -1 }, limit });
  }

  /**
   * Lấy entries trúng thưởng của một kỳ quay (cursor pagination).
   *
   * Filter: payout.winAmount > 0 (entries thực sự trúng).
   * Sort: payout.winAmount desc để entries trúng lớn hiện trước.
   */
  async getWinningEntries(drawId: string, cursor?: string, limit?: number): Promise<TicketEntryEntity[]> {
    const pageSize = Math.min(limit ?? 50, 200);
    const filter: Record<string, unknown> = {
      drawId,
      "payout.winAmount": { $gt: 0 },
    };
    if (cursor) {
      // cursor = _id của record cuối trang trước (ObjectId hex)
      filter._id = { $lt: new ObjectId(cursor) };
    }
    return await this.findMany(filter, {
      sort: { "payout.winAmount": -1, _id: -1 },
      limit: pageSize,
    });
  }

  /**
   * Aggregate summary tổng kết entries trúng thưởng.
   *
   * Đếm winning entries, tổng win amount, đếm capped entries.
   * Dùng song song với getWinningEntries để hiển thị summary bar.
   */
  async getWinningEntriesSummary(drawId: string): Promise<{
    totalWinningEntries: number;
    totalWinAmount: number;
    cappedEntries: number;
  }> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          "payout.winAmount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          totalWinningEntries: { $sum: 1 },
          totalWinAmount: { $sum: "$payout.winAmount" },
          // cappedEntries: entries có hasCappablePrize = true (bậc 8/9/10 bị cap)
          cappedEntries: { $sum: { $cond: ["$hasCappablePrize", 1, 0] } },
        },
      },
    ]);

    const row = result[0] as any;
    return {
      totalWinningEntries: row?.totalWinningEntries ?? 0,
      totalWinAmount: row?.totalWinAmount ?? 0,
      cappedEntries: row?.cappedEntries ?? 0,
    };
  }

  // ─── Financial Report READ Methods ──────────────────────────────────────────

  /**
   * Aggregate players theo draw và tenant — dùng cho drill-down level 3.
   *
   * Keno KHÔNG có lineCount.
   * Group by {accountId} scoped by {drawId, tenantId} → distinct player rows.
   */
  async aggregatePlayersByDrawAndTenant(
    drawId: string,
    tenantId: string,
  ): Promise<
    Array<{
      accountId: string;
      username: string;
      entryCount: number;
      totalStake: number;
      totalWin: number;
      totalPayout: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId, tenantId } },
      {
        $group: {
          _id: "$accountId",
          username: { $first: "$username" },
          entryCount: { $sum: 1 },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
      { $sort: { totalStake: -1 } },
    ]);
    return (result as any[]).map((r) => ({
      accountId: r._id,
      username: r.username ?? r._id,
      entryCount: r.entryCount,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
    }));
  }

  /**
   * Lấy entries của 1 player trong 1 draw × tenant — dùng cho drill-down level 4.
   *
   * Keno: không có lineCount trên TicketEntryDoc.
   */
  async findByDrawTenantPlayer(drawId: string, tenantId: string, accountId: string): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId, tenantId, accountId }, { sort: { createdAt: 1 } });
  }
}
