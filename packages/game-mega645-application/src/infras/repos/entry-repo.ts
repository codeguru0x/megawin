/**
 * Mega 6/45 – Entry Repository
 *
 * Collection: mega645_ticket_entries
 *
 * Tất cả MongoDB queries liên quan đến entries đều nằm ở đây.
 * Use cases và handlers KHÔNG được gọi aggregate/updateMany trực tiếp.
 *
 * VERSION TRACKING:
 * Mỗi khi entry thay đổi trạng thái business (insert, status transition, settle, void),
 * field `version` được gán 1 giá trị mới từ global entryChangeSeq.
 * Worker sync-entry-feed dùng `version` để detect changes → copy sang entryFeed.
 *
 * Payout/refund dispatch KHÔNG bump version vì đây chỉ là trạng thái giao dịch
 * nội bộ, không thay đổi kết quả thắng thua hay số tiền trong báo cáo tenant.
 */

import {
  Mega645Collections,
  PayoutStatus,
  PrizeTier,
  type EntryPayout,
  type EntryVoidInfo,
  type EntryResult,
} from "@megawin/game-mega645/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type { TicketEntryDoc } from "@megawin/game-mega645/entities";
import type { PlayerBreakdownRow, OutstandingDrawMetrics, OutstandingDrawCounts } from "./types";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Mega645Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. Dùng cho place-bet, settle, void... */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  /**
   * Insert 1 entry mới kèm version từ global sequence.
   * Tự allocate version — dùng khi chỉ cần insert đơn lẻ.
   */
  async insertEntry(doc: Record<string, unknown>): Promise<string> {
    const version = await this.nextVersion();
    return await this.insertOne({ ...doc, version } as any);
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

  // ─────────────────────────────────────────────
  // Query
  // ─────────────────────────────────────────────

  async getEntryById(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawId: 1 } });
  }

  async getEntriesByDrawId(
    drawId: string,
    page: number,
    size: number,
  ): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy batch entries theo drawId + status (cho settle batch loop). */
  async getScheduledEntriesBatch(
    drawId: string,
    page: number,
    size: number,
  ): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy entries scheduled cho settle batch — query đơn giản hơn paging. */
  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async countLinesByDrawId(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId } },
      { $group: { _id: null, total: { $sum: "$lineCount" } } },
    ]);
    return (result[0] as any)?.total ?? 0;
  }

  // ─────────────────────────────────────────────
  // Status Transitions
  // ─────────────────────────────────────────────

  /**
   * Batch update entry status cho 1 draw.
   * Tất cả entries trong batch nhận cùng 1 version mới (1 event thay đổi).
   */
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

  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      payout: EntryPayout;
      outcome: EntryOutcome;
      result: EntryResult;
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
            payout: item.payout,
            outcome: item.outcome,
            result: item.result,
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─────────────────────────────────────────────
  // Aggregation (settle financials / report)
  // ─────────────────────────────────────────────

  /**
   * Aggregate tổng doanh thu và hoa hồng cho 1 draw (exclude voided entries).
   * Group by null — 1 document kết quả, hiệu quả hơn aggregateRevenueByTenant
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

  /**
   * Aggregate tổng tiền giải cố định + tier counts từ settled entries.
   * Tính lại từ DB – không phụ thuộc accumulator.
   * Dùng cho calculate-financials sau khi settle xong.
   */
  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    /** Tổng số lines đã expand và match (sum hitCount tất cả tiers). */
    totalLines: number;
    /** Số lượt trúng per tier. Key = PrizeTier (vd. "jackpot", "tier1", ...). */
    tierWinnerCounts: Partial<Record<PrizeTier, number>>;
    /** Tổng tiền thưởng đã tính theo tier (VND). Key = PrizeTier. Jackpot = 0 tại bước này. */
    tierPrizeAmounts: Partial<Record<PrizeTier, number>>;
  }> {
    // 1 aggregation duy nhất: facet song song tiers và totals trên cùng $match.
    const facetResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $facet: {
          tiers: [
            { $unwind: "$payout.tiers" },
            {
              $group: {
                _id: "$payout.tiers.tier",
                totalHitCount: { $sum: "$payout.tiers.hitCount" },
                totalAmount: { $sum: "$payout.tiers.amount" },
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalSettled: { $sum: 1 },
                totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
                // totalLines = tổng hitCount tất cả entries × tất cả tiers
                // (số lines đã expand và match, tương đương countLinesByDrawId).
                totalLines: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ["$payout.tiers", []] },
                      initialValue: 0,
                      in: { $add: ["$$value", "$$this.hitCount"] },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    ]);

    const { tiers = [], totals = [] } = (facetResult[0] as any) ?? {};
    const summary = totals[0] ?? {};

    let totalFixedPrizes = 0;
    const tierWinnerCounts: Partial<Record<PrizeTier, number>> = {};
    const tierPrizeAmounts: Partial<Record<PrizeTier, number>> = {};

    for (const r of tiers as any[]) {
      tierWinnerCounts[r._id as PrizeTier] = r.totalHitCount;
      tierPrizeAmounts[r._id as PrizeTier] = r.totalAmount;
      if (r._id !== PrizeTier.Jackpot) {
        totalFixedPrizes += r.totalAmount;
      }
    }

    return {
      totalSettled: summary.totalSettled ?? 0,
      totalPayoutAmount: summary.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      totalLines: summary.totalLines ?? 0,
      tierWinnerCounts,
      tierPrizeAmounts,
    };
  }

  /** Aggregate report per tenant cho 1 draw + financialDate. */
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

  /** Aggregate report per player per tenant cho 1 draw + financialDate. */
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

  // ─────────────────────────────────────────────
  // Payout Dispatch
  // ─────────────────────────────────────────────

  /**
   * Lấy batch entries trúng thưởng chưa dispatch (hoặc failed) cho 1 draw.
   * Dùng cho payout worker loop.
   */
  async getPendingPayoutEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
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

  /** Đếm entries chưa dispatch xong cho 1 draw. */
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

  /** Đánh dấu entry đã dispatch thành công (không bump version — operational only). */
  async markPayoutDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Dispatched,
          "payout.payoutDispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Đánh dấu entry dispatch thất bại + ghi lỗi (không bump version). */
  async markPayoutFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Failed,
          "payout.payoutLastError": error,
          updatedAt: new Date(),
        },
        $inc: { "payout.payoutRetryCount": 1 },
      },
    );
  }

  /** Batch đánh dấu dispatched cho nhiều entries (không bump version). */
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

  /** Batch đánh dấu failed cho nhiều entries (không bump version). */
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

  // ─────────────────────────────────────────────
  // Void Draw
  // ─────────────────────────────────────────────

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled (chưa settled, chưa void).
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

  /**
   * Lấy entries đã void nhưng chưa hoàn tiền cho 1 draw.
   * Dùng cho refund dispatch loop.
   */
  async getPendingRefundEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Void,
        "voidInfo.refundStatus": { $in: ["pending", "failed"] },
      },
      { sort: { createdAt: 1 }, limit },
    );
  }

  /** Đánh dấu entry đã dispatch refund thành công (không bump version). */
  async markRefundDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": "dispatched",
          "voidInfo.refundedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Đánh dấu entry refund thất bại (không bump version). */
  async markRefundFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": "failed",
          "voidInfo.refundLastError": error,
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Aggregate tổng tiền hoàn trả cho 1 draw bị void. */
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

  // ─────────────────────────────────────────────
  // Ticket Summary Aggregation
  // ─────────────────────────────────────────────

  /**
   * Aggregate tóm tắt ticket từ TẤT CẢ entries của 1 ticket.
   * Dùng cho SyncTicketSummaries — tính lại toàn bộ từ source of truth (entries).
   */
  async aggregateTicketSummary(ticketId: string): Promise<{
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
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<string[]> {
    return this.distinct("ticketId", { drawId }) as Promise<string[]>;
  }

  // ─────────────────────────────────────────────
  // Feed Sync (cho worker sync-entry-feed)
  // ─────────────────────────────────────────────

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─────────────────────────────────────────────
  // Aggregation (report)
  // ─────────────────────────────────────────────

  /**
   * Aggregate số player unique per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để tính playerCount per tenant.
   * 2-level group: { tenantId, accountId } → { tenantId } → playerCount.
   */
  async aggregatePlayerCountByTenant(
    drawId: string,
  ): Promise<Array<{ tenantId: string; playerCount: number }>> {
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
      playerCount: r.playerCount,
    }));
  }

  /**
   * Aggregate metrics tài chính per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để build SettleTenantReport[].
   * Lấy: entryCount, lineCount, totalStake, totalWin, totalPayout, totalCommission.
   */
  async aggregateTenantSettleMetrics(drawId: string): Promise<
    Array<{
      tenantId: string;
      entryCount: number;
      lineCount: number;
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
          lineCount: { $sum: "$lineCount" },
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
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake ?? 0,
      totalWin: r.totalWin ?? 0,
      totalPayout: r.totalPayout ?? 0,
      totalCommission: r.totalCommission ?? 0,
    }));
  }

  /**
   * Aggregate void metrics per draw — dùng bởi BuildVoidReportUseCase.
   *
   * Lấy: entryCount, playerCount, tenantCount, totalOriginalStake, totalRefundAmount.
   */
  async aggregateVoidMetrics(drawId: string): Promise<{
    entryCount: number;
    playerCount: number;
    tenantCount: number;
    totalOriginalStake: number;
    totalRefundAmount: number;
  }> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Void,
        },
      },
      {
        $group: {
          _id: null,
          entryCount: { $sum: 1 },
          players: { $addToSet: "$accountId" },
          tenants: { $addToSet: "$tenantId" },
          totalOriginalStake: { $sum: "$amount" },
          totalRefundAmount: { $sum: { $ifNull: ["$void.refundAmount", "$amount"] } },
        },
      },
    ]);

    if (result.length === 0) {
      return {
        entryCount: 0,
        playerCount: 0,
        tenantCount: 0,
        totalOriginalStake: 0,
        totalRefundAmount: 0,
      };
    }

    const r = result[0] as any;
    return {
      entryCount: r.entryCount,
      playerCount: r.players?.length ?? 0,
      tenantCount: r.tenants?.length ?? 0,
      totalOriginalStake: r.totalOriginalStake,
      totalRefundAmount: r.totalRefundAmount,
    };
  }

  /**
   * Aggregate numerical metrics cho các draws active (status: scheduled, drawId in activeDrawIds).
   *
   * Tách riêng khỏi aggregateOutstandingCountsByDraw để tránh $addToSet lớn trong 1 group.
   * Mega645 có lineCount (expanded lines từ bao).
   */
  async aggregateOutstandingMetricsByDraw(
    activeDrawIds: string[],
  ): Promise<OutstandingDrawMetrics[]> {
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
          lineCount: { $sum: "$lineCount" },
          totalStake: { $sum: "$amount" },
          estimatedCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      drawId: r._id,
      financialDate: r.financialDate,
      entryCount: r.entryCount,
      lineCount: r.lineCount ?? 0,
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
  async aggregateOutstandingCountsByDraw(
    activeDrawIds: string[],
  ): Promise<OutstandingDrawCounts[]> {
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

  // ─────────────────────────────────────────────
  // Jackpot Winners
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // Operations Dashboard – Query methods
  // ─────────────────────────────────────────────

  /**
   * Lấy N entries mới nhất của một kỳ quay (cho live feed).
   * Sort createdAt desc → entries mới nhất lên đầu.
   */
  async getLatestEntriesByDrawId(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId }, { sort: { createdAt: -1 }, limit });
  }

  /**
   * Lấy danh sách entries trúng thưởng của 1 kỳ quay (cursor-based).
   *
   * Chỉ trả về entries đã settle với winAmount > 0.
   * cursorId: entryId của record cuối trang trước (ObjectId gt).
   */
  async getWinningEntries(
    drawId: string,
    limit: number,
    cursorId?: string,
  ): Promise<TicketEntryEntity[]> {
    const filter: Record<string, unknown> = {
      drawId,
      status: EntryStatus.Settled,
      outcome: EntryOutcome.Win,
    };
    if (cursorId) {
      filter._id = { $gt: new ObjectId(cursorId) };
    }
    return this.findMany(filter, { sort: { _id: 1 }, limit });
  }

  /**
   * Tính tổng hợp entries trúng thưởng của 1 kỳ quay.
   * Trả về: tổng entries trúng, tổng lines trúng, tổng tiền thưởng.
   */
  async getWinningEntriesSummary(drawId: string): Promise<{
    totalWinningEntries: number;
    totalWinningLines: number;
    totalWinAmount: number;
  }> {
    const result = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled, outcome: EntryOutcome.Win } },
      {
        $group: {
          _id: null,
          totalWinningEntries: { $sum: 1 },
          totalWinningLines: {
            $sum: {
              $reduce: {
                input: { $ifNull: ["$payout.tiers", []] },
                initialValue: 0,
                in: { $add: ["$$value", "$$this.hitCount"] },
              },
            },
          },
          totalWinAmount: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
        },
      },
      { $project: { _id: 0, totalWinningEntries: 1, totalWinningLines: 1, totalWinAmount: 1 } },
    ]);
    const row = (result[0] as any) ?? {};
    return {
      totalWinningEntries: row.totalWinningEntries ?? 0,
      totalWinningLines: row.totalWinningLines ?? 0,
      totalWinAmount: row.totalWinAmount ?? 0,
    };
  }

  // ─────────────────────────────────────────────
  // Operations Dashboard – Aggregation methods
  // ─────────────────────────────────────────────

  private buildOpsFilter(opts: { financialDate: string; drawId?: string }) {
    const filter: Record<string, unknown> = {
      financialDate: opts.financialDate,
      status: { $ne: EntryStatus.Void },
    };
    if (opts.drawId) filter.drawId = opts.drawId;
    return filter;
  }

  /**
   * Tổng hợp KPI cho dashboard vận hành: revenue, entries, lines, players, commission, payout.
   * Filter theo financialDate (hoặc kết hợp với drawId).
   */
  async aggregateOpsSummary(opts: { financialDate: string; drawId?: string }): Promise<{
    totalRevenue: number;
    totalEntries: number;
    totalLines: number;
    uniquePlayers: number;
    totalCommission: number;
    totalPayout: number;
  }> {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalEntries: { $sum: 1 },
          totalLines: { $sum: "$lineCount" },
          uniquePlayers: { $addToSet: "$accountId" },
          totalCommission: { $sum: "$tenant.commissionAmount" },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalEntries: 1,
          totalLines: 1,
          uniquePlayers: { $size: "$uniquePlayers" },
          totalCommission: 1,
          totalPayout: 1,
        },
      },
    ]);
    const row = (result[0] as any) ?? {};
    return {
      totalRevenue: row.totalRevenue ?? 0,
      totalEntries: row.totalEntries ?? 0,
      totalLines: row.totalLines ?? 0,
      uniquePlayers: row.uniquePlayers ?? 0,
      totalCommission: row.totalCommission ?? 0,
      totalPayout: row.totalPayout ?? 0,
    };
  }

  /**
   * Phân tích doanh thu theo đại lý (tenant breakdown).
   * Sort theo revenue desc.
   */
  async aggregateTenantBreakdown(opts: { financialDate: string; drawId?: string }): Promise<
    Array<{
      tenantId: string;
      entries: number;
      lines: number;
      players: number;
      revenue: number;
      commission: number;
      payout: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      {
        $group: {
          _id: "$tenantId",
          entries: { $sum: 1 },
          lines: { $sum: "$lineCount" },
          players: { $addToSet: "$accountId" },
          revenue: { $sum: "$amount" },
          commission: { $sum: "$tenant.commissionAmount" },
          payout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          tenantId: "$_id",
          entries: 1,
          lines: 1,
          players: { $size: "$players" },
          revenue: 1,
          commission: 1,
          payout: 1,
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    return result as any[];
  }

  /**
   * Tần suất xuất hiện của từng số trong các bộ cược.
   *
   * Mega 6/45: chỉ có mainNumbers (01-45), không có specialNumbers.
   * Với mỗi số:
   * - count   = số boards chứa số đó
   * - lines   = tổng expandedLines của những boards đó
   * - entries = số entries distinct có board chứa số đó
   * - revenue = xấp xỉ doanh thu từ boards chứa số đó
   */
  async aggregateNumberFrequency(opts: { financialDate: string; drawId?: string }): Promise<{
    mainNumbers: Array<{
      number: string;
      count: number;
      lines: number;
      entries: number;
      revenue: number;
    }>;
  }> {
    const filter = this.buildOpsFilter(opts);

    // Revenue xấp xỉ: phân bổ entry.amount theo tỉ lệ expandedLines của board
    const revenueExpr = {
      $multiply: [
        "$amount",
        {
          $cond: [
            { $gt: ["$lineCount", 0] },
            { $divide: ["$entrySummary.boards.expandedLines", "$lineCount"] },
            0,
          ],
        },
      ],
    };

    const mainResult = await this.aggregate([
      { $match: filter },
      { $unwind: "$entrySummary.boards" },
      { $unwind: "$entrySummary.boards.mainNumbers" },
      {
        $group: {
          _id: "$entrySummary.boards.mainNumbers",
          count: { $sum: 1 },
          lines: { $sum: "$entrySummary.boards.expandedLines" },
          entryIds: { $addToSet: "$_id" },
          revenue: { $sum: revenueExpr },
        },
      },
      {
        $project: {
          _id: 0,
          number: "$_id",
          count: 1,
          lines: 1,
          entries: { $size: "$entryIds" },
          revenue: { $round: ["$revenue", 0] },
        },
      },
      { $sort: { number: 1 } },
    ]);

    return {
      mainNumbers: (mainResult as any[]).map((r) => ({
        number: r.number,
        count: r.count,
        lines: r.lines,
        entries: r.entries,
        revenue: r.revenue ?? 0,
      })),
    };
  }

  /**
   * Top combos (bộ số phổ biến nhất) trong một kỳ quay.
   *
   * Mega 6/45: combo key = `${playType}|${sortedMain.join(",")}` (không có specialNumbers).
   * Sort entryCount desc → trả top N.
   */
  async aggregateTopCombos(opts: { drawId: string; limit?: number }): Promise<
    Array<{
      playType: string;
      mainNumbers: string[];
      entryCount: number;
      totalAmount: number;
    }>
  > {
    const limit = Math.min(opts.limit ?? 10, 20);

    const result = await this.aggregate([
      { $match: { drawId: opts.drawId } },
      { $unwind: "$entrySummary.boards" },
      {
        $project: {
          // Key dùng để group: playType + sorted mainNumbers
          comboKey: {
            $concat: [
              "$entrySummary.boards.playType",
              "|",
              {
                $reduce: {
                  input: { $sortArray: { input: "$entrySummary.boards.mainNumbers", sortBy: 1 } },
                  initialValue: "",
                  in: {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$this",
                      { $concat: ["$$value", ",", "$$this"] },
                    ],
                  },
                },
              },
            ],
          },
          playType: "$entrySummary.boards.playType",
          mainNumbers: {
            $sortArray: { input: "$entrySummary.boards.mainNumbers", sortBy: 1 },
          },
          expandedLines: "$entrySummary.boards.expandedLines",
          entryAmount: "$amount",
          entryLineCount: "$lineCount",
        },
      },
      {
        $group: {
          _id: "$comboKey",
          playType: { $first: "$playType" },
          mainNumbers: { $first: "$mainNumbers" },
          entryIds: { $addToSet: "$_id" },
          totalAmount: {
            $sum: {
              $multiply: [
                "$entryAmount",
                {
                  $cond: [
                    { $gt: ["$entryLineCount", 0] },
                    { $divide: ["$expandedLines", "$entryLineCount"] },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          playType: 1,
          mainNumbers: 1,
          entryCount: { $size: "$entryIds" },
          totalAmount: { $round: ["$totalAmount", 0] },
        },
      },
      { $sort: { entryCount: -1, totalAmount: -1 } },
      { $limit: limit },
    ]);

    return result as Array<{
      playType: string;
      mainNumbers: string[];
      entryCount: number;
      totalAmount: number;
    }>;
  }

  /**
   * Phân bổ cược theo kiểu chơi (PlayType).
   *
   * Tổng hợp boardCount, lineCount, entryCount, revenue.
   * Revenue là xấp xỉ — phân bổ theo tỷ lệ lines vì entry.amount không tách riêng theo board.
   */
  async aggregatePlayTypeDistribution(opts: { financialDate: string; drawId?: string }): Promise<
    Array<{
      playType: string;
      boardCount: number;
      lineCount: number;
      entryCount: number;
      revenue: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      { $unwind: "$entrySummary.boards" },
      {
        $group: {
          _id: "$entrySummary.boards.playType",
          boardCount: { $sum: 1 },
          lineCount: { $sum: "$entrySummary.boards.expandedLines" },
          // distinct entry IDs để đếm số entries có kiểu chơi này
          entryIds: { $addToSet: "$_id" },
          // xấp xỉ revenue: tổng (entry.amount × board.expandedLines / entry.lineCount)
          revenue: {
            $sum: {
              $multiply: [
                "$amount",
                {
                  $cond: [
                    { $gt: ["$lineCount", 0] },
                    { $divide: ["$entrySummary.boards.expandedLines", "$lineCount"] },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          playType: "$_id",
          boardCount: 1,
          lineCount: 1,
          entryCount: { $size: "$entryIds" },
          revenue: { $round: ["$revenue", 0] },
        },
      },
      { $sort: { lineCount: -1 } },
    ]);
    return (result as any[]).map((r) => ({
      playType: r.playType,
      boardCount: r.boardCount,
      lineCount: r.lineCount,
      entryCount: r.entryCount,
      revenue: r.revenue,
    }));
  }

  /**
   * Tìm entries trúng giải Jackpot trong 1 draw.
   * Jackpot = có payout.tiers chứa tier "jackpot" với hitCount > 0.
   */
  async findJackpotWinners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findMany({
      drawId,
      "payout.tiers": {
        $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 } },
      },
    });
  }

  // ─────────────────────────────────────────────
  // Jackpot Prize Patch
  // ─────────────────────────────────────────────

  /**
   * Patch jackpotPerWinner vào tất cả entries trúng Jackpot trong draw.
   *
   * Idempotent: chỉ update entries có tiers[jackpot].amount = 0
   * (chưa được patch). Entries đã patch (amount > 0) sẽ bị skip.
   *
   * Returns số entries đã patch.
   */
  async patchJackpotPrize(drawId: string, jackpotPerWinner: number): Promise<number> {
    const filter = {
      drawId,
      status: EntryStatus.Settled,
      outcome: EntryOutcome.Win,
      "payout.tiers": {
        $elemMatch: {
          tier: PrizeTier.Jackpot,
          hitCount: { $gt: 0 },
          amount: 0,
        },
      },
    };

    const matchingEntries = await this.findManyAsDocuments(filter, {
      projection: { _id: 1, "payout.tiers": 1 },
    });

    if (matchingEntries.length === 0) return 0;

    const ops = matchingEntries.map((entry) => {
      const tiers = (entry.payout as any)?.tiers ?? [];
      const jpTier = tiers.find(
        (t: any) => t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0,
      );
      const hitCount = jpTier?.hitCount ?? 0;
      const prizeAmount = jackpotPerWinner * hitCount;

      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0) {
          return { ...t, unitAmount: jackpotPerWinner, amount: prizeAmount };
        }
        return t;
      });

      return {
        updateOne: {
          filter: {
            _id: entry._id,
            "payout.tiers": {
              $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 }, amount: 0 },
            },
          },
          update: {
            $set: {
              "payout.tiers": updatedTiers,
              "payout.winAmount": prizeAmount,
              "payout.payoutAmount": prizeAmount,
              updatedAt: new Date(),
            },
          } as any,
        },
      };
    });

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Patch jackpot prize theo betCount riêng từng entry.
   *
   * Mỗi entry nhận jackpotAmount khác nhau tuỳ betCount của board chứa line JP.
   * Idempotent: chỉ update entries có tiers[jackpot].amount = 0.
   *
   * @param drawId ID kỳ quay.
   * @param entryOps Danh sách { entryId, jackpotAmount } cho từng entry trúng JP.
   * @returns Số entries đã patch.
   */
  async patchJackpotPrizePerEntry(
    drawId: string,
    entryOps: Array<{ entryId: string; jackpotAmount: number }>,
  ): Promise<number> {
    if (entryOps.length === 0) return 0;

    const entryIds = entryOps.map((op) => new ObjectId(op.entryId));

    const matchingEntries = await this.findManyAsDocuments(
      {
        _id: { $in: entryIds },
        drawId,
        status: EntryStatus.Settled,
        outcome: EntryOutcome.Win,
        "payout.tiers": {
          $elemMatch: {
            tier: PrizeTier.Jackpot,
            hitCount: { $gt: 0 },
            amount: 0,
          },
        },
      },
      {
        projection: { _id: 1, "payout.tiers": 1 },
      },
    );

    if (matchingEntries.length === 0) return 0;

    // Map entryId → jackpotAmount từ entryOps
    const amountMap = new Map(entryOps.map((op) => [op.entryId, op.jackpotAmount]));

    const ops = matchingEntries.map((entry) => {
      const entryId = (entry._id as any).toHexString();
      const jackpotAmount = amountMap.get(entryId) ?? 0;

      const tiers = (entry.payout as any)?.tiers ?? [];
      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0) {
          return { ...t, unitAmount: jackpotAmount, amount: jackpotAmount };
        }
        return t;
      });

      // Tổng winAmount = giải cố định đã nhân betCount + jackpotAmount
      const totalWin = updatedTiers.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);

      return {
        updateOne: {
          filter: {
            _id: entry._id,
            "payout.tiers": {
              $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 }, amount: 0 },
            },
          },
          update: {
            $set: {
              "payout.tiers": updatedTiers,
              "payout.winAmount": totalWin,
              "payout.payoutAmount": totalWin,
              updatedAt: new Date(),
            },
          } as any,
        },
      };
    });

    const result2 = await this.bulkWrite(ops, { ordered: false });
    return result2.modifiedCount;
  }

  /**
   * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
   *
   * BẮT BUỘC cả drawId lẫn tenantId — KHÔNG query cross-draw.
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async aggregatePlayersByDrawAndTenant(
    drawId: string,
    tenantId: string,
  ): Promise<PlayerBreakdownRow[]> {
    const result = await this.aggregate([
      { $match: { drawId, tenantId, status: EntryStatus.Settled } },
      {
        $group: {
          _id: "$accountId",
          username: { $first: "$username" },
          entryCount: { $sum: 1 },
          lineCount: { $sum: "$lineCount" },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: "$winAmount" },
          totalPayout: { $sum: "$payoutAmount" },
        },
      },
      { $sort: { totalStake: -1 } },
    ]);
    return (result as any[]).map((r) => ({
      accountId: r._id as string,
      username: r.username as string,
      entryCount: r.entryCount as number,
      lineCount: r.lineCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
    }));
  }

  /**
   * Entries cho 1 draw × 1 tenant × 1 player. Drill cấp 4.
   *
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async findByDrawTenantPlayer(
    drawId: string,
    tenantId: string,
    accountId: string,
  ): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId, tenantId, accountId });
  }
}
