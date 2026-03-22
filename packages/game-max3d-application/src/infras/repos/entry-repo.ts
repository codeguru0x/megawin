import {
  Max3dCollections,
  PlayMode,
  PayoutStatus,
  type EntryPayout,
  type EntryVoidInfo,
  type TicketEntryDoc,
  type TicketEntryEntity,
} from "@megawin/game-max3d/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import { EntryMapper } from "../mappers/entry-mapper";
import { BaseRepo } from "./base-repo";
import type {
  PlayerBreakdownRow,
  OutstandingDrawMetrics,
  OutstandingDrawCounts,
} from "./types/entry.types";

/**
 * Repository quản lý TicketEntry lifecycle — Max 3D.
 *
 * Bao gồm insert, settle, void, payout dispatch, aggregation cho reports và operations dashboard.
 * Version được stamp từ EntryChangeSeqRepository để sync feed hoạt động chính xác.
 */
export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Max3dCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  private get payoutStatusPending() {
    return PayoutStatus.Pending;
  }
  private get payoutStatusFailed() {
    return PayoutStatus.Failed;
  }
  private get payoutStatusDispatched() {
    return PayoutStatus.Dispatched;
  }

  // ─── Version ───

  /** Lấy version tiếp theo từ global sequence cho feed sync. */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  // ─── Insert ───

  /** Insert nhiều entries cùng 1 batch, dùng cùng version. Trả về insertedCount. */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const version = await this.nextVersion();
    const stamped = docs.map((doc) => ({ ...doc, version }));
    const result = await this.insertMany(stamped as any[]);
    return result.insertedCount;
  }

  // ─── Query ───

  /** Lấy entries của 1 draw, sort by createdAt asc, offset pagination. */
  async getEntriesByDrawId(
    drawId: string,
    page: number,
    size: number,
  ): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy scheduled entries theo batch (offset pagination), sort by createdAt asc. */
  async getScheduledEntriesBatch(
    drawId: string,
    page: number,
    size: number,
  ): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy N scheduled entries đầu tiên của 1 draw, sort by createdAt asc. */
  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

  /** Đếm tổng entries của 1 draw. */
  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  /** Đếm tổng lineCount của tất cả entries trong 1 draw qua aggregate. */
  async countLinesByDrawId(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId } },
      { $group: { _id: null, total: { $sum: "$lineCount" } } },
    ]);
    return (result[0] as any)?.total ?? 0;
  }

  /** Lấy tất cả entries của 1 ticket, sort by drawDate asc. */
  async findByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawDate: 1 } });
  }

  /** Lấy entry theo entryId (_id). */
  async findByEntryId(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOneById(entryId);
  }

  /** Đếm entries theo draw + status. */
  async countByDrawAndStatus(drawId: string, status: string): Promise<number> {
    return await this.count({ drawId, status });
  }

  // ─── Status Transitions ───

  /**
   * Batch chuyển status entries của 1 draw, stamp version mới.
   * Trả về số entries được update.
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

  /**
   * Bulk settle nhiều entries trong 1 draw.
   *
   * Filter: status = Scheduled + _id in list → đảm bảo idempotent.
   * Tất cả entries dùng cùng version để feed sync theo batch.
   */
  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      payout: EntryPayout;
      outcome: string;
      result: Max3dDrawResult & { publishedAt: Date };
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
            version,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─── Aggregation (Settle Financials) ───

  /**
   * Aggregate tổng doanh thu và hoa hồng cho 1 draw (exclude voided entries).
   *
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

  /**
   * Aggregate payout summary của draw đã settle — per-tier hitCount và prizeAmount, tách theo playMode.
   *
   * 1 pipeline $facet — scan collection 1 lần, 2 nhánh song song:
   * - tierSummary: $unwind tiers → group by {tier, playMode} (hitCount + tiền mỗi tier).
   * - totals: group tổng draw (entries + lines + payoutAmount).
   *
   * Group by (tier, playMode) thay vì chỉ tier vì BasicPrizeTier và PlusPrizeTier có 4 tier
   * trùng tên (special, first, second, third) nhưng giá trị giải thưởng khác nhau hoàn toàn.
   * Tách thành basicWinnerCounts/basicPrizeAmounts và plusWinnerCounts/plusPrizeAmounts riêng.
   */
  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalLines: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    basicWinnerCounts: Record<string, number>;
    basicPrizeAmounts: Record<string, number>;
    plusWinnerCounts: Record<string, number>;
    plusPrizeAmounts: Record<string, number>;
  }> {
    // 1 pipeline $facet — scan collection 1 lần, 2 nhánh chạy song song.
    const [facetResult] = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
        },
      },
      {
        $facet: {
          // Nhánh 1: $unwind tiers → group by {tier, playMode} → đếm hitCount và tiền mỗi tier/mode
          tierSummary: [
            { $unwind: "$payout.tiers" },
            {
              $group: {
                _id: {
                  tier: "$payout.tiers.tier",
                  playMode: "$payout.tiers.playMode",
                },
                totalHitCount: { $sum: "$payout.tiers.hitCount" },
                totalAmount: { $sum: "$payout.tiers.amount" },
              },
            },
          ],
          // Nhánh 2: đếm entries + sum lines + sum payoutAmount toàn draw
          totals: [
            {
              $group: {
                _id: null,
                totalSettled: { $sum: 1 },
                totalLines: { $sum: "$lineCount" },
                totalPayoutAmount: {
                  $sum: { $ifNull: ["$payout.payoutAmount", 0] },
                },
              },
            },
          ],
        },
      },
    ]);

    const totals = (facetResult as any)?.totals?.[0] ?? {};
    const tierRows = (facetResult as any)?.tierSummary ?? [];

    let totalFixedPrizes = 0;
    const basicWinnerCounts: Record<string, number> = {};
    const basicPrizeAmounts: Record<string, number> = {};
    const plusWinnerCounts: Record<string, number> = {};
    const plusPrizeAmounts: Record<string, number> = {};

    for (const row of tierRows) {
      const tier: string = row._id.tier;
      const playMode: string = row._id.playMode;
      totalFixedPrizes += row.totalAmount;

      if (playMode === PlayMode.Basic) {
        basicWinnerCounts[tier] = row.totalHitCount;
        basicPrizeAmounts[tier] = row.totalAmount;
      } else {
        // plus mode
        plusWinnerCounts[tier] = row.totalHitCount;
        plusPrizeAmounts[tier] = row.totalAmount;
      }
    }

    return {
      totalSettled: totals.totalSettled ?? 0,
      totalLines: totals.totalLines ?? 0,
      totalPayoutAmount: totals.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      basicWinnerCounts,
      basicPrizeAmounts,
      plusWinnerCounts,
      plusPrizeAmounts,
    };
  }

  /**
   * Aggregate tổng hợp per-tenant cho 1 draw — dùng bởi settle tenant report.
   * Trả về totalStake, totalWin, totalPayout, entryCount, commissionRate, totalCommission.
   */
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      entryCount: r.entryCount,
      commissionRate: r.commissionRate ?? 0,
      totalCommission: r.totalCommission ?? 0,
    }));
  }

  /**
   * Aggregate tổng hợp per-player trong 1 draw — dùng bởi player daily report.
   * Group by (tenantId, accountId).
   */
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
    return (result as any[]).map((r) => ({
      tenantId: r._id.tenantId,
      accountId: r._id.accountId,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      entryCount: r.entryCount,
    }));
  }

  // ─── Payout Dispatch ───

  /**
   * Lấy N entries pending payout (winAmount > 0, status pending/failed/missing).
   * Sort: tenantId asc, createdAt asc — đảm bảo consistent batching per tenant.
   */
  async getPendingPayoutEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.winAmount": { $gt: 0 },
        $or: [
          { "payout.payoutStatus": this.payoutStatusPending },
          { "payout.payoutStatus": this.payoutStatusFailed },
          { "payout.payoutStatus": { $exists: false } },
        ],
      },
      { sort: { tenantId: 1, createdAt: 1 }, limit },
    );
  }

  /** Đếm entries pending payout của 1 draw. */
  async countPendingPayoutEntries(drawId: string): Promise<number> {
    return await this.count({
      drawId,
      status: EntryStatus.Settled,
      "payout.winAmount": { $gt: 0 },
      $or: [
        { "payout.payoutStatus": this.payoutStatusPending },
        { "payout.payoutStatus": this.payoutStatusFailed },
        { "payout.payoutStatus": { $exists: false } },
      ],
    });
  }

  /**
   * Mark 1 entry payout = dispatched.
   * Idempotent — ghi đè nếu chạy lại.
   */
  async markPayoutDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": this.payoutStatusDispatched,
          "payout.payoutDispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Mark 1 entry payout = failed + ghi error message + tăng retryCount.
   */
  async markPayoutFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": this.payoutStatusFailed,
          "payout.payoutLastError": error,
          updatedAt: new Date(),
        },
        $inc: { "payout.payoutRetryCount": 1 },
      },
    );
  }

  /**
   * Batch mark nhiều entries payout = dispatched trong 1 updateMany.
   * Trả về modifiedCount.
   */
  async batchMarkPayoutDispatched(entryIds: string[]): Promise<number> {
    const objectIds = entryIds.map((id) => new ObjectId(id));
    const result = await this.updateMany(
      { _id: { $in: objectIds } as any },
      {
        $set: {
          "payout.payoutStatus": this.payoutStatusDispatched,
          "payout.payoutDispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return result.modifiedCount;
  }

  /**
   * Batch mark nhiều entries payout = failed + ghi error + tăng retryCount.
   * Trả về modifiedCount.
   */
  async batchMarkPayoutFailed(entryIds: string[], error: string): Promise<number> {
    const objectIds = entryIds.map((id) => new ObjectId(id));
    const result = await this.updateMany(
      { _id: { $in: objectIds } as any },
      {
        $set: {
          "payout.payoutStatus": this.payoutStatusFailed,
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
   * Lấy N entries scheduled (voidable) của 1 draw theo batch.
   * Sort: createdAt asc — FIFO.
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
   * Bulk void nhiều entries.
   *
   * Filter: status = Scheduled + _id in list → đảm bảo idempotent.
   * Stamp version mới cho feed sync.
   */
  async bulkVoidEntries(
    items: Array<{ entryId: string; voidInfo: EntryVoidInfo }>,
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
   * Lấy N entries pending refund (status=Void, refundStatus pending/failed).
   * Sort: createdAt asc — FIFO.
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

  /**
   * Mark 1 entry refund = dispatched.
   * Idempotent.
   */
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

  /**
   * Mark 1 entry refund = failed + ghi error message.
   */
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

  /**
   * Aggregate tổng kết void-refund cho 1 draw.
   * Dùng bởi voidComplete để tính DrawDocBaseVoidSummary.
   */
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
   * Aggregate summary tổng hợp của 1 ticket từ tất cả entries.
   * Dùng bởi TicketRepository.syncSummary() sau khi settle/void.
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
   * Aggregate ticket summaries cho nhiều tickets trong 1 query.
   * Trả về Map<ticketId (string), summary>.
   */
  async aggregateTicketSummariesBatch(ticketIds: ObjectId[]): Promise<
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
          settledCount: { $sum: { $cond: [{ $eq: ["$status", EntryStatus.Settled] }, 1, 0] } },
          voidedCount: { $sum: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, 1, 0] } },
          totalWinAmount: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
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
            $addToSet: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$drawId", "$$REMOVE"] },
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
      map.set(r._id.toString(), {
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

  /** Lấy danh sách unique ticketIds của 1 draw — dùng để sync ticket summaries sau settle. */
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<ObjectId[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<ObjectId[]>;
  }

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, dùng cho feed sync consumer.
   *
   * Sort: version asc — đảm bảo consumer xử lý theo đúng thứ tự tăng dần.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─── Latest Entries Feed ───

  /**
   * Lấy N entries mới nhất của 1 kỳ quay, sort theo createdAt desc.
   * Dùng cho live feed panel trên dashboard vận hành.
   */
  async getLatestEntriesByDrawId(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId },
      {
        sort: { createdAt: -1 },
        limit,
      },
    );
  }

  /**
   * Danh sách entries trúng thưởng (winAmount > 0) của 1 kỳ, cursor-based pagination.
   * Sort: winAmount desc, sau đó _id asc (ổn định với cursor).
   */
  async getWinningEntries(
    drawId: string,
    limit: number,
    afterEntryId?: string,
  ): Promise<TicketEntryEntity[]> {
    const filter: Record<string, unknown> = {
      drawId,
      status: EntryStatus.Settled,
      outcome: EntryOutcome.Win,
      "payout.winAmount": { $gt: 0 },
    };
    if (afterEntryId) {
      filter["_id"] = { $gt: new ObjectId(afterEntryId) };
    }
    return this.findMany(filter, {
      sort: { "payout.winAmount": -1, _id: 1 },
      limit,
    });
  }

  /**
   * Tổng hợp entries trúng thưởng của 1 kỳ.
   * Trả về totalWinningEntries, totalWinningLines (tổng hitCount), totalWinAmount.
   */
  async getWinningEntriesSummary(drawId: string): Promise<{
    totalWinningEntries: number;
    totalWinningLines: number;
    totalWinAmount: number;
  }> {
    const rows = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          outcome: EntryOutcome.Win,
          "payout.winAmount": { $gt: 0 },
        },
      },
      {
        $project: {
          winAmount: "$payout.winAmount",
          totalHitCount: {
            $sum: {
              $map: {
                input: "$payout.tiers",
                as: "t",
                in: "$$t.hitCount",
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalEntries: { $sum: 1 },
          totalLines: { $sum: "$totalHitCount" },
          totalWin: { $sum: "$winAmount" },
        },
      },
    ]);

    const row = rows[0] as
      | { totalEntries?: number; totalLines?: number; totalWin?: number }
      | undefined;
    return {
      totalWinningEntries: row?.totalEntries ?? 0,
      totalWinningLines: row?.totalLines ?? 0,
      totalWinAmount: row?.totalWin ?? 0,
    };
  }

  // ─── Aggregation for Financial Reports ───

  /**
   * Aggregate player count per tenant cho 1 draw đã settle.
   *
   * Dùng song song với aggregateTenantSettleMetrics trong BuildSettleReport.
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      playerCount: r.playerCount,
    }));
  }

  /**
   * Aggregate metrics tài chính per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để build SettleTenantReport[].
   * Max 3D CÓ lineCount — aggregate $sum: "$lineCount".
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
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
          totalCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return result.map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount,
      lineCount: r.lineCount ?? 0,
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
   * Max 3D có lineCount (1 cho straight, 3/6 cho combo).
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
          // betUnitCount phản ánh đơn vị cược thực — fallback lineCount cho data cũ
          lineCount: { $sum: { $ifNull: ["$betUnitCount", "$lineCount"] } },
          totalStake: { $sum: "$amount" },
          estimatedCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return result.map((r) => ({
      drawId: r._id,
      financialDate: r.financialDate,
      entryCount: r.entryCount ?? 0,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake ?? 0,
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
      drawId: r._id,
      playerCount: r.playerCount ?? 0,
      tenantCount: r.tenants?.length ?? 0,
    }));
  }

  // ─── Operations Dashboard Aggregations ───

  /** Build filter cho operations queries theo financialDate và drawId optional. */
  private buildOpsFilter(opts: {
    financialDate: string;
    drawId?: string;
  }): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      financialDate: opts.financialDate,
      status: { $ne: EntryStatus.Void },
    };
    if (opts.drawId) filter.drawId = opts.drawId;
    return filter;
  }

  /**
   * Aggregate KPI tổng hợp cho dashboard vận hành Max 3D.
   *
   * Trả về: totalRevenue, totalEntries, totalBetUnits, totalPlayers, totalCommission.
   * totalBetUnits = Σ(betUnitCount) — phản ánh đơn vị cược thực tế (= tiền / unitPrice).
   * Max 3D KHÔNG CÓ Jackpot → không cần totalPayout riêng lẻ trong KPI.
   */
  async aggregateOpsSummary(opts: { financialDate: string; drawId?: string }): Promise<{
    totalRevenue: number;
    totalEntries: number;
    totalBetUnits: number;
    totalPlayers: number;
    totalCommission: number;
  }> {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalEntries: { $sum: 1 },
          // betUnitCount phản ánh tiền thực trả (khác lineCount khi betCount > 1)
          totalBetUnits: { $sum: { $ifNull: ["$betUnitCount", "$lineCount"] } },
          uniquePlayers: { $addToSet: "$accountId" },
          totalCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalEntries: 1,
          totalBetUnits: 1,
          totalPlayers: { $size: "$uniquePlayers" },
          totalCommission: 1,
        },
      },
    ]);
    const row = (result[0] as any) ?? {};
    return {
      totalRevenue: row.totalRevenue ?? 0,
      totalEntries: row.totalEntries ?? 0,
      totalBetUnits: row.totalBetUnits ?? 0,
      totalPlayers: row.totalPlayers ?? 0,
      totalCommission: row.totalCommission ?? 0,
    };
  }

  /**
   * Aggregate breakdown theo đại lý cho dashboard vận hành.
   *
   * Sort: revenue desc.
   */
  async aggregateTenantBreakdown(opts: { financialDate: string; drawId?: string }): Promise<
    Array<{
      tenantId: string;
      entries: number;
      betUnits: number;
      players: number;
      revenue: number;
      commission: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      {
        $group: {
          _id: "$tenantId",
          entries: { $sum: 1 },
          // betUnitCount phản ánh revenue per tenant — fallback lineCount cho data cũ
          betUnits: { $sum: { $ifNull: ["$betUnitCount", "$lineCount"] } },
          players: { $addToSet: "$accountId" },
          revenue: { $sum: "$amount" },
          commission: { $sum: "$tenant.commissionAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          tenantId: "$_id",
          entries: 1,
          betUnits: 1,
          players: { $size: "$players" },
          revenue: 1,
          commission: 1,
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    return result as any[];
  }

  /**
   * Tần suất xuất hiện của từng bộ ba số trong các boards cược.
   *
   * Pipeline: match → unwind boards → unwind triplets → group by triplet → sort desc → limit.
   * Revenue xấp xỉ: phân bổ entry.amount theo tỷ lệ betUnitCount board / betUnitCount entry.
   */
  async aggregateTripletFrequency(opts: {
    financialDate: string;
    drawId?: string;
    limit: number;
  }): Promise<
    Array<{
      triplet: string;
      count: number;
      revenue: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      { $unwind: "$entrySummary.boards" },
      { $unwind: "$entrySummary.boards.triplets" },
      {
        $group: {
          _id: "$entrySummary.boards.triplets",
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $multiply: [
                "$amount",
                {
                  $cond: [
                    // Dùng betUnitCount (= lineCount × betCount) làm mẫu số để phân bổ revenue
                    { $gt: [{ $ifNull: ["$betUnitCount", "$lineCount"] }, 0] },
                    {
                      $divide: [
                        // boardBetUnits = board.lineCount × board.betCount — xấp xỉ bằng lineCount khi chưa có betCount
                        {
                          $multiply: [
                            { $ifNull: ["$entrySummary.boards.lineCount", 1] },
                            { $ifNull: ["$entrySummary.boards.betCount", 1] },
                          ],
                        },
                        { $ifNull: ["$betUnitCount", "$lineCount"] },
                      ],
                    },
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
          triplet: "$_id",
          count: 1,
          revenue: { $round: ["$revenue", 0] },
        },
      },
      { $sort: { count: -1 } },
      { $limit: opts.limit },
    ]);
    return result as any[];
  }

  /**
   * Phân bổ cược theo (playMode, playType) cho dashboard vận hành Max 3D.
   *
   * Max 3D có basic × {straight, combo3, combo6} và plus × {straight}.
   * Group by (playMode, playType) → boardCount, lineCount, entryCount, revenue.
   * Revenue xấp xỉ: entry.amount × (board.lineCount × board.betCount) / entry.betUnitCount.
   */
  async aggregatePlayTypeDistribution(opts: { financialDate: string; drawId?: string }): Promise<
    Array<{
      playMode: string;
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
          _id: {
            playMode: "$entrySummary.boards.playMode",
            playType: "$entrySummary.boards.playType",
          },
          boardCount: { $sum: 1 },
          lineCount: { $sum: "$entrySummary.boards.lineCount" },
          entryIds: { $addToSet: "$_id" },
          // Revenue xấp xỉ: entry.amount × boardBetUnits / entry.betUnitCount
          // boardBetUnits = board.lineCount × board.betCount
          revenue: {
            $sum: {
              $multiply: [
                "$amount",
                {
                  $cond: [
                    { $gt: [{ $ifNull: ["$betUnitCount", "$lineCount"] }, 0] },
                    {
                      $divide: [
                        {
                          $multiply: [
                            { $ifNull: ["$entrySummary.boards.lineCount", 1] },
                            { $ifNull: ["$entrySummary.boards.betCount", 1] },
                          ],
                        },
                        { $ifNull: ["$betUnitCount", "$lineCount"] },
                      ],
                    },
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
          playMode: "$_id.playMode",
          playType: "$_id.playType",
          boardCount: 1,
          lineCount: 1,
          entryCount: { $size: "$entryIds" },
          revenue: { $round: ["$revenue", 0] },
        },
      },
      { $sort: { lineCount: -1 } },
    ]);
    return result as any[];
  }

  /**
   * Top N bộ ba đơn phổ biến nhất trong 1 kỳ (basic mode, tất cả playType).
   *
   * Pipeline: unwind boards → unwind triplets → group by triplet → sort desc → limit.
   * Chỉ lấy basic mode (bao gồm combo — combo expand từ 1 triplet).
   * Revenue xấp xỉ: entry.amount × boardBetUnits / entry.betUnitCount.
   * boardBetUnits = board.lineCount × board.betCount (fallback betCount = 1).
   */
  async aggregateTopSingleCombos(opts: { drawId: string; limit: number }): Promise<
    Array<{
      triplet: string;
      boardCount: number;
      totalAmount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId: opts.drawId } },
      { $unwind: "$entrySummary.boards" },
      {
        $match: {
          "entrySummary.boards.playMode": "basic",
        },
      },
      { $unwind: "$entrySummary.boards.triplets" },
      {
        $group: {
          _id: "$entrySummary.boards.triplets",
          boardCount: { $sum: 1 },
          totalAmount: {
            $sum: {
              $multiply: [
                "$amount",
                {
                  $cond: [
                    // Mẫu số: betUnitCount entry — fallback lineCount cho data cũ
                    { $gt: [{ $ifNull: ["$betUnitCount", "$lineCount"] }, 0] },
                    {
                      $divide: [
                        // Tử số: boardBetUnits = board.lineCount × board.betCount
                        {
                          $multiply: [
                            { $ifNull: ["$entrySummary.boards.lineCount", 1] },
                            { $ifNull: ["$entrySummary.boards.betCount", 1] },
                          ],
                        },
                        { $ifNull: ["$betUnitCount", "$lineCount"] },
                      ],
                    },
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
          triplet: "$_id",
          boardCount: 1,
          totalAmount: { $round: ["$totalAmount", 0] },
        },
      },
      { $sort: { boardCount: -1 } },
      { $limit: opts.limit },
    ]);
    return result as any[];
  }

  /**
   * Top N cặp bộ ba phổ biến nhất trong 1 kỳ (plus mode).
   *
   * Key = sorted pair "{min},{max}" để normalize thứ tự.
   * Pipeline: unwind boards plus → project comboKey → group → sort → limit.
   * Revenue xấp xỉ: entry.amount × boardBetUnits / entry.betUnitCount.
   * boardBetUnits = board.lineCount × board.betCount (Plus: lineCount = 1, nên = betCount).
   */
  async aggregateTopPlusCombos(opts: { drawId: string; limit: number }): Promise<
    Array<{
      triplet1: string;
      triplet2: string;
      boardCount: number;
      totalAmount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId: opts.drawId } },
      { $unwind: "$entrySummary.boards" },
      {
        $match: {
          "entrySummary.boards.playMode": "plus",
          // Plus boards có đúng 2 triplets
          "entrySummary.boards.triplets.1": { $exists: true },
        },
      },
      {
        $project: {
          // Normalize thứ tự: lấy sorted pair để (A,B) và (B,A) là cùng key
          sortedPair: {
            $sortArray: { input: "$entrySummary.boards.triplets", sortBy: 1 },
          },
          // betUnitCount entry — fallback lineCount cho data cũ
          entryBetUnitCount: { $ifNull: ["$betUnitCount", "$lineCount"] },
          entryAmount: "$amount",
          // boardBetUnits = board.lineCount × board.betCount
          boardBetUnits: {
            $multiply: [
              { $ifNull: ["$entrySummary.boards.lineCount", 1] },
              { $ifNull: ["$entrySummary.boards.betCount", 1] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            $concat: [
              { $arrayElemAt: ["$sortedPair", 0] },
              ",",
              { $arrayElemAt: ["$sortedPair", 1] },
            ],
          },
          triplet1: { $first: { $arrayElemAt: ["$sortedPair", 0] } },
          triplet2: { $first: { $arrayElemAt: ["$sortedPair", 1] } },
          boardCount: { $sum: 1 },
          totalAmount: {
            $sum: {
              $multiply: [
                "$entryAmount",
                {
                  $cond: [
                    // Mẫu số: betUnitCount entry — fallback lineCount cho data cũ
                    { $gt: ["$entryBetUnitCount", 0] },
                    { $divide: ["$boardBetUnits", "$entryBetUnitCount"] },
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
          triplet1: 1,
          triplet2: 1,
          boardCount: 1,
          totalAmount: { $round: ["$totalAmount", 0] },
        },
      },
      { $sort: { boardCount: -1 } },
      { $limit: opts.limit },
    ]);
    return result as any[];
  }

  // ─── Financial Report READ Methods ───

  /**
   * Aggregate player breakdown cho 1 draw × tenant — dùng cho drill-down level 3.
   *
   * Group by accountId, SUM entries, lines, stake, win, payout.
   */
  async aggregatePlayersByDrawAndTenant(opts: {
    drawId: string;
    tenantId: string;
  }): Promise<PlayerBreakdownRow[]> {
    const result = await this.aggregate([
      {
        $match: {
          drawId: opts.drawId,
          tenantId: opts.tenantId,
          status: EntryStatus.Settled,
        },
      },
      {
        $group: {
          _id: "$accountId",
          username: { $first: { $ifNull: ["$player.username", "$accountId"] } },
          entryCount: { $sum: 1 },
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
      { $sort: { totalStake: -1 } },
    ]);

    return (result as any[]).map((r) => ({
      accountId: r._id,
      username: r.username,
      entryCount: r.entryCount,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
    }));
  }

  /**
   * List entries của 1 player trong 1 draw × tenant — dùng cho drill-down level 4.
   *
   * Trả TicketEntryEntity để UI hiển thị chi tiết.
   */
  async findByDrawTenantPlayer(opts: {
    drawId: string;
    tenantId: string;
    accountId: string;
  }): Promise<TicketEntryEntity[]> {
    return this.findMany(
      {
        drawId: opts.drawId,
        tenantId: opts.tenantId,
        accountId: opts.accountId,
      },
      { sort: { createdAt: -1 } },
    );
  }
}

export type { TicketEntryEntity };
