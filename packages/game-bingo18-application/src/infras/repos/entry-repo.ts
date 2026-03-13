/**
 * Bingo 18 – Entry Repository
 *
 * Collection: bingo18_ticket_entries
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
  Bingo18Collections,
  PayoutStatus,
  RefundStatus,
  type EntryPayout,
  type EntryVoidInfo,
  type EntryResult,
} from "@megawin/game-bingo18/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Bingo18Collections.TicketEntries,
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

  /** Lấy tất cả entries của 1 ticket, sắp xếp theo drawId tăng dần. */
  async getEntriesByTicketId(ticketId: string): Promise<EntryEntity[]> {
    return await this.findMany(
      { ticketId },
      {
        sort: { drawId: 1 },
      },
    );
  }

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

  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      payout: EntryPayout;
      outcome: string;
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

  /**
   * Lấy danh sách distinct ticketIds từ entries của 1 draw.
   * Dùng cho SyncTicketSummaries — biết cần sync ticket nào.
   */
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<ObjectId[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<ObjectId[]>;
  }

  // ─── Report Aggregations ─────────────────────────────────────────────────────

  /**
   * Đếm playerCount per tenant cho 1 draw đã settle.
   *
   * Group by {tenantId, accountId} để distinct player per tenant,
   * sau đó group by tenantId → đếm unique players.
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
   * Bingo 18 KHÔNG có lineCount — không aggregate lineCount.
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
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
          totalRefundAmount: { $sum: { $ifNull: ["$voidInfo.refundAmount", "$amount"] } },
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
   * Aggregate outstanding snapshot cho tất cả draws đang active (status: scheduled).
   *
   * Group by drawId → volumes + stake + estimatedCommission.
   * Bingo 18 KHÔNG có lineCount — không aggregate lineCount.
   * Dùng bởi SyncOutstandingReport để upsert per-draw outstanding docs.
   */
  async aggregateOutstandingByDraw(): Promise<
    Array<{
      drawId: string;
      financialDate: string;
      entryCount: number;
      playerCount: number;
      tenantCount: number;
      totalStake: number;
      estimatedCommission: number;
    }>
  > {
    const result = await this.aggregate([
      {
        $match: {
          status: EntryStatus.Scheduled,
        },
      },
      {
        $group: {
          _id: "$drawId",
          financialDate: { $first: "$financialDate" },
          entryCount: { $sum: 1 },
          players: { $addToSet: "$accountId" },
          tenants: { $addToSet: "$tenantId" },
          totalStake: { $sum: "$amount" },
          estimatedCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      drawId: r._id,
      financialDate: r.financialDate,
      entryCount: r.entryCount,
      playerCount: r.players?.length ?? 0,
      tenantCount: r.tenants?.length ?? 0,
      totalStake: r.totalStake,
      estimatedCommission: r.estimatedCommission ?? 0,
    }));
  }

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<EntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  /**
   * Aggregate giải thưởng cơ bản có người trúng trong kỳ quay.
   *
   * Chỉ trả các (playType, matchCount, tripleKind?) có winnerCount > 0.
   * tripleKind bắt buộc để phân biệt specific (1.2tr) vs any (200k) của tripleMatch.
   * Dùng bởi CalculateFinancials để build settleSummary.basicPrizes.
   */
  async aggregateBasicPrizeSummary(drawId: string): Promise<
    Array<{
      playType: string;
      matchCount: number;
      tripleKind: string | null;
      winnerCount: number;
      prizePerUnit: number;
    }>
  > {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          // index-friendly: chỉ lấy entries có ít nhất 1 board thắng
          "payout.boardPayouts": { $elemMatch: { winAmount: { $gt: 0 } } },
        },
      },
      { $unwind: "$payout.boardPayouts" },
      // Lọc từng board sau unwind — entry có nhiều board, không phải board nào cũng thắng
      { $match: { "payout.boardPayouts.winAmount": { $gt: 0 } } },
      {
        $group: {
          _id: {
            playType: "$payout.boardPayouts.playType",
            matchCount: "$payout.boardPayouts.matchCount",
            // tripleKind cần thiết để phân biệt specific vs any (giải thưởng khác nhau).
            // null với singleNum + doubleMatch (không có tripleKind).
            tripleKind: { $ifNull: ["$payout.boardPayouts.tripleKind", null] },
          },
          winnerCount: { $sum: 1 },
          prizePerUnit: { $first: "$payout.boardPayouts.winAmount" },
        },
      },
      { $sort: { "_id.playType": 1, "_id.matchCount": -1 } },
    ]);

    return result.map((r: any) => ({
      playType: r._id.playType,
      matchCount: r._id.matchCount,
      tripleKind: r._id.tripleKind,
      winnerCount: r.winnerCount,
      prizePerUnit: r.prizePerUnit,
    }));
  }

  /**
   * Aggregate giải thưởng side bet có người trúng trong kỳ quay.
   *
   * Chỉ trả các (playType, sum/bet) có winnerCount > 0.
   * Dùng bởi CalculateFinancials để build settleSummary.sideBetPrizes.
   *
   * Tách `sum` (number) và `bet` (string) theo playType — mirror EntrySideBetSnapshot,
   * không gộp chung thành 1 string để tránh nhầm lẫn kiểu dữ liệu.
   */
  async aggregateSideBetPrizeSummary(drawId: string): Promise<
    Array<{
      playType: string;
      sum: number | null;
      bet: string | null;
      winnerCount: number;
      prizePerUnit: number;
    }>
  > {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          // index-friendly: chỉ lấy entries có ít nhất 1 side bet thắng
          "payout.sideBetPayouts": { $elemMatch: { isWin: true } },
        },
      },
      { $unwind: "$payout.sideBetPayouts" },
      // Lọc từng side bet sau unwind — chỉ lấy bet đã thắng
      { $match: { "payout.sideBetPayouts.isWin": true } },
      {
        $group: {
          _id: {
            playType: "$payout.sideBetPayouts.playType",
            // sumTotal: group theo sum (number); bigSmallDraw: group theo bet (string).
            // Giữ 2 field riêng — không ép sang string chung để giữ type an toàn.
            sum: { $ifNull: ["$payout.sideBetPayouts.sum", null] },
            bet: { $ifNull: ["$payout.sideBetPayouts.bet", null] },
          },
          winnerCount: { $sum: 1 },
          prizePerUnit: { $first: "$payout.sideBetPayouts.winAmount" },
        },
      },
      { $sort: { "_id.playType": 1, "_id.sum": 1, "_id.bet": 1 } },
    ]);

    return result.map((r: any) => ({
      playType: r._id.playType,
      sum: r._id.sum,
      bet: r._id.bet,
      winnerCount: r.winnerCount,
      prizePerUnit: r.prizePerUnit,
    }));
  }
}
