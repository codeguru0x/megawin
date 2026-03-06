/**
 * Mega 6/45 – Entry Repository
 *
 * Collection: mega645_ticket_entries
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

import { Mega645Collections, PayoutStatus } from "@megawin/game-mega645/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { MainTuple } from "@megawin/game-mega645/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Mega645Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. Dùng cho place-bet, settle, void... */
  async nextVersion(): Promise<Long> {
    return this.seqRepo.nextSeq();
  }

  /**
   * Insert 1 entry mới kèm version từ global sequence.
   * Tự allocate version — dùng khi chỉ cần insert đơn lẻ.
   */
  async insertEntry(doc: Record<string, unknown>): Promise<string> {
    const version = await this.nextVersion();
    return await this.insertOne({ ...doc, version } as any);
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

  // ─────────────────────────────────────────────
  // Query
  // ─────────────────────────────────────────────

  async getEntryById(entryId: string): Promise<EntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  async getEntriesByTicketId(ticketId: string): Promise<EntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawTime: 1 } });
  }

  async getEntriesByDrawId(drawId: string, page: number, size: number): Promise<EntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy batch entries theo drawId + status (cho settle batch loop). */
  async getScheduledEntriesBatch(
    drawId: string,
    page: number,
    size: number,
  ): Promise<EntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy entries scheduled cho settle batch — query đơn giản hơn paging. */
  async getScheduledEntries(drawId: string, limit: number): Promise<EntryEntity[]> {
    return await this.findMany(
      { drawId, status: EntryStatus.Scheduled },
      { sort: { createdAt: 1 }, limit },
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  async countLinesByDrawId(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId } },
      { $group: { _id: null, total: { $sum: "$lineCount" } } },
    ]);
    return (result[0] as any)?.total ?? 0;
  }

  // ─────────────────────────────────────────────
  // Status Transitions
  // ─────────────────────────────────────────────

  /**
   * Batch update entry status cho 1 draw.
   * Tất cả entries trong batch nhận cùng 1 version mới (1 event thay đổi).
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

  async bulkSettleEntries(
    items: Array<{
      entryId: string;
      payout: {
        winAmount: number;
        payoutAmount: number;
        tiers: Array<{
          tier: string;
          hitCount: number;
          unitAmount: number;
          amount: number;
          isSplitBonus?: boolean;
        }>;
        settledAt: Date;
        payoutStatus?: string;
      };
      outcome: string;
      result: { winningMain: MainTuple; publishedAt: Date };
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

  // ─────────────────────────────────────────────
  // Aggregation (settle financials / report)
  // ─────────────────────────────────────────────

  /** Revenue + commission per tenant cho 1 draw (exclude voided entries). */
  async aggregateRevenueByTenant(drawId: string): Promise<
    Array<{
      tenantId: string;
      revenue: number;
      commission: number;
      entryCount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId, status: { $ne: EntryStatus.Void } } },
      {
        $group: {
          _id: "$tenantId",
          revenue: { $sum: "$amount" },
          commission: { $sum: "$tenant.commissionAmount" },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      revenue: r.revenue,
      commission: r.commission ?? 0,
      entryCount: r.entryCount,
    }));
  }

  /**
   * Aggregate tổng tiền giải cố định + tier counts từ settled entries.
   * Tính lại từ DB – không phụ thuộc accumulator.
   * Dùng cho calculate-financials sau khi settle xong.
   */
  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    tierWinnerCounts: Record<string, number>;
  }> {
    const result = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      { $unwind: "$payout.tiers" },
      {
        $group: {
          _id: "$payout.tiers.tier",
          totalHitCount: { $sum: "$payout.tiers.hitCount" },
          totalAmount: { $sum: "$payout.tiers.amount" },
        },
      },
    ]);

    let totalFixedPrizes = 0;
    const tierWinnerCounts: Record<string, number> = {};

    for (const r of result as any[]) {
      tierWinnerCounts[r._id] = r.totalHitCount;
      if (r._id !== "jackpot") {
        totalFixedPrizes += r.totalAmount;
      }
    }

    const summaryResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $group: {
          _id: null,
          totalSettled: { $sum: 1 },
          totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
    ]);
    const summary = (summaryResult[0] as any) ?? {};

    return {
      totalSettled: summary.totalSettled ?? 0,
      totalPayoutAmount: summary.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      tierWinnerCounts,
    };
  }

  /** Aggregate report per tenant cho 1 draw + financialDate. */
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

  /** Aggregate report per player per tenant cho 1 draw + financialDate. */
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

  // ─────────────────────────────────────────────
  // Payout Dispatch
  // ─────────────────────────────────────────────

  /**
   * Lấy batch entries trúng thưởng chưa dispatch (hoặc failed) cho 1 draw.
   * Dùng cho payout worker loop.
   */
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

  /** Đếm entries chưa dispatch xong cho 1 draw. */
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

  /** Đánh dấu entry đã dispatch thành công (không bump version — operational only). */
  async markPayoutDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Dispatched,
          "payout.payoutDispatchedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  /** Đánh dấu entry dispatch thất bại + ghi lỗi (không bump version). */
  async markPayoutFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "payout.payoutStatus": PayoutStatus.Failed,
          "payout.payoutLastError": error,
          updatedAt: new Date(),
        },
        $inc: { "payout.payoutRetryCount": 1 },
      },
    );
  }

  /** Batch đánh dấu dispatched cho nhiều entries (không bump version). */
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

  /** Batch đánh dấu failed cho nhiều entries (không bump version). */
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

  // ─────────────────────────────────────────────
  // Void Draw
  // ─────────────────────────────────────────────

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled (chưa settled, chưa void).
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
            voidInfo: {
              originalAmount: item.amount,
              refundAmount: item.amount,
              refundStatus: "pending",
              voidedAt: now,
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

  /**
   * Lấy entries đã void nhưng chưa hoàn tiền cho 1 draw.
   * Dùng cho refund dispatch loop.
   */
  async getPendingRefundEntries(drawId: string, limit: number): Promise<EntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Void,
        "voidInfo.refundStatus": { $in: ["pending", "failed"] },
      },
      { sort: { createdAt: 1 }, limit },
    );
  }

  /** Đánh dấu entry đã dispatch refund thành công (không bump version). */
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

  /** Đánh dấu entry refund thất bại (không bump version). */
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

  /** Aggregate tổng tiền hoàn trả cho 1 draw bị void. */
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

  // ─────────────────────────────────────────────
  // Ticket Summary Aggregation
  // ─────────────────────────────────────────────

  /**
   * Aggregate tóm tắt ticket từ TẤT CẢ entries của 1 ticket.
   * Dùng cho SyncTicketSummaries — tính lại toàn bộ từ source of truth (entries).
   */
  async aggregateTicketSummary(ticketId: string): Promise<{
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
      map.set(r._id, {
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
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<string[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<string[]>;
  }

  // ─────────────────────────────────────────────
  // Feed Sync (cho worker sync-entry-feed)
  // ─────────────────────────────────────────────

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<EntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─────────────────────────────────────────────
  // Jackpot Split Bonus
  // ─────────────────────────────────────────────

  /**
   * Patch bonusPerWinner cho 1 tier lên tất cả entries trúng tier đó.
   * Idempotent: chỉ update entries chưa có tier entry với isSplitBonus=true cho tier cụ thể.
   *
   * - Push tier mới với isSplitBonus=true vào payout.tiers
   * - Inc payout.winAmount + payout.payoutAmount
   *
   * Returns số entries đã patch.
   */
  async applySplitBonusForTier(
    drawId: string,
    tier: string,
    bonusPerWinner: number,
  ): Promise<number> {
    const col = await this.getCollection();

    const filter = {
      drawId,
      status: EntryStatus.Settled,
      "payout.tiers": {
        $elemMatch: { tier, hitCount: { $gt: 0 }, isSplitBonus: { $ne: true } },
      },
      $nor: [{ "payout.tiers": { $elemMatch: { tier, isSplitBonus: true } } }],
    };

    const matchingEntries = await col
      .find(filter, { projection: { _id: 1, "payout.tiers": 1 } })
      .toArray();

    if (matchingEntries.length === 0) return 0;

    const ops = matchingEntries.map((entry) => {
      const tierEntry = (entry.payout as any)?.tiers?.find(
        (t: any) => t.tier === tier && t.hitCount > 0 && !t.isSplitBonus,
      );
      const hitCount = tierEntry?.hitCount ?? 0;
      const bonusAmount = bonusPerWinner * hitCount;

      return {
        updateOne: {
          filter: {
            _id: entry._id,
            $nor: [{ "payout.tiers": { $elemMatch: { tier, isSplitBonus: true } } }],
          },
          update: {
            $push: {
              "payout.tiers": {
                tier,
                hitCount,
                unitAmount: bonusPerWinner,
                amount: bonusAmount,
                isSplitBonus: true,
              },
            },
            $inc: {
              "payout.winAmount": bonusAmount,
              "payout.payoutAmount": bonusAmount,
            },
          } as any,
        },
      };
    });

    const result = await col.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  // ─────────────────────────────────────────────
  // Jackpot Winners
  // ─────────────────────────────────────────────

  /**
   * Tìm entries trúng giải Jackpot trong 1 draw.
   * Jackpot = có payout.tiers chứa tier "jackpot" với hitCount > 0.
   */
  async findJackpotWinners(drawId: string): Promise<EntryEntity[]> {
    return this.findMany({
      drawId,
      "payout.tiers": {
        $elemMatch: { tier: "jackpot", hitCount: { $gt: 0 } },
      },
    });
  }
}
