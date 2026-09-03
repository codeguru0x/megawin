import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import {
  type EntryPayout,
  type EntryVoidInfo,
  Max3dproCollections,
  type TicketEntryDoc,
  type TicketEntryEntity,
} from "@megawin/game-max3dpro/entities";
import { type Long, ObjectId } from "mongodb";

import { mapDocToEntryForStats } from "../mappers/entry-for-stats-mapper";
import { EntryMapper } from "../mappers/entry-mapper";
import { BaseRepo } from "./base-repo";
import type { EntryForStats } from "./types/betting-stats.types";
import type {
  OutstandingDrawCounts,
  OutstandingDrawMetrics,
  PlayerBreakdownRow,
  VoidedEntryForDispatch,
  WinningEntryForDispatch,
} from "./types/entry.types";

/**
 * Repository quản lý TicketEntry lifecycle — Max 3D Pro.
 *
 * Bao gồm insert, settle, void, payout dispatch, aggregation cho reports và operations dashboard.
 * Version được stamp từ EntryChangeSeqRepository để sync feed hoạt động chính xác.
 */
export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Max3dproCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  // ─── Version ───

  /** Lấy version tiếp theo từ global sequence cho feed sync. */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  // ─── Query ───

  /** Lấy entries của 1 draw, sort by createdAt asc, offset pagination. */
  async getEntriesByDrawId(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  // ─── Operations Stats: insert-stream watermark reads ───

  /**
   * Đọc entries MỚI của 1 DRAW theo watermark insert-stream — cho stats worker
   * (analysis max3dpro-ops §3.3). Watermark PER-DRAW; entries insert-only → `_id`
   * ObjectId tăng đơn điệu là watermark tin cậy. Dùng index `idx_draw_id`.
   * Loại `status: Void` NGAY TẠI NGUỒN đọc (bài học Keno chốt 30/07/2026).
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
        unitPrice: 1,
        "tenant.commissionAmount": 1,
        "entrySummary.boards": 1,
      },
    });
    return docs.map(mapDocToEntryForStats);
  }

  /** Lấy scheduled entries theo batch (offset pagination), sort by createdAt asc. */
  async getScheduledEntriesBatch(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy N scheduled entries đầu tiên của 1 draw, sort by createdAt asc. */
  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ drawId, status: EntryStatus.Scheduled }, { sort: { createdAt: 1 }, limit });
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
      result: Max3dproDrawResult & { publishedAt: Date };
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
   * Aggregate payout summary của draw đã settle — per-tier hitCount và prizeAmount.
   *
   * 2 aggregate queries: (1) unwind tiers → group by tier, (2) group tổng settled.
   * Cần 2 queries vì MongoDB không support unwind + group tổng trong cùng 1 pipeline hiệu quả.
   */
  async aggregateSettledSummary(drawId: string): Promise<{
    totalSettled: number;
    totalLines: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    tierWinnerCounts: Record<string, number>;
    tierPrizeAmounts: Record<string, number>;
  }> {
    // 1 pipeline $facet — scan collection 1 lần, 2 nhánh chạy song song.
    // Nhánh tierSummary: $unwind tiers → group by tier (hitCount + tiền mỗi tier).
    // Nhánh totals: group toàn draw (entries + lines + payoutAmount).
    const [facetResult] = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
        },
      },
      {
        $facet: {
          // Nhánh 1: $unwind tiers → group by tier → đếm hitCount và tiền mỗi tier
          tierSummary: [
            { $unwind: "$payout.tiers" },
            {
              $group: {
                _id: "$payout.tiers.tier",
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

    const totals = facetResult?.totals?.[0] ?? {};
    const tierRows = facetResult?.tierSummary ?? [];

    let totalFixedPrizes = 0;
    const tierWinnerCounts: Record<string, number> = {};
    const tierPrizeAmounts: Record<string, number> = {};

    for (const row of tierRows) {
      tierWinnerCounts[row._id] = row.totalHitCount;
      tierPrizeAmounts[row._id] = row.totalAmount;
      totalFixedPrizes += row.totalAmount;
    }

    return {
      totalSettled: totals.totalSettled ?? 0,
      totalLines: totals.totalLines ?? 0,
      totalPayoutAmount: totals.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      tierWinnerCounts,
      tierPrizeAmounts,
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

  // ─── Payout Dispatch (Outbox Enqueue) ───

  /**
   * Lấy winning entries để build `TenantDispatchOrderDoc` cho outbox.
   *
   * Projection tối thiểu (_id, tenantId, accountId, username, ticketNo,
   * payoutAmount, payoutTx) — không load boards/tiers/etc.
   * Dùng bởi `EnqueueDispatchPayoutsUseCase`.
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
   * Lấy voided entries để build `TenantDispatchOrderDoc` cho outbox (refund).
   *
   * Projection tối thiểu tương tự `getWinningEntriesForDispatch`.
   * Dùng bởi `EnqueueDispatchRefundsUseCase`.
   */
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
   *
   * ticketId lưu dạng string (hex, xem place-bet.ts) — PHẢI nhận string[], KHÔNG convert sang
   * ObjectId. Truyền ObjectId[] vào $in sẽ KHÔNG match field string, khiến aggregate luôn trả rỗng
   * (im lặng, không lỗi) — bug thật đã xảy ra khiến ticket không bao giờ được sync status.
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
          settledCount: { $sum: { $cond: [{ $eq: ["$status", EntryStatus.Settled] }, 1, 0] } },
          voidedCount: { $sum: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, 1, 0] } },
          totalWinAmount: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
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
  async getWinningEntries(drawId: string, limit: number, afterEntryId?: string): Promise<TicketEntryEntity[]> {
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

    const row = rows[0] as { totalEntries?: number; totalLines?: number; totalWin?: number } | undefined;
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      playerCount: r.playerCount,
    }));
  }

  /**
   * Aggregate metrics tài chính per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để build SettleTenantReport[].
   * Max 3D Pro CÓ lineCount — aggregate $sum: "$lineCount" (pairs per board).
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
      entryCount: r.entryCount ?? 0,
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
   *
   * Dùng $facet để chia 1 $match → 3 nhánh tính song song trong server:
   *   - financials: entryCount + tổng tiền (group _id: null, không $addToSet)
   *   - playerCount: double-group by accountId → đếm $sum:1 (không $addToSet array lớn)
   *   - tenantCount: double-group by tenantId → đếm $sum:1 (tenants ít nên an toàn nhưng nhất quán)
   *
   * Tránh $addToSet "$accountId" vào 1 document duy nhất — khi player rất nhiều,
   * array này có thể vượt giới hạn 16MB BSON document của MongoDB.
   *
   * Index: { drawId: 1, status: 1 }
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
          // Nhánh đếm distinct players: double-group by accountId
          // Stage 1: deduplicate per accountId (1 player nhiều entries → chỉ đếm 1 lần)
          // Stage 2: đếm số nhóm → playerCount
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
          // Nhánh đếm distinct tenants: double-group by tenantId
          // Tenants ít (thường < 100) nhưng dùng double-group cho nhất quán, không $addToSet
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
   * Max 3D Pro có lineCount (pairs per board, từ multiNumber/multiDigit expansion).
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
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
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
      drawId: r._id,
      playerCount: r.playerCount ?? 0,
      tenantCount: r.tenants?.length ?? 0,
    }));
  }

  // ─── Operations Dashboard ─────────────────────────────────────────────────
  // Các aggregation on-demand cũ (aggregateOpsSummary/TenantBreakdown/TripletFrequency/
  // PlayTypeDistribution/TopPairCombos) đã XOÁ 30/07/2026 — thay bằng pre-aggregated
  // `max3dpro_draw_betting_stats` (worker stats-sync, đọc qua BettingStatsRepository).
  // Xem plan max3dpro-ops p0-05 §6 (dead-code cleanup theo checklist Keno §9.3).

  /**
   * Aggregate player breakdown cho 1 draw × tenant — dùng cho drill-down level 3.
   *
   * Group by accountId, SUM entries, lines, stake, win, payout.
   */
  async aggregatePlayersByDrawAndTenant(opts: { drawId: string; tenantId: string }): Promise<PlayerBreakdownRow[]> {
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
          username: { $first: "$username" },
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
      username: r.username ?? r._id,
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
