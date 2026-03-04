/**
 * Power 6/55 – Entry Repository
 *
 * Collection: power655TicketEntries
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

import { Power655Collections, PayoutStatus } from "@megawin/game-power655/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import type { PrizeTier, MainTuple, BonusNumber } from "@megawin/game-power655/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { TicketEntryEntity } from "@megawin/game-power655/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Power655Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  /** Insert 1 entry mới kèm version từ global sequence. */
  async insertEntry(doc: Record<string, unknown>): Promise<string> {
    const version = await this.nextVersion();
    return await this.insertOne({ ...doc, version } as any);
  }

  /** Insert nhiều entries đã có sẵn version. */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const result = await this.insertMany(docs as any[]);
    return result.insertedCount;
  }

  // ─── Query ───

  async getEntryById(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawTime: 1 } });
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

  /** Lấy batch entries theo drawId + status "scheduled" (cho settle batch loop). */
  async getScheduledEntriesBatch(
    drawId: string,
    page: number,
    size: number,
  ): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { _id: 1 },
    });
  }

  /** Lấy scheduled entries theo drawId với limit cố định (không cần page). */
  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { _id: 1 }, limit },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async countLinesByDrawId(drawId: string): Promise<number> {
    const col = await this.getCollection();
    const result = await col
      .aggregate([
        { $match: { drawId } },
        { $group: { _id: null, total: { $sum: "$entrySummary.totalLines" } } },
      ])
      .toArray();
    return result[0]?.total ?? 0;
  }

  /** Đếm entries chưa settled (status = "scheduled"). */
  async countScheduledEntries(drawId: string): Promise<number> {
    return await this.count({ drawId, status: EntryStatus.Scheduled });
  }

  /**
   * Batch update entry status cho 1 draw.
   * Tất cả entries trong batch nhận cùng 1 version mới.
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

  // ─── Settle ───

  /**
   * Atomic settle 1 entry.
   * Chỉ update nếu status = "scheduled" → no duplicate khi retry.
   */
  async settleEntry(
    entryId: string,
    payout: {
      winAmount: number;
      payoutAmount: number;
      tiers: Array<{
        tier: string;
        matchCount: number;
        prizePerLine: number;
        totalPrize: number;
        isSplitBonus?: boolean;
      }>;
      settledAt: Date;
      payoutStatus?: PayoutStatus;
    },
    outcome: "win" | "loss",
    result: {
      winningMain: MainTuple;
      bonusNumber: BonusNumber;
      publishedAt: Date;
    },
  ): Promise<boolean> {
    const version = await this.nextVersion();
    const col = await this.getCollection();

    const $set: Record<string, unknown> = {
      status: EntryStatus.Settled,
      outcome,
      result,
      "payout.winAmount": payout.winAmount,
      "payout.payoutAmount": payout.payoutAmount,
      "payout.tiers": payout.tiers,
      settledAt: payout.settledAt,
      version,
      updatedAt: new Date(),
    };

    if (payout.payoutStatus) {
      $set["payout.payoutStatus"] = payout.payoutStatus;
      $set["payout.retryCount"] = 0;
    }

    const updateResult = await col.updateOne(
      { _id: new ObjectId(entryId), status: EntryStatus.Scheduled },
      { $set },
    );

    return updateResult.modifiedCount > 0;
  }

  // ─── Aggregate for financials ───

  async aggregateRevenueByTenant(drawId: string): Promise<
    Array<{
      tenantId: string;
      revenue: number;
      commission: number;
      entryCount: number;
    }>
  > {
    const col = await this.getCollection();
    return col
      .aggregate([
        { $match: { drawId, status: EntryStatus.Settled } },
        {
          $group: {
            _id: "$tenantId",
            revenue: { $sum: "$stakeAmount" },
            commission: { $sum: { $ifNull: ["$commission.amount", 0] } },
            entryCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            tenantId: "$_id",
            revenue: 1,
            commission: 1,
            entryCount: 1,
          },
        },
      ])
      .toArray() as any;
  }

  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    tierWinnerCounts: Record<string, number>;
  }> {
    const col = await this.getCollection();
    const entries = await col
      .find({ drawId, status: EntryStatus.Settled })
      .project({ "payout.tiers": 1, "payout.payoutAmount": 1 })
      .toArray();

    let totalPayoutAmount = 0;
    let totalFixedPrizes = 0;
    const tierWinnerCounts: Record<string, number> = {};

    for (const e of entries) {
      totalPayoutAmount += (e as any).payout?.payoutAmount ?? 0;
      const tiers = (e as any).payout?.tiers ?? [];
      for (const t of tiers) {
        if (t.matchCount > 0) {
          tierWinnerCounts[t.tier] = (tierWinnerCounts[t.tier] ?? 0) + t.matchCount;
          if (t.tier !== "jackpot1" && t.tier !== "jackpot2") {
            totalFixedPrizes += t.totalPrize ?? 0;
          }
        }
      }
    }

    return {
      totalSettled: entries.length,
      totalPayoutAmount,
      totalFixedPrizes,
      tierWinnerCounts,
    };
  }

  /** Find entries that won JP1 or JP2 in a draw. */
  async findJackpotWinners(drawId: string, jackpotTier?: string): Promise<TicketEntryEntity[]> {
    const tierFilter = jackpotTier ?? { $in: ["jackpot1", "jackpot2"] };
    return await this.findMany({
      drawId,
      status: EntryStatus.Settled,
      "payout.tiers.tier": tierFilter,
    });
  }

  /** Find JP1-specific winners. */
  async findJackpot1Winners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findJackpotWinners(drawId, "jackpot1");
  }

  /** Find JP2-specific winners. */
  async findJackpot2Winners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findJackpotWinners(drawId, "jackpot2");
  }

  // ─── Split Bonus ───

  async applySplitBonusForTier(
    drawId: string,
    tier: string,
    bonusPerWinner: number,
  ): Promise<number> {
    const col = await this.getCollection();
    const result = await col.updateMany(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.tiers": {
          $elemMatch: { tier, isSplitBonus: { $ne: true } },
        },
      },
      {
        $set: {
          "payout.tiers.$[elem].isSplitBonus": true,
          "payout.tiers.$[elem].splitBonusAmount": bonusPerWinner,
        },
        $inc: {
          "payout.winAmount": bonusPerWinner,
          "payout.payoutAmount": bonusPerWinner,
        },
      },
      { arrayFilters: [{ "elem.tier": tier }] },
    );
    return result.modifiedCount;
  }

  // ─── Ticket Summary ───

  async getDistinctTicketIdsByDrawId(drawId: string): Promise<string[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<string[]>;
  }

  /**
   * Batch aggregate summaries cho nhiều tickets cùng lúc.
   * Power655: ticketId là ObjectId trong entries, $stakeAmount cho voidedAmount, $refund.refundAmount cho refund.
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
    const col = await this.getCollection();
    const result = await col
      .aggregate([
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
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$stakeAmount", 0],
              },
            },
            totalRefundedAmount: {
              $sum: { $ifNull: ["$refund.refundAmount", 0] },
            },
            voidedDrawIds: {
              $addToSet: {
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$drawId", "$$REMOVE"],
              },
            },
          },
        },
      ])
      .toArray();

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

    for (const r of result) {
      map.set((r._id as ObjectId).toHexString(), {
        settledCount: r.settledCount as number,
        voidedCount: r.voidedCount as number,
        totalWinAmount: r.totalWinAmount as number,
        totalVoidedAmount: r.totalVoidedAmount as number,
        totalRefundedAmount: r.totalRefundedAmount as number,
        voidedDrawIds: (r.voidedDrawIds as string[]).filter(Boolean),
      });
    }

    return map;
  }

  async aggregateTicketSummary(ticketId: unknown): Promise<{
    settledCount: number;
    voidedCount: number;
    totalWinAmount: number;
    totalVoidedAmount: number;
    totalRefundedAmount: number;
    voidedDrawIds: string[];
  }> {
    const col = await this.getCollection();
    const oid = ticketId instanceof ObjectId ? ticketId : new ObjectId(String(ticketId));

    const result = await col
      .aggregate([
        { $match: { ticketId: oid } },
        {
          $group: {
            _id: null,
            settledCount: {
              $sum: {
                $cond: [{ $eq: ["$status", EntryStatus.Settled] }, 1, 0],
              },
            },
            voidedCount: {
              $sum: { $cond: [{ $eq: ["$status", EntryStatus.Void] }, 1, 0] },
            },
            totalWinAmount: {
              $sum: { $ifNull: ["$payout.winAmount", 0] },
            },
            totalVoidedAmount: {
              $sum: {
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$stakeAmount", 0],
              },
            },
            totalRefundedAmount: {
              $sum: { $ifNull: ["$refund.refundAmount", 0] },
            },
            voidedDrawIds: {
              $addToSet: {
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$drawId", "$$REMOVE"],
              },
            },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return {
        settledCount: 0,
        voidedCount: 0,
        totalWinAmount: 0,
        totalVoidedAmount: 0,
        totalRefundedAmount: 0,
        voidedDrawIds: [],
      };
    }

    const r = result[0]!;
    return {
      settledCount: r.settledCount,
      voidedCount: r.voidedCount,
      totalWinAmount: r.totalWinAmount,
      totalVoidedAmount: r.totalVoidedAmount,
      totalRefundedAmount: r.totalRefundedAmount,
      voidedDrawIds: r.voidedDrawIds.filter(Boolean),
    };
  }

  // ─── Payout Dispatch ───

  async getPendingPayoutEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Settled,
        "payout.payoutStatus": {
          $in: [PayoutStatus.Pending, PayoutStatus.Failed],
        },
      },
      { sort: { _id: 1 }, limit },
    );
  }

  async countPendingPayoutEntries(drawId: string): Promise<number> {
    return await this.count({
      drawId,
      status: EntryStatus.Settled,
      "payout.payoutStatus": {
        $in: [PayoutStatus.Pending, PayoutStatus.Failed],
      },
    });
  }

  async batchMarkPayoutDispatched(entryIds: string[]): Promise<void> {
    const col = await this.getCollection();
    const oids = entryIds.map((id) => new ObjectId(id));
    await col.updateMany(
      { _id: { $in: oids } },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Dispatched,
          "payout.dispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async batchMarkPayoutFailed(entryIds: string[], error: string): Promise<void> {
    const col = await this.getCollection();
    const oids = entryIds.map((id) => new ObjectId(id));
    await col.updateMany(
      { _id: { $in: oids } },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Failed,
          "payout.lastError": error,
          updatedAt: new Date(),
        },
        $inc: { "payout.retryCount": 1 },
      },
    );
  }

  // ─── Void ───

  async countVoidableEntries(drawId: string): Promise<number> {
    return await this.count({
      drawId,
      status: EntryStatus.Scheduled,
    });
  }

  async getVoidableEntriesBatch(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Scheduled,
      },
      { sort: { _id: 1 }, limit },
    );
  }

  async voidEntry(
    entryId: string,
    info: {
      reason: string;
      originalAmount: number;
      refundAmount: number;
      voidedBy?: string;
    },
  ): Promise<boolean> {
    const version = await this.nextVersion();
    const col = await this.getCollection();
    const now = new Date();

    const result = await col.updateOne(
      {
        _id: new ObjectId(entryId),
        status: EntryStatus.Scheduled,
      },
      {
        $set: {
          status: EntryStatus.Void,
          voidedAt: now,
          "refund.refundAmount": info.refundAmount,
          "refund.refundStatus": "pending",
          "refund.reason": info.reason,
          "refund.retryCount": 0,
          version,
          updatedAt: now,
        },
      },
    );

    return result.modifiedCount > 0;
  }

  async getPendingRefundEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Void,
        "refund.refundStatus": { $in: ["pending", "failed"] },
      },
      { sort: { _id: 1 }, limit },
    );
  }

  async markRefundDispatched(entryId: string): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "refund.refundStatus": "dispatched",
          "refund.dispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async markRefundFailed(entryId: string, error: string): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "refund.refundStatus": "failed",
          "refund.lastError": error,
          updatedAt: new Date(),
        },
        $inc: { "refund.retryCount": 1 },
      },
    );
  }

  async aggregateVoidRefundSummary(drawId: string): Promise<{
    totalVoidedEntries: number;
    totalOriginalAmount: number;
    totalRefundAmount: number;
  }> {
    const col = await this.getCollection();
    const result = await col
      .aggregate([
        { $match: { drawId, status: EntryStatus.Void } },
        {
          $group: {
            _id: null,
            totalVoidedEntries: { $sum: 1 },
            totalOriginalAmount: { $sum: "$stakeAmount" },
            totalRefundAmount: {
              $sum: { $ifNull: ["$refund.refundAmount", 0] },
            },
          },
        },
      ])
      .toArray();

    if (result.length === 0) {
      return {
        totalVoidedEntries: 0,
        totalOriginalAmount: 0,
        totalRefundAmount: 0,
      };
    }

    return result[0] as any;
  }

  // ─── Feed Sync ───

  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─── Reports ───

  async aggregateTenantReport(
    drawId: string,
    financialDate: string,
  ): Promise<
    Array<{
      tenantId: string;
      totalStake: number;
      totalCommission: number;
      commissionRate: number;
      totalPayout: number;
      totalWin: number;
      entryCount: number;
    }>
  > {
    const col = await this.getCollection();
    return col
      .aggregate([
        { $match: { drawId, status: EntryStatus.Settled } },
        {
          $group: {
            _id: "$tenantId",
            totalStake: { $sum: "$stakeAmount" },
            totalCommission: { $sum: { $ifNull: ["$commission.amount", 0] } },
            commissionRate: { $first: { $ifNull: ["$commission.rate", 0] } },
            totalPayout: {
              $sum: { $ifNull: ["$payout.payoutAmount", 0] },
            },
            totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
            entryCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            tenantId: "$_id",
            totalStake: 1,
            totalCommission: 1,
            commissionRate: 1,
            totalPayout: 1,
            totalWin: 1,
            entryCount: 1,
          },
        },
      ])
      .toArray() as any;
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
    const col = await this.getCollection();
    return col
      .aggregate([
        { $match: { drawId, status: EntryStatus.Settled } },
        {
          $group: {
            _id: { tenantId: "$tenantId", accountId: "$accountId" },
            totalStake: { $sum: "$stakeAmount" },
            totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
            totalPayout: {
              $sum: { $ifNull: ["$payout.payoutAmount", 0] },
            },
            entryCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            tenantId: "$_id.tenantId",
            accountId: "$_id.accountId",
            totalStake: 1,
            totalWin: 1,
            totalPayout: 1,
            entryCount: 1,
          },
        },
      ])
      .toArray() as any;
  }
}
