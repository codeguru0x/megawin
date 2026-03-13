import {
  Max3dproCollections,
  PayoutStatus,
  type EntryPayout,
  type EntryVoidInfo,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { AbstractEntryRepository } from "@megawin/game-max3d-core/repos";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";

export class EntryRepository extends AbstractEntryRepository<
  EntryEntity,
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
}

export type { EntryEntity };
