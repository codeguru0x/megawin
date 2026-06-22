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

import { Power655Collections, PrizeTier } from "@megawin/game-power655/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { EntryPayout, EntryResult, EntryVoidInfo } from "@megawin/game-power655/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { TicketEntryEntity, TicketEntryDoc } from "@megawin/game-power655/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type {
  PlayerBreakdownRow,
  OutstandingDrawMetrics,
  OutstandingDrawCounts,
  WinningEntryForDispatch,
  VoidedEntryForDispatch,
} from "./types";

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
      .aggregate([{ $match: { drawId } }, { $group: { _id: null, total: { $sum: "$lineCount" } } }])
      .toArray();
    return result[0]?.total ?? 0;
  }

  /** Đếm entries chưa settled (status = "scheduled"). */
  async countScheduledEntries(drawId: string): Promise<number> {
    return await this.count({ drawId, status: EntryStatus.Scheduled });
  }

  // ─── Settle ───

  /**
   * Bulk settle entries sau khi match lines xong.
   *
   * Dùng named types EntryPayout và EntryResult từ entity layer để compiler
   * bắt lỗi nếu thêm/đổi field trong entity. outcome dùng EntryOutcome enum.
   * Atomic per item: filter status = "scheduled" → không double-settle.
   */
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

  // ─── Aggregate for financials ───

  /**
   * Re-aggregate tổng payoutAmount từ tất cả settled entries cho 1 draw.
   *
   * Dùng sau PatchJackpotPrize để tính totalPayout chính xác (giải cố định + jackpot).
   * Kết quả dùng cho $set trên DrawDoc → **idempotent** (thay vì $inc).
   * Query đơn giản: $match + $group + 1 $sum, hit index { drawId, status }.
   */
  async aggregateTotalPayout(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
    ]);
    return (result[0] as any)?.total ?? 0;
  }

  /**
   * Aggregate tổng doanh thu và hoa hồng cho 1 draw (chỉ Settled entries).
   * Group by null — 1 document kết quả, hiệu quả hơn group by tenant
   * khi caller chỉ cần 2 scalar tổng.
   */
  async aggregateTotalRevenue(drawId: string): Promise<{
    totalRevenue: number;
    totalAgentCommission: number;
  }> {
    const col = await this.getCollection();
    const result = (await col
      .aggregate([
        { $match: { drawId, status: EntryStatus.Settled } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$amount" },
            totalAgentCommission: { $sum: "$tenant.commissionAmount" },
          },
        },
      ])
      .toArray()) as any[];
    const row = result[0];
    return {
      totalRevenue: row?.totalRevenue ?? 0,
      totalAgentCommission: row?.totalAgentCommission ?? 0,
    };
  }

  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    /** Tổng số lines đã expand và match (sum matchCount tất cả tiers). */
    totalLines: number;
    /** Số lượt trúng per tier. Key = PrizeTier (vd. "jackpot1", "jackpot2", "tier1", ...). */
    tierWinnerCounts: Partial<Record<PrizeTier, number>>;
    /** Tổng tiền thưởng per tier (VND). Key = PrizeTier. JP = 0 tại bước này. */
    tierPrizeAmounts: Partial<Record<PrizeTier, number>>;
  }> {
    // 1 aggregation duy nhất: facet song song tiers và totals trên cùng $match.
    const facetResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $facet: {
          tiers: [
            { $unwind: "$payout.tiers" },
            { $match: { "payout.tiers.hitCount": { $gt: 0 } } },
            {
              $group: {
                _id: "$payout.tiers.tier",
                totalMatchCount: { $sum: "$payout.tiers.hitCount" },
                totalPrize: { $sum: "$payout.tiers.amount" },
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
                      in: { $add: ["$$value", { $ifNull: ["$$this.hitCount", 0] }] },
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

    for (const t of tiers as any[]) {
      tierWinnerCounts[t._id as PrizeTier] = t.totalMatchCount;
      tierPrizeAmounts[t._id as PrizeTier] = t.totalPrize ?? 0;
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
      tierPrizeAmounts,
    };
  }

  /** Find entries that won JP1 or JP2 in a draw. */
  async findJackpotWinners(drawId: string, jackpotTier?: string): Promise<TicketEntryEntity[]> {
    const tierFilter = jackpotTier ?? { $in: [PrizeTier.Jackpot1, PrizeTier.Jackpot2] };
    return await this.findMany({
      drawId,
      status: EntryStatus.Settled,
      "payout.tiers.tier": tierFilter,
    });
  }

  /** Find JP1-specific winners. */
  async findJackpot1Winners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findJackpotWinners(drawId, PrizeTier.Jackpot1);
  }

  /** Find JP2-specific winners. */
  async findJackpot2Winners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findJackpotWinners(drawId, PrizeTier.Jackpot2);
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
   * @deprecated Dùng patchJackpotPrizePerEntry thay thế để hỗ trợ betCount multiplier.
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

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Patch jackpot prize cho từng entry theo tỷ lệ betCount.
   *
   * Thay vì dùng jackpotPerWinner × hitCount (uniform), mỗi entry nhận:
   *   prizeAmount = jackpotPerUnit × (tổng betCount của các JP lines thuộc entry đó).
   *
   * Đúng luật Vietlott: "Giải Jackpot chia đều theo tỷ lệ giá trị tham gia dự thưởng"
   * → giá trị tham gia = betCount (số lần tham gia dự thưởng).
   *
   * Idempotent: chỉ patch entries có tiers[jackpotTier].amount = 0.
   *
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   * @param perEntryAmounts - Map entryId → amount đã tính trước (jackpotPerUnit × betCount per entry)
   */
  async patchJackpotPrizePerEntry(
    drawId: string,
    jackpotTier: string,
    perEntryAmounts: Map<string, { prizeAmount: number; jackpotPerUnit: number }>,
  ): Promise<number> {
    if (perEntryAmounts.size === 0) return 0;

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
      const entryId = (entry._id as ObjectId).toHexString();
      const prizeInfo = perEntryAmounts.get(entryId);
      const jackpotPerUnit = prizeInfo?.jackpotPerUnit ?? 0;
      const prizeAmount = prizeInfo?.prizeAmount ?? 0;

      const tiers = (entry.payout as any)?.tiers ?? [];
      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === jackpotTier && t.hitCount > 0 && t.amount === 0) {
          // unitAmount = jackpotPerUnit (giá trị 1 đơn vị tham gia dự thưởng)
          // amount = prizeAmount = jackpotPerUnit × tổng betCount của entry này
          return { ...t, unitAmount: jackpotPerUnit, amount: prizeAmount };
        }
        return t;
      });

      // Tổng winAmount = tổng tất cả tiers sau khi patch
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

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  // ─── Ticket Summary ───
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<string[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<string[]>;
  }

  /**
   * Batch aggregate summaries cho nhiều tickets cùng lúc.
   * Power655: $amount cho voidedAmount, $voidInfo.refundAmount cho refund.
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
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$amount", 0],
              },
            },
            totalRefundedAmount: {
              $sum: { $ifNull: ["$voidInfo.refundAmount", 0] },
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
                $cond: [{ $eq: ["$status", EntryStatus.Void] }, "$amount", 0],
              },
            },
            totalRefundedAmount: {
              $sum: { $ifNull: ["$voidInfo.refundAmount", 0] },
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

  /**
   * Bulk void entries theo batch — atomic per entry, crash-safe.
   *
   * Chỉ void entries có status = scheduled (filter trong updateOne).
   * EntryVoidInfo được build bởi caller (use case) — repo chỉ ghi xuống DB.
   */
  async bulkVoidEntries(
    items: Array<{ entryId: string; voidInfo: EntryVoidInfo }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

    const version = await this.nextVersion();
    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: {
          _id: new ObjectId(item.entryId),
          status: EntryStatus.Scheduled,
        },
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

    const docs = (await this.findManyAsDocuments(
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
    )) as any[];

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
            totalOriginalAmount: { $sum: "$amount" },
            totalRefundAmount: {
              $sum: { $ifNull: ["$voidInfo.refundAmount", 0] },
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
            totalStake: { $sum: "$amount" },
            totalCommission: { $sum: "$tenant.commissionAmount" },
            commissionRate: { $first: "$tenant.commissionRate" },
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
            totalStake: { $sum: "$amount" },
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
   * CRASH-SAFE: idempotent, aggregate từ DB.
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
   * Sort theo revenue desc. CRASH-SAFE: idempotent.
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
   * Power 6/55: chỉ có mainNumbers (01-55), bonusNumber không tính vào selection.
   * count = số boards chứa số đó; lines = tổng expandedLines; entries = distinct entries.
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

    // Revenue xấp xỉ: phân bổ entry.amount theo tỉ lệ expandedLines của board.
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
   * Power 6/55: combo key = `${playType}|${sortedMain.join(",")}`.
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

    return result as any[];
  }

  /**
   * Phân bổ cược theo kiểu chơi (PlayType).
   * Power 6/55 có nhiều kiểu chơi bao (bao5, bao7-bao18) + standard.
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
    const filter = this.buildOpsFilter(opts);

    const result = await this.aggregate([
      { $match: filter },
      { $unwind: "$entrySummary.boards" },
      {
        $group: {
          _id: "$entrySummary.boards.playType",
          boardCount: { $sum: 1 },
          lineCount: { $sum: "$entrySummary.boards.expandedLines" },
          entryIds: { $addToSet: "$_id" },
          revenue: { $sum: "$amount" },
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
      { $sort: { revenue: -1 } },
    ]);

    return result as any[];
  }

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
   * Tổng hợp entries trúng thưởng của 1 kỳ quay.
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
  // Aggregation (report)
  // ─────────────────────────────────────────────

  /**
   * Aggregate số player unique per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để đếm playerCount per tenant.
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
      playerCount: r.playerCount ?? 0,
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
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount ?? 0,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake,
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
   * Power655 có lineCount (expanded lines từ bao).
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

  /**
   * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
   *
   * BẮT BUỘC cả drawId lẫn tenantId — KHÔNG query cross-draw.
   * Sắp xếp theo totalStake DESC.
   * Index: { drawId: 1, "tenant.tenantId": 1, accountId: 1 }
   */
  async aggregatePlayersByDrawAndTenant(
    drawId: string,
    tenantId: string,
  ): Promise<PlayerBreakdownRow[]> {
    const result = await this.aggregate([
      {
        $match: {
          drawId,
          tenantId,
          status: EntryStatus.Settled,
        },
      },
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
      username: (r.username ?? r._id) as string,
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
   * Dùng cho Entry Breakdown list.
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async findByDrawTenantPlayer(
    drawId: string,
    tenantId: string,
    accountId: string,
  ): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId, tenantId, accountId });
  }

  /**
   * Phát hiện kỳ T có người trúng Jackpot (JP1/JP2) với kết quả ĐỀ XUẤT hay không
   * — dùng bởi `DetectResettleBoundariesUseCase` ở bước pre-flight.
   *
   * Chạy trên BO API (Next.js/Vercel) qua `TriggerResettleUseCase` → BẮT BUỘC
   * sub-second cả khi kỳ có hàng trăm nghìn → 1 triệu entries (jackpot game).
   *
   * **Vì sao KHÔNG dùng aggregation `$unwind` + `$setIntersection`:** cách đó phải
   * đọc + tính CPU trên TOÀN BỘ entries của kỳ (kể cả board thua); worst case
   * "không có winner" (TYPE_A — phổ biến nhất) phải quét hết mới trả `false`.
   * COLLSCAN/CPU tuyến tính theo số entries → rủi ro timeout.
   *
   * **Cách dùng ở đây — index-only `$elemMatch` + `$all`:** điều kiện JP cực hiếm
   * và biểu diễn được bằng containment trên multikey index
   * `entrySummary.boards.mainNumbers`. MongoDB lọc bằng IXSCAN, chỉ chạm vào
   * documents thực sự chứa các số đó (gần như 0 khi không có winner) →
   * `count({ limit: 1 })` trả về tức thì, KHÔNG phụ thuộc tổng số entries.
   *
   * **Tối ưu `$or` (tránh 7 IXSCAN):** thay vì 1 (JP1) + 6 (JP2) clause top-level
   * — mỗi cái 1 IXSCAN riêng phải dedup `_id` — gom JP2 vào MỘT `$elemMatch` duy
   * nhất, bound bằng `bonus` (1 số cụ thể, chỉ ~1/55 board chứa → cực chọn lọc).
   * Chỉ các board chứa bonus mới eval tiếp `$or` 6 tổ hợp 5-số (đã ở RAM, KHÔNG
   * thêm IXSCAN). Kết quả: chỉ 2 clause top-level (JP1 + JP2), 2 IXSCAN thay vì 7.
   *
   * **Luật match** (theo `prize-tiers.ts` + `match-result.ts`):
   * - JP1 = 1 line trùng đúng 6/6 số chính → tồn tại board chứa ĐỦ cả 6 số winning.
   * - JP2 = 1 line trùng 5/6 + bonus → tồn tại board chứa bonus + ít nhất 5/6 winning.
   *   Bonus LUÔN ∉ winningMain (quay từ 49 bóng còn lại) nên bonus là số thứ 6 độc
   *   lập; "5 trong 6" = 6 tổ hợp con (bỏ lần lượt từng số winning).
   *
   * **Bao N:** board chọn N=5–18 số. `$all` containment đúng tự nhiên — board phải
   * chứa đủ các phần tử trong tổ hợp; bao5 (5 số) không bao giờ thỏa JP1 (cần 6).
   * `$elemMatch` bảo đảm các số nằm trên CÙNG 1 board (không gộp số từ board khác).
   *
   * Hit index `{ drawId, status, "entrySummary.boards.mainNumbers" }` (compound,
   * multikey trên field cuối). Hỗ trợ Settled (resettle lần đầu) + Scheduled
   * (entries đã bị PrepareResettle reset nhưng chưa re-settle — retry detection).
   *
   * @param drawId - Kỳ quay cần check
   * @param proposedWinningMain - 6 số chính đề xuất (string zero-padded "01"-"55")
   * @param proposedBonusNumber - Bonus number đề xuất (string zero-padded)
   * @param statuses - Các status entry cần quét (vd. [Settled, Scheduled])
   * @returns true nếu tồn tại ít nhất 1 board trúng JP1 hoặc JP2 theo kết quả đề xuất
   */
  async existsJpWinnerForDraw(
    drawId: string,
    proposedWinningMain: string[],
    proposedBonusNumber: string,
    statuses: string[],
  ): Promise<boolean> {
    // JP1: tồn tại 1 board chứa đủ cả 6 số winning (→ 6/6 main match).
    const jp1Clause = {
      "entrySummary.boards": {
        $elemMatch: { mainNumbers: { $all: proposedWinningMain } },
      },
    };

    // JP2: tồn tại 1 board chứa bonus VÀ ít nhất 5/6 số winning.
    // "5/6" = bỏ lần lượt từng số → 6 tổ hợp; board chỉ cần thỏa MỘT trong số đó.
    // Bound IXSCAN = `mainNumbers: bonus` (1 số cụ thể, chọn lọc cao); 6 tổ hợp
    // 5-số nằm trong $or NỘI BỘ $elemMatch → eval trên candidate đã fetch, không
    // sinh thêm IXSCAN. Bonus ∉ winningMain (luật chơi) nên không trùng số nào.
    // Lặp từng số winning, tạo 6 tổ hợp 5-số, và gom vào $or.
    const jp2FiveOfSixCombos = proposedWinningMain.map((_, dropIdx) => ({
      mainNumbers: { $all: proposedWinningMain.filter((_, i) => i !== dropIdx) },
    }));
    const jp2Clause = {
      "entrySummary.boards": {
        $elemMatch: {
          mainNumbers: proposedBonusNumber,
          $or: jp2FiveOfSixCombos,
        },
      },
    };

    // Một query duy nhất, 1 roundtrip, 2 clause top-level (JP1 + JP2).
    // count limit:1 dừng ngay khi gặp winner đầu tiên.
    return this.exists({
      drawId,
      status: { $in: statuses },
      $or: [jp1Clause, jp2Clause],
    });
  }
}
