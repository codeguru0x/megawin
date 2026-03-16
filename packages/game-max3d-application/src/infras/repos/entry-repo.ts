import {
  Max3dCollections,
  PayoutStatus,
  type EntryPayout,
  type EntryVoidInfo,
  type TicketEntryDoc,
  type TicketEntryEntity,
} from "@megawin/game-max3d/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId } from "mongodb";
import { AbstractEntryRepository } from "@megawin/game-max3d-core/repos";
import { EntryMapper } from "../mappers/entry-mapper";

import type { PlayerBreakdownRow, OutstandingDrawMetrics, OutstandingDrawCounts } from "./types/entry.types";

export class EntryRepository extends AbstractEntryRepository<
  TicketEntryEntity,
  EntryMapper,
  Max3dDrawResult,
  string,
  EntryPayout,
  EntryVoidInfo
> {
  constructor() {
    super({
      collName: Max3dCollections.TicketEntries,
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

  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

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
   * Aggregate numerical metrics cho các draws active (status: scheduled, drawId in activeDrawIds).
   *
   * Tách riêng khỏi aggregateOutstandingCountsByDraw để tránh $addToSet lớn trong 1 group.
   * Max 3D có lineCount (1 cho straight, 3/6 cho combo).
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

    return (result as any[]).map((r) => ({
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
   * Trả về: totalRevenue, totalEntries, totalLines, totalPlayers, totalCommission.
   * Max 3D KHÔNG CÓ Jackpot → không cần totalPayout riêng lẻ trong KPI.
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
   * Phân bổ cược theo (playMode, playType) cho dashboard vận hành Max 3D.
   *
   * Max 3D có basic × {straight, combo3, combo6, quickPick} và plus × {straight, quickPick}.
   * Group by (playMode, playType) → boardCount, lineCount, entryCount, revenue.
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
          triplet1: { $first: { $arrayElemAt: ["$sortedPair", 0] } },
          triplet2: { $first: { $arrayElemAt: ["$sortedPair", 1] } },
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
   * Trả TicketEntryDoc thô để UI hiển thị chi tiết.
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
