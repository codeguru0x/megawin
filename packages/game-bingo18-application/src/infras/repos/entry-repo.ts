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
import type {
  SettledFinancialSummary,
  TenantSettleMetrics,
  TenantPlayerCount,
  VoidMetrics,
  VoidRefundSummary,
  TicketAggregateResult,
  OpsSummary,
  WinningEntriesSummary,
  PrizeSummaryRow,
} from "./types";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type {
  Bingo18BigSmallBet,
  Bingo18TripleKind,
  TicketEntryEntity,
} from "@megawin/game-bingo18/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type { OutstandingDrawMetrics, OutstandingDrawCounts } from "./types";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
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

  // ─── Query ───

  /** Lấy tất cả entries của 1 ticket, sắp xếp theo drawId tăng dần. */
  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { ticketId },
      {
        sort: { drawId: 1 },
      },
    );
  }

  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  // ─── Status Transitions ───

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
   * Aggregate tổng hợp tài chính entries đã settle cho 1 draw — gộp revenue + payout.
   *
   * Tại thời điểm CalculateFinancials, TẤT CẢ entries đã là Settled
   * (SettleEntries hoàn tất trước đó, chưa có Void) → 1 pipeline với filter
   * { status: Settled } đủ lấy cả revenue, commission lẫn payout metrics.
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

  // ─── Payout Dispatch ───

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

  /** Lấy entries đã void nhưng chưa hoàn tiền. */
  async getPendingRefundEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
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
  async aggregateVoidRefundSummary(drawId: string): Promise<VoidRefundSummary> {
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
    } satisfies VoidRefundSummary;
  }

  // ─── Ticket Summary Aggregation ───

  /**
   * Batch aggregate summaries cho nhiều tickets cùng lúc.
   * $match ticketId ∈ batch → $group by ticketId → Map<ticketId, summary>.
   */
  async aggregateTicketSummariesBatch(
    ticketIds: string[],
  ): Promise<Map<string, TicketAggregateResult>> {
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

    const map = new Map<string, TicketAggregateResult>();

    for (const row of result) {
      const r = row as any;
      map.set(r._id as string, {
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

  // ─── Report Aggregations ─────────────────────────────────────────────────────

  /**
   * Đếm playerCount per tenant cho 1 draw đã settle.
   *
   * Group by {tenantId, accountId} để distinct player per tenant,
   * sau đó group by tenantId → đếm unique players.
   * Dùng song song với aggregateTenantSettleMetrics trong BuildSettleReport.
   */
  async aggregatePlayerCountByTenant(drawId: string): Promise<TenantPlayerCount[]> {
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
  async aggregateTenantSettleMetrics(drawId: string): Promise<TenantSettleMetrics[]> {
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
  async aggregateVoidMetrics(drawId: string): Promise<VoidMetrics> {
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
   * Bingo 18 không có lineCount.
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
          totalStake: { $sum: "$amount" },
          estimatedCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
    ]);

    return result.map((r) => ({
      drawId: r._id,
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

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─── Operations Dashboard Aggregations ───────────────────────────────────────

  /**
   * Aggregate KPI tổng hợp cho Operations Dashboard.
   *
   * Bingo 18: profit = revenue - prizes - commission (KHÔNG có Jackpot).
   * Tách biệt totalBoards (singleNum/doubleMatch/tripleMatch) và totalSideBets (sumTotal/bigSmallDraw).
   * Cả hai loại đều nằm trong entrySummary.boards[] — phân biệt bằng playType.
   * Filter theo financialDate hoặc drawId cụ thể.
   */
  async aggregateOpsSummary(filter: {
    financialDate?: string;
    drawId?: string;
  }): Promise<OpsSummary> {
    const $match: Record<string, unknown> = {};
    if (filter.drawId) {
      $match.drawId = filter.drawId;
    } else if (filter.financialDate) {
      $match.financialDate = filter.financialDate;
    }

    const result = await this.aggregate([
      { $match },
      // Tách boards[] thành 2 nhóm theo playType:
      // - basicBoards: singleNum, doubleMatch, tripleMatch
      // - sideBetBoards: sumTotal, bigSmallDraw
      {
        $addFields: {
          _boards: { $ifNull: ["$entrySummary.boards", []] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalEntries: { $sum: 1 },
          // Đếm basic boards: filter playType ∈ {singleNum, doubleMatch, tripleMatch}
          totalBoards: {
            $sum: {
              $size: {
                $filter: {
                  input: "$_boards",
                  cond: { $in: ["$$this.playType", ["singleNum", "doubleMatch", "tripleMatch"]] },
                },
              },
            },
          },
          // Đếm side bet boards: filter playType ∈ {sumTotal, bigSmallDraw}
          totalSideBets: {
            $sum: {
              $size: {
                $filter: {
                  input: "$_boards",
                  cond: { $in: ["$$this.playType", ["sumTotal", "bigSmallDraw"]] },
                },
              },
            },
          },
          totalCommission: { $sum: "$tenant.commissionAmount" },
          accountIds: { $addToSet: "$accountId" },
        },
      },
      {
        $project: {
          totalRevenue: 1,
          totalEntries: 1,
          totalBoards: 1,
          totalSideBets: 1,
          totalCommission: 1,
          uniquePlayers: { $size: "$accountIds" },
        },
      },
    ]);

    const row = result[0] as any;
    return {
      totalRevenue: row?.totalRevenue ?? 0,
      totalEntries: row?.totalEntries ?? 0,
      totalBoards: row?.totalBoards ?? 0,
      totalSideBets: row?.totalSideBets ?? 0,
      uniquePlayers: row?.uniquePlayers ?? 0,
      totalCommission: row?.totalCommission ?? 0,
    };
  }

  /**
   * Aggregate doanh thu theo đại lý cho Operations Dashboard.
   *
   * Group by tenantId — sum revenue, commission; count entries, boards, sideBets, players.
   * Cả basic boards và side bets đều nằm trong entrySummary.boards[] — phân biệt bằng playType.
   */
  async aggregateTenantBreakdown(filter: { financialDate?: string; drawId?: string }): Promise<
    Array<{
      tenantId: string;
      entries: number;
      boards: number;
      sideBets: number;
      players: number;
      revenue: number;
      commission: number;
    }>
  > {
    const $match: Record<string, unknown> = {};
    if (filter.drawId) {
      $match.drawId = filter.drawId;
    } else if (filter.financialDate) {
      $match.financialDate = filter.financialDate;
    }

    const result = await this.aggregate([
      { $match },
      // Tách boards[] thành 2 nhóm theo playType
      {
        $addFields: {
          _boards: { $ifNull: ["$entrySummary.boards", []] },
        },
      },
      {
        $group: {
          _id: "$tenantId",
          entries: { $sum: 1 },
          // Đếm basic boards: filter playType ∈ {singleNum, doubleMatch, tripleMatch}
          boards: {
            $sum: {
              $size: {
                $filter: {
                  input: "$_boards",
                  cond: { $in: ["$$this.playType", ["singleNum", "doubleMatch", "tripleMatch"]] },
                },
              },
            },
          },
          // Đếm side bet boards: filter playType ∈ {sumTotal, bigSmallDraw}
          sideBets: {
            $sum: {
              $size: {
                $filter: {
                  input: "$_boards",
                  cond: { $in: ["$$this.playType", ["sumTotal", "bigSmallDraw"]] },
                },
              },
            },
          },
          revenue: { $sum: "$amount" },
          commission: { $sum: "$tenant.commissionAmount" },
          accountIds: { $addToSet: "$accountId" },
        },
      },
      {
        $project: {
          _id: 0,
          tenantId: "$_id",
          entries: 1,
          boards: 1,
          sideBets: 1,
          revenue: 1,
          commission: 1,
          players: { $size: "$accountIds" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    return result.map((r: any) => ({
      tenantId: r.tenantId,
      entries: r.entries,
      boards: r.boards,
      sideBets: r.sideBets,
      players: r.players,
      revenue: r.revenue,
      commission: r.commission,
    }));
  }

  /**
   * Aggregate tần suất 6 mặt xúc xắc (1-6) từ basic boards.
   *
   * Chỉ aggregate từ singleNum + doubleMatch — những play types có số cụ thể.
   * tripleMatch-any không có số cụ thể, không đưa vào heatmap.
   * Unwind boards → filter playType ∈ {singleNum, doubleMatch} → group by number.
   */
  async aggregateDiceFrequency(filter: { financialDate?: string; drawId?: string }): Promise<
    Array<{
      diceValue: number;
      count: number;
      entries: number;
    }>
  > {
    const $match: Record<string, unknown> = {};
    if (filter.drawId) {
      $match.drawId = filter.drawId;
    } else if (filter.financialDate) {
      $match.financialDate = filter.financialDate;
    }

    const result = await this.aggregate([
      { $match },
      { $addFields: { boards: { $ifNull: ["$entrySummary.boards", []] } } },
      { $unwind: "$boards" },
      // Chỉ lấy singleNum + doubleMatch (có field number cụ thể)
      // tripleMatch-any không có number → loại bỏ
      {
        $match: {
          "boards.playType": { $in: ["singleNum", "doubleMatch"] },
          "boards.number": { $exists: true, $ne: null },
        },
      },
      {
        $group: {
          _id: "$boards.number",
          count: { $sum: 1 },
          entryIds: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          _id: 0,
          diceValue: "$_id",
          count: 1,
          entries: { $size: "$entryIds" },
        },
      },
      { $sort: { diceValue: 1 } },
    ]);

    return result.map((r: any) => ({
      diceValue: r.diceValue as number,
      count: r.count as number,
      entries: r.entries as number,
    }));
  }

  /**
   * Aggregate phân bổ theo kiểu chơi Bingo 18.
   *
   * Tất cả play types (cơ bản + bổ sung) nằm trong entrySummary.boards[].
   * Unwind boards → group by (playType, tripleKind?) → đếm selections và entries.
   * tripleMatch tách specific/any vì giải thưởng khác nhau (1.2tr vs 200k).
   */
  async aggregatePlayTypeDistribution(filter: { financialDate?: string; drawId?: string }): Promise<
    Array<{
      playType: string;
      tripleKind: string | null;
      selectionCount: number;
      entryCount: number;
    }>
  > {
    const $match: Record<string, unknown> = {};
    if (filter.drawId) {
      $match.drawId = filter.drawId;
    } else if (filter.financialDate) {
      $match.financialDate = filter.financialDate;
    }

    // Unified: tất cả play types nằm trong boards[]
    const result = await this.aggregate([
      { $match },
      { $addFields: { boards: { $ifNull: ["$entrySummary.boards", []] } } },
      { $unwind: "$boards" },
      {
        $group: {
          _id: {
            playType: "$boards.playType",
            // tripleKind chỉ set cho tripleMatch — null với các loại khác
            tripleKind: { $ifNull: ["$boards.tripleKind", null] },
          },
          selectionCount: { $sum: 1 },
          entryIds: { $addToSet: "$_id" },
        },
      },
      {
        $project: {
          _id: 0,
          playType: "$_id.playType",
          tripleKind: "$_id.tripleKind",
          selectionCount: 1,
          entryCount: { $size: "$entryIds" },
        },
      },
      { $sort: { selectionCount: -1 } },
    ]);

    return result.map((r: any) => ({
      playType: r.playType as string,
      tripleKind: r.tripleKind as string | null,
      selectionCount: r.selectionCount as number,
      entryCount: r.entryCount as number,
    }));
  }

  /**
   * Lấy N entries mới nhất của một kỳ quay cho live feed.
   *
   * Sort createdAt desc để hiện entries vừa đặt trước.
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
   * Aggregate top N side bet combinations phổ biến nhất.
   *
   * Bingo 18: side bet combo key = (playType, sum) cho sumTotal hoặc (playType, bet) cho bigSmallDraw.
   * Side bets nằm trong entrySummary.boards[] — filter bằng playType ∈ {sumTotal, bigSmallDraw}.
   */
  async aggregateTopCombos(
    drawId: string,
    limit: number,
  ): Promise<
    Array<{
      playType: string;
      sum: number | null;
      bet: string | null;
      count: number;
      entryCount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId } },
      { $addFields: { boards: { $ifNull: ["$entrySummary.boards", []] } } },
      // Filter chỉ side bet boards trước khi unwind
      {
        $addFields: {
          boards: {
            $filter: {
              input: "$boards",
              cond: { $in: ["$$this.playType", ["sumTotal", "bigSmallDraw"]] },
            },
          },
        },
      },
      { $match: { boards: { $ne: [] } } },
      { $unwind: "$boards" },
      {
        $group: {
          _id: {
            // sumTotal: group theo sum (number). bigSmallDraw: group theo bet (string).
            playType: "$boards.playType",
            sum: { $ifNull: ["$boards.sum", null] },
            bet: { $ifNull: ["$boards.bet", null] },
          },
          count: { $sum: 1 },
          entryIds: { $addToSet: "$_id" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          playType: "$_id.playType",
          sum: "$_id.sum",
          bet: "$_id.bet",
          count: 1,
          entryCount: { $size: "$entryIds" },
        },
      },
    ]);

    return result.map((r: any) => ({
      playType: r.playType as string,
      sum: r.sum as number | null,
      bet: r.bet as string | null,
      count: r.count as number,
      entryCount: r.entryCount as number,
    }));
  }

  /**
   * Lấy entries trúng thưởng của một kỳ quay (cursor pagination).
   *
   * Filter: payout.winAmount > 0 (entries thực sự trúng).
   * Sort: payout.winAmount desc để entries trúng lớn hiện trước.
   * Bingo 18: KHÔNG có payout cap → không cần flag hasCappablePrize.
   */
  async getWinningEntries(
    drawId: string,
    cursor?: string,
    limit?: number,
  ): Promise<TicketEntryEntity[]> {
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
   * Đếm winning entries, tổng win amount.
   * Bingo 18: không có cappedEntries (không có payout cap).
   */
  async getWinningEntriesSummary(drawId: string): Promise<WinningEntriesSummary> {
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
        },
      },
    ]);

    const row = result[0] as any;
    return {
      totalWinningEntries: row?.totalWinningEntries ?? 0,
      totalWinAmount: row?.totalWinAmount ?? 0,
    };
  }

  /**
   * Aggregate giải thưởng (cả cơ bản và bổ sung) có người trúng trong kỳ quay.
   *
   * Unified: boardPayouts[] chứa tất cả play types.
   * Group by (playType, matchCount, tripleKind?, sum?, bet?) — chỉ trả winnerCount > 0.
   * Dùng bởi CalculateFinancials để build settleSummary.prizes[].
   */
  async aggregatePrizeSummary(drawId: string): Promise<PrizeSummaryRow[]> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          status: EntryStatus.Settled,
          // Chỉ lấy entries có ít nhất 1 board thắng (winAmount > 0)
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
            // null với singleNum, doubleMatch, sumTotal, bigSmallDraw.
            tripleKind: { $ifNull: ["$payout.boardPayouts.tripleKind", null] },
            // sum (number) cho sumTotal — null cho các loại khác.
            sum: { $ifNull: ["$payout.boardPayouts.sum", null] },
            // bet (string) cho bigSmallDraw — null cho các loại khác.
            bet: { $ifNull: ["$payout.boardPayouts.bet", null] },
          },
          winnerCount: { $sum: 1 },
          // unitWinAmount là giá trị giải per-unit trước khi nhân betCount.
          // $max: giải cố định → mọi doc trong nhóm đều có unitWinAmount bằng nhau.
          prizePerUnit: { $max: "$payout.boardPayouts.unitWinAmount" },
        },
      },
      { $sort: { "_id.playType": 1, "_id.matchCount": -1, "_id.sum": 1, "_id.bet": 1 } },
    ]);

    return result.map((r: any) => ({
      playType: r._id.playType,
      matchCount: r._id.matchCount,
      tripleKind: r._id.tripleKind as Bingo18TripleKind | null,
      sum: r._id.sum,
      bet: r._id.bet as Bingo18BigSmallBet | null,
      winnerCount: r.winnerCount,
      prizePerUnit: r.prizePerUnit,
    }));
  }

  // ─── Financial Report READ Methods ──────────────────────────────────────────

  /**
   * Aggregate players theo draw và tenant — dùng cho drill-down level 3.
   *
   * Bingo 18 KHÔNG có lineCount.
   */
  async aggregatePlayersByDrawAndTenant(
    drawId: string,
    tenantId: string,
  ): Promise<
    Array<{
      accountId: string;
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
      entryCount: r.entryCount,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
    }));
  }

  /**
   * Lấy entries của 1 player trong 1 draw × tenant — dùng cho drill-down level 4.
   */
  async findByDrawTenantPlayer(
    drawId: string,
    tenantId: string,
    accountId: string,
  ): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId, tenantId, accountId }, { sort: { createdAt: 1 } });
  }
}
