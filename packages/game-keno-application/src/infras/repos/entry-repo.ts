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

import { KenoCollections, PayoutStatus, RefundStatus } from "@megawin/game-keno/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
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

  async getEntriesByDrawId(drawId: string, page: number, size: number): Promise<EntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  async getScheduledEntriesBatch(
    drawId: string,
    page: number,
    size: number,
  ): Promise<EntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  async getScheduledEntries(drawId: string, limit: number): Promise<EntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async getEntriesByTicketId(ticketId: string): Promise<EntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawTime: 1 } });
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
      payout: {
        /** Tổng tiền thắng (giải cố định, chưa qua cap). */
        winAmount: number;
        /** Tiền trả cho player (= winAmount, ApplyPayoutCaps có thể giảm sau). */
        payoutAmount: number;
        /** Chi tiết kết quả từng board cách chơi cơ bản. */
        boardPayouts: Array<{
          boardNo: string;
          playType: string;
          matchCount: number;
          pickCount: number;
          winAmount: number;
        }>;
        /** Chi tiết kết quả từng side bet. */
        sideBetPayouts: Array<{
          playType: string;
          bet: string;
          outcome: string;
          isWin: boolean;
          winAmount: number;
        }>;
        settledAt: Date;
        payoutStatus?: string;
      };
      /** "win" hoặc "loss". */
      outcome: string;
      /** Snapshot kết quả quay gắn vào entry. */
      result: {
        winningNumbers: string[];
        publishedAt: Date;
        bigCount: number;
        smallCount: number;
        evenCount: number;
        oddCount: number;
      };
    }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

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

  async aggregateRevenueByTenant(drawId: string): Promise<
    Array<{
      tenantId: string;
      revenue: number;
      commission: number;
      entryCount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId, status: { $ne: EntryStatus.Void } } },
      {
        $group: {
          _id: "$tenantId",
          revenue: { $sum: "$amount" },
          commission: { $sum: "$tenant.commissionAmount" },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      revenue: r.revenue,
      commission: r.commission ?? 0,
      entryCount: r.entryCount,
    }));
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
  ): Promise<EntryEntity[]> {
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
        matchCount: number;
        pickCount: number;
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

  // ─── Payout Dispatch ───

  async getPendingPayoutEntries(drawId: string, limit: number): Promise<EntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.winAmount": { $gt: 0 },
        $or: [
          { "payout.payoutStatus": PayoutStatus.Pending },
          { "payout.payoutStatus": PayoutStatus.Failed },
          { "payout.payoutStatus": { $exists: false } },
        ],
      },
      { sort: { tenantId: 1, createdAt: 1 }, limit },
    );
  }

  async countPendingPayoutEntries(drawId: string): Promise<number> {
    return await this.count({
      drawId,
      status: EntryStatus.Settled,
      "payout.winAmount": { $gt: 0 },
      $or: [
        { "payout.payoutStatus": PayoutStatus.Pending },
        { "payout.payoutStatus": PayoutStatus.Failed },
        { "payout.payoutStatus": { $exists: false } },
      ],
    });
  }

  async batchMarkPayoutDispatched(entryIds: string[]): Promise<number> {
    const objectIds = entryIds.map((id) => new ObjectId(id));
    const result = await this.updateMany(
      { _id: { $in: objectIds } as any },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Dispatched,
          "payout.payoutDispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return result.modifiedCount;
  }

  async batchMarkPayoutFailed(entryIds: string[], error: string): Promise<number> {
    const objectIds = entryIds.map((id) => new ObjectId(id));
    const result = await this.updateMany(
      { _id: { $in: objectIds } as any },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Failed,
          "payout.payoutLastError": error,
          updatedAt: new Date(),
        },
        $inc: { "payout.payoutRetryCount": 1 },
      },
    );
    return result.modifiedCount;
  }

  // ─── Void Draw ───

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled.
   */
  async getVoidableEntriesBatch(drawId: string, limit: number): Promise<EntryEntity[]> {
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
    items: Array<{ entryId: string; amount: number }>,
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
            voidInfo: {
              originalAmount: item.amount,
              refundAmount: item.amount,
              refundStatus: RefundStatus.Pending,
              voidedAt: now,
            },
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  /** Lấy entries đã void nhưng chưa hoàn tiền. */
  async getPendingRefundEntries(drawId: string, limit: number): Promise<EntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Void,
        "voidInfo.refundStatus": {
          $in: [RefundStatus.Pending, RefundStatus.Failed],
        },
      },
      { sort: { createdAt: 1 }, limit },
    );
  }

  /** Đánh dấu entry đã dispatch refund thành công. */
  async markRefundDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": RefundStatus.Dispatched,
          "voidInfo.refundedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Đánh dấu entry refund thất bại. */
  async markRefundFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": RefundStatus.Failed,
          "voidInfo.refundLastError": error,
          updatedAt: new Date(),
        },
      },
    );
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
    const summary = (result[0] as any) ?? {};
    return {
      totalVoidedEntries: summary.totalVoidedEntries ?? 0,
      totalOriginalAmount: summary.totalOriginalAmount ?? 0,
      totalRefundAmount: summary.totalRefundAmount ?? 0,
    };
  }

  // ─── Ticket Summary Aggregation ───

  /**
   * Aggregate tóm tắt ticket từ TẤT CẢ entries của 1 ticket.
   * Dùng cho SyncTicketSummaries — tính lại toàn bộ từ source of truth (entries).
   */
  async aggregateTicketSummary(ticketId: ObjectId): Promise<{
    totalEntries: number;
    settledCount: number;
    voidedCount: number;
    totalWinAmount: number;
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawIds: string[];
  }> {
    const result = await this.aggregate([
      { $match: { ticketId } },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
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
              $cond: [
                { $eq: ["$status", EntryStatus.Void] },
                { $ifNull: ["$voidInfo.originalAmount", 0] },
                0,
              ],
            },
          },
          totalRefundedAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", EntryStatus.Void] },
                { $ifNull: ["$voidInfo.refundAmount", 0] },
                0,
              ],
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

    const row = (result[0] as any) ?? {};
    return {
      totalEntries: row.totalEntries ?? 0,
      settledCount: row.settledCount ?? 0,
      voidedCount: row.voidedCount ?? 0,
      totalWinAmount: row.totalWinAmount ?? 0,
      totalVoidedAmount: row.totalVoidedAmount ?? 0,
      totalRefundedAmount: row.totalRefundedAmount ?? 0,
      voidedDrawIds: row.voidedDrawIds ?? [],
    };
  }

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
              $cond: [
                { $eq: ["$status", EntryStatus.Void] },
                { $ifNull: ["$voidInfo.originalAmount", 0] },
                0,
              ],
            },
          },
          totalRefundedAmount: {
            $sum: {
              $cond: [
                { $eq: ["$status", EntryStatus.Void] },
                { $ifNull: ["$voidInfo.refundAmount", 0] },
                0,
              ],
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

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<EntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }
}
