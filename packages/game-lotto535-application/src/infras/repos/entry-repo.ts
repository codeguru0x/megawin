/**
 * Lotto 5/35 – Entry Repository
 *
 * Collection: lotto535TicketEntries
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

import {
  Lotto535Collections,
  PayoutStatus,
  PrizeTier,
  type EntryPayout,
  type EntryVoidInfo,
  type EntryResult,
} from "@megawin/game-lotto535/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  private readonly seqRepo = new EntryChangeSeqRepository();

  constructor() {
    super({
      collName: Lotto535Collections.TicketEntries,
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

  /** Lấy entries scheduled cho settle — luôn page 1, dùng findMany + limit. */
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
  // Settle Summary (dùng cho CalculateFinancials)
  // ─────────────────────────────────────────────

  /**
   * Aggregate tất cả số liệu cần cho CalculateFinancials trong 1 pipeline duy nhất.
   *
   * Thay thế 3 pipeline riêng biệt (aggregateSettledPayoutSummary × 2 + countLinesByDrawId):
   *   - Trước: scan 3 lần cùng tập { drawId, status: Settled }
   *   - Sau:   1 $match → fan-out qua $facet → scan 1 lần
   *
   * Recommended index: { drawId: 1, status: 1 }
   *
   * $facet gồm 2 nhánh chạy song song trên cùng input:
   *   - tierSummary: $unwind + $group by tier → hitCount + amount mỗi tier
   *   - totals:      $group all → totalSettled + totalPayoutAmount + totalLines
   */
  async aggregateSettleSummary(drawId: string): Promise<{
    /** Tổng số entries đã settle. */
    totalSettled: number;
    /** Tổng tiền payout (winAmount sau split bonus nếu có). */
    totalPayoutAmount: number;
    /**
     * Tổng tiền giải cố định (tier1–consolation, KHÔNG bao gồm Jackpot).
     * Jackpot loại ra vì amount = 0 lúc settle, tiền thực xử lý ở ApplySplitBonuses / FinalizeSettle.
     */
    totalFixedPrizes: number;
    /** Tổng số lines của tất cả entries trong kỳ này. */
    totalLines: number;
    /**
     * Số lần trúng theo từng tier.
     * Key = tier name (ví dụ "tier1", "jackpot").
     * Value = tổng hitCount của tất cả entries có tier đó.
     */
    tierWinnerCounts: Record<string, number>;
  }> {
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
                totalPayoutAmount: {
                  $sum: { $ifNull: ["$payout.payoutAmount", 0] },
                },
                totalLines: { $sum: "$lineCount" },
              },
            },
          ],
        },
      },
    ]);

    const totals = (facetResult as any)?.totals?.[0] ?? {};
    const tierRows = (facetResult as any)?.tierSummary ?? [];

    let totalFixedPrizes = 0;
    const tierWinnerCounts: Record<string, number> = {};

    for (const row of tierRows) {
      tierWinnerCounts[row._id] = row.totalHitCount;
      // Jackpot tier không tính vào totalFixedPrizes:
      // amount = 0 khi settle, tiền Jackpot xử lý riêng ở ApplySplitBonuses / FinalizeSettle.
      if (row._id !== PrizeTier.Jackpot) {
        totalFixedPrizes += row.totalAmount;
      }
    }

    return {
      totalSettled: totals.totalSettled ?? 0,
      totalPayoutAmount: totals.totalPayoutAmount ?? 0,
      totalFixedPrizes,
      totalLines: totals.totalLines ?? 0,
      tierWinnerCounts,
    };
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

  /**
   * Revenue + commission per tenant cho 1 draw (exclude voided entries).
   *
   * Recommended index: { drawId: 1, status: 1 }
   */
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
   * $match ticketId ∈ batch → $group by ticketId → Map<string, summary>.
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
  /**
   * Patch split bonus Jackpot vào tất cả entries trúng tier trong 1 draw.
   *
   * Được gọi bởi ApplySplitBonuses sau khi CalculateFinancials đã tính xong
   * bonusPerWinner cho từng tier (tier1-tier5).
   *
   * ── FILTER STRATEGY ──
   *   1. outcome: "win" — chỉ scan entries THẮNG, loại bỏ ~90%+ entries thua ngay từ index.
   *      Entries thua không bao giờ có payout.tiers nên filter array là vô nghĩa với chúng.
   *   2. $elemMatch: { tier, hitCount > 0 } — chỉ lấy entries thực sự trúng tier này.
   *   3. $nor (document-level idempotent guard): đảm bảo entry CHƯA được patch tier này.
   *      $nor cần thiết vì $elemMatch là element-level check (1 phần tử thỏa mãn điều kiện),
   *      còn ta cần document-level check: "không tồn tại bất kỳ phần tử nào có
   *      { tier, isSplitBonus: true }". Hai điều kiện này hoạt động ở scope khác nhau.
   *
   * ── IDEMPOTENT ──
   *   $nor đảm bảo: nếu entry đã được patch (isSplitBonus = true cho tier này) thì bỏ qua.
   *   Chạy lại bao nhiêu lần cũng cho kết quả đúng.
   *
   * Recommended index: { drawId: 1, status: 1, outcome: 1 }
   *
   * Returns số entries đã patch.
   */
  async applySplitBonusForTier(
    drawId: string,
    tier: string,
    bonusPerWinner: number,
  ): Promise<number> {
    const filter = {
      drawId,
      status: EntryStatus.Settled,
      // Chỉ scan entries thắng — loại ~90%+ entries thua ngay từ index.
      // Entries thua không có tier nào trong payout.tiers nên không bao giờ match.
      outcome: EntryOutcome.Win,
      // Element-level: entry này có ít nhất 1 tier element trúng
      "payout.tiers": {
        $elemMatch: { tier, hitCount: { $gt: 0 } },
      },
      // Document-level idempotent guard: entry chưa được patch split bonus cho tier này.
      // Cần $nor riêng (không gộp vào $elemMatch) vì:
      //   $elemMatch chỉ check "có element nào đồng thời thỏa cả điều kiện" (AND trong 1 element),
      //   còn $nor check "không có element nào có tier + isSplitBonus: true" — phạm vi document.
      $nor: [{ "payout.tiers": { $elemMatch: { tier, isSplitBonus: true } } }],
    };

    const matchingEntries = await this.findManyAsDocuments(filter, {
      projection: { _id: 1, "payout.tiers": 1 },
    });

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

    const result = await this.bulkWrite(ops, { ordered: false });
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

  // ─────────────────────────────────────────────
  // Operations Dashboard Aggregations
  // ─────────────────────────────────────────────

  private buildOpsFilter(opts: { financialDate: string; drawId?: string }) {
    const filter: Record<string, unknown> = {
      financialDate: opts.financialDate,
      status: { $ne: EntryStatus.Void },
    };
    if (opts.drawId) filter.drawId = opts.drawId;
    return filter;
  }

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

  async aggregateNumberFrequency(opts: { financialDate: string; drawId?: string }): Promise<{
    mainNumbers: Array<{ number: number; count: number }>;
    specialNumbers: Array<{ number: number; count: number }>;
  }> {
    const filter = this.buildOpsFilter(opts);

    const [mainResult, specialResult] = await Promise.all([
      this.aggregate([
        { $match: filter },
        { $unwind: "$entrySummary.boards" },
        { $unwind: "$entrySummary.boards.mainNumbers" },
        {
          $group: {
            _id: "$entrySummary.boards.mainNumbers",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.aggregate([
        { $match: filter },
        { $unwind: "$entrySummary.boards" },
        { $unwind: "$entrySummary.boards.specialNumbers" },
        {
          $group: {
            _id: "$entrySummary.boards.specialNumbers",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      mainNumbers: (mainResult as any[]).map((r) => ({
        number: r._id,
        count: r.count,
      })),
      specialNumbers: (specialResult as any[]).map((r) => ({
        number: r._id,
        count: r.count,
      })),
    };
  }

  async aggregatePlayTypeDistribution(opts: {
    financialDate: string;
    drawId?: string;
  }): Promise<Array<{ playType: string; boardCount: number; lineCount: number }>> {
    const result = await this.aggregate([
      { $match: this.buildOpsFilter(opts) },
      { $unwind: "$entrySummary.boards" },
      {
        $group: {
          _id: "$entrySummary.boards.playType",
          boardCount: { $sum: 1 },
          lineCount: { $sum: "$entrySummary.boards.expandedLines" },
        },
      },
      { $sort: { lineCount: -1 } },
    ]);
    return (result as any[]).map((r) => ({
      playType: r._id,
      boardCount: r.boardCount,
      lineCount: r.lineCount,
    }));
  }
}
