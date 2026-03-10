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

import { Power655Collections, PayoutStatus, PrizeTier } from "@megawin/game-power655/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { MainTuple, BonusNumber } from "@megawin/game-power655/entities";
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

  /** Insert nhiều entries — tự allocate version từ global sequence. */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const version = await this.nextVersion();
    const stamped = docs.map((doc) => ({ ...doc, version }));
    const result = await this.insertMany(stamped as any[]);
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

  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      payout: {
        winAmount: number;
        payoutAmount: number;
        tiers: Array<{
          tier: string;
          matchCount: number;
          prizePerLine: number;
          totalPrize: number;
        }>;
        settledAt: Date;
        payoutStatus?: PayoutStatus;
      };
      outcome: "win" | "loss";
      result: {
        winningMain: MainTuple;
        bonusNumber: BonusNumber;
        publishedAt: Date;
      };
    }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

    const version = await this.nextVersion();
    const now = new Date();

    const ops = items.map((item) => {
      const $set: Record<string, unknown> = {
        status: EntryStatus.Settled,
        outcome: item.outcome,
        result: item.result,
        "payout.winAmount": item.payout.winAmount,
        "payout.payoutAmount": item.payout.payoutAmount,
        "payout.tiers": item.payout.tiers,
        settledAt: item.payout.settledAt,
        version,
        updatedAt: now,
      };

      if (item.payout.payoutStatus) {
        $set["payout.payoutStatus"] = item.payout.payoutStatus;
        $set["payout.retryCount"] = 0;
      }

      return {
        updateOne: {
          filter: { _id: new ObjectId(item.entryId), status: EntryStatus.Scheduled },
          update: { $set },
        },
      };
    });

    const col = await this.getCollection();
    const result = await col.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─── Aggregate for financials ───

  async aggregateRevenueByTenant(drawId: string): Promise<
    Array<{
      tenantId: string;
      revenue: number;
      commission: number;
      /** Tỷ lệ hoa hồng snapshot lúc place-bet (lấy $first — đồng nhất per tenant per draw). */
      commissionRate: number;
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
            commissionRate: { $first: { $ifNull: ["$commission.rate", 0] } },
            entryCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            tenantId: "$_id",
            revenue: 1,
            commission: 1,
            commissionRate: 1,
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
    /** Tổng số lines đã expand và match (sum matchCount tất cả tiers). */
    totalLines: number;
    tierWinnerCounts: Record<string, number>;
  }> {
    // 1 aggregation duy nhất: facet song song tiers và totals trên cùng $match.
    const facetResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $facet: {
          tiers: [
            { $unwind: "$payout.tiers" },
            { $match: { "payout.tiers.matchCount": { $gt: 0 } } },
            {
              $group: {
                _id: "$payout.tiers.tier",
                totalMatchCount: { $sum: "$payout.tiers.matchCount" },
                totalPrize: { $sum: "$payout.tiers.totalPrize" },
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalSettled: { $sum: 1 },
                totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
                totalLines: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ["$payout.tiers", []] },
                      initialValue: 0,
                      in: { $add: ["$$value", { $ifNull: ["$$this.matchCount", 0] }] },
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
    const tierWinnerCounts: Record<string, number> = {};

    for (const t of tiers as any[]) {
      tierWinnerCounts[t._id] = t.totalMatchCount;
      if (t._id !== "jackpot1" && t._id !== "jackpot2") {
        totalFixedPrizes += t.totalPrize ?? 0;
      }
    }

    return {
      totalSettled: summary.totalSettled ?? 0,
      totalPayoutAmount: summary.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      totalLines: summary.totalLines ?? 0,
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

  // ─────────────────────────────────────────────
  // Jackpot Prize Patch
  // ─────────────────────────────────────────────

  /**
   * Patch jackpotPerWinner vào tất cả entries trúng jackpotTier trong draw.
   *
   * Idempotent: chỉ update entries có tiers[jackpotTier].amount = 0
   * (chưa được patch). Entries đã patch (amount > 0) sẽ bị skip.
   *
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   * Returns số entries đã patch.
   */
  async patchJackpotPrize(
    drawId: string,
    jackpotTier: string,
    jackpotPerWinner: number,
  ): Promise<number> {
    const filter = {
      drawId,
      status: EntryStatus.Settled,
      outcome: EntryOutcome.Win,
      "payout.tiers": {
        $elemMatch: {
          tier: jackpotTier,
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
        (t: any) => t.tier === jackpotTier && t.hitCount > 0 && t.amount === 0,
      );
      const hitCount = jpTier?.hitCount ?? 0;
      const prizeAmount = jackpotPerWinner * hitCount;

      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === jackpotTier && t.hitCount > 0 && t.amount === 0) {
          return { ...t, unitAmount: jackpotPerWinner, amount: prizeAmount };
        }
        return t;
      });

      // Tổng winAmount mới = tổng tất cả tiers sau khi patch
      const newWinAmount = updatedTiers.reduce((s: number, t: any) => s + (t.amount ?? 0), 0);

      return {
        updateOne: {
          filter: {
            _id: entry._id,
            "payout.tiers": {
              $elemMatch: { tier: jackpotTier, hitCount: { $gt: 0 }, amount: 0 },
            },
          },
          update: {
            $set: {
              "payout.tiers": updatedTiers,
              "payout.winAmount": newWinAmount,
              "payout.payoutAmount": newWinAmount,
              updatedAt: new Date(),
            },
          } as any,
        },
      };
    });

    const col = await this.getCollection();
    const result = await col.bulkWrite(ops, { ordered: false });
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

  async getVoidableEntriesBatch(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Scheduled,
      },
      { sort: { _id: 1 }, limit },
    );
  }

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
            voidedAt: now,
            refund: {
              refundAmount: item.amount,
              refundStatus: "pending",
              reason: "",
              retryCount: 0,
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
