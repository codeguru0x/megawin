import {
  Max3dproCollections,
  PayoutStatus,
  type EntryPayout,
  type EntryVoidInfo,
  type TicketEntryDoc,
  type TicketEntryEntity,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId } from "mongodb";
import { AbstractEntryRepository } from "@megawin/game-max3d-core/repos";
import { EntryMapper } from "../mappers/entry-mapper";

import type { PlayerBreakdownRow } from "./types/entry.types";

export class EntryRepository extends AbstractEntryRepository<
  TicketEntryEntity,
  EntryMapper,
  Max3dproDrawResult,
  string,
  EntryPayout,
  EntryVoidInfo
> {
  constructor() {
    super({
      collName: Max3dproCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  protected get payoutStatusPending() {
    return PayoutStatus.Pending;
  }
  protected get payoutStatusFailed() {
    return PayoutStatus.Failed;
  }
  protected get payoutStatusDispatched() {
    return PayoutStatus.Dispatched;
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount,
      lineCount: r.lineCount ?? 0,
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
   * Max 3D Pro CÓ lineCount — aggregate $sum: "$lineCount" (pairs per board).
   * Dùng bởi SyncOutstandingReport để upsert per-draw outstanding docs.
   */
  async aggregateOutstandingByDraw(): Promise<
    Array<{
      drawId: string;
      financialDate: string;
      entryCount: number;
      playerCount: number;
      tenantCount: number;
      lineCount: number;
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
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
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
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake,
      estimatedCommission: r.estimatedCommission ?? 0,
    }));
  }

  // ─── Operations Dashboard Aggregations ───

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
   * Đếm tổng số entries của 1 kỳ quay.
   * Dùng kết hợp với getLatestEntriesByDrawId để hiển thị badge "N đơn".
   */
  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
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
   * Aggregate KPI tổng hợp cho dashboard vận hành Max 3D Pro.
   *
   * Trả về: totalRevenue, totalEntries, totalLines (TripletPair), totalPlayers, totalCommission.
   * Max 3D Pro KHÔNG CÓ Jackpot → không cần totalPayout riêng lẻ trong KPI.
   */
  async aggregateOpsSummary(opts: { financialDate: string; drawId?: string }): Promise<{
    totalRevenue: number;
    totalEntries: number;
    totalLines: number;
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
          totalLines: { $sum: "$lineCount" },
          uniquePlayers: { $addToSet: "$accountId" },
          totalCommission: { $sum: "$tenant.commissionAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalRevenue: 1,
          totalEntries: 1,
          totalLines: 1,
          totalPlayers: { $size: "$uniquePlayers" },
          totalCommission: 1,
        },
      },
    ]);
    const row = (result[0] as any) ?? {};
    return {
      totalRevenue: row.totalRevenue ?? 0,
      totalEntries: row.totalEntries ?? 0,
      totalLines: row.totalLines ?? 0,
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
      lines: number;
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
          lines: { $sum: "$lineCount" },
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
          lines: 1,
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
   * Max 3D Pro: triplets từ entrySummary.boards.triplets (cả multiNumber và multiDigit boards).
   * Revenue xấp xỉ: phân bổ entry.amount theo tỷ lệ lineCount board / lineCount entry.
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
                    { $gt: ["$lineCount", 0] },
                    {
                      $divide: [
                        // Phân bổ theo lineCount của board / tổng lineCount entry
                        { $ifNull: ["$entrySummary.boards.lineCount", 1] },
                        "$lineCount",
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
   * Phân bổ cược theo playMode cho dashboard vận hành Max 3D Pro.
   *
   * Max 3D Pro có 2 playMode: multiNumber và multiDigit (KHÔNG có combo3/combo6).
   * Group by playMode → boardCount, lineCount, entryCount, revenue.
   */
  async aggregatePlayTypeDistribution(opts: { financialDate: string; drawId?: string }): Promise<
    Array<{
      playMode: string;
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
          _id: "$entrySummary.boards.playMode",
          boardCount: { $sum: 1 },
          lineCount: { $sum: "$entrySummary.boards.lineCount" },
          entryIds: { $addToSet: "$_id" },
          // Revenue xấp xỉ: entry.amount × board.lineCount / entry.lineCount
          revenue: {
            $sum: {
              $multiply: [
                "$amount",
                {
                  $cond: [
                    { $gt: ["$lineCount", 0] },
                    {
                      $divide: [{ $ifNull: ["$entrySummary.boards.lineCount", 1] }, "$lineCount"],
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
          playMode: "$_id",
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
   * Top N cặp TripletPair phổ biến nhất trong 1 kỳ.
   *
   * Max 3D Pro: mọi board đều tạo cặp ordered (first, second).
   * Normalize theo sorted pair để (A,B) và (B,A) có cùng key — tương tự plus combos trong Max 3D.
   * Pipeline: unwind boards → lấy tất cả cặp → group by sorted pair → sort → limit.
   *
   * NOTE: aggregate cặp từ expanded pairs sẽ phức tạp (cần $unwind 2 lần cho C(n,2)).
   * Thay vào đó group theo sorted (triplets[0], triplets[1]) để approximate cho multiNumber 2 bộ.
   * Đây là best-effort — chỉ chính xác với boards có đúng 2 triplets.
   */
  async aggregateTopPairCombos(opts: { drawId: string; limit: number }): Promise<
    Array<{
      first: string;
      second: string;
      boardCount: number;
      totalAmount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId: opts.drawId } },
      { $unwind: "$entrySummary.boards" },
      {
        // Chỉ xét boards có đúng 2 triplets (1 cặp rõ ràng)
        $match: {
          "entrySummary.boards.triplets.1": { $exists: true },
          "entrySummary.boards.triplets.2": { $exists: false },
        },
      },
      {
        $project: {
          // Normalize thứ tự: lấy sorted pair để (A,B) và (B,A) có cùng key
          sortedPair: {
            $sortArray: { input: "$entrySummary.boards.triplets", sortBy: 1 },
          },
          entryLineCount: "$lineCount",
          entryAmount: "$amount",
          boardLineCount: "$entrySummary.boards.lineCount",
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
          first: { $first: { $arrayElemAt: ["$sortedPair", 0] } },
          second: { $first: { $arrayElemAt: ["$sortedPair", 1] } },
          boardCount: { $sum: 1 },
          totalAmount: {
            $sum: {
              $multiply: [
                "$entryAmount",
                {
                  $cond: [
                    { $gt: ["$entryLineCount", 0] },
                    { $divide: [{ $ifNull: ["$boardLineCount", 1] }, "$entryLineCount"] },
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
          first: 1,
          second: 1,
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
   * Max 3D Pro: lineCount = số cặp (pairs).
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
   * Trả TicketEntryDoc thô để UI hiển thị chi tiết cặp bộ ba, giải trúng.
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
