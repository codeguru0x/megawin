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

import {
  Mega645Collections,
  PrizeTier,
  type EntryPayout,
  type EntryVoidInfo,
  type EntryResult,
} from "@megawin/game-mega645/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { TicketEntryEntity } from "@megawin/game-mega645/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import { mapDocToEntryForStats } from "../mappers/entry-for-stats-mapper";
import type {
  PlayerBreakdownRow,
  OutstandingDrawMetrics,
  OutstandingDrawCounts,
  WinningEntryForDispatch,
  VoidedEntryForDispatch,
  EntryForStats,
  OwnedBoard,
} from "./types";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
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

  async getEntryById(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany({ ticketId }, { sort: { drawId: 1 } });
  }

  async getEntriesByDrawId(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /**
   * Đọc entries mới của 1 draw theo watermark insert-stream — nguồn cho
   * `Mega645StatsAccumulator` (worker `SyncBettingStatsUseCase`).
   *
   * `afterId` = watermark `lastEntryId` của stats doc; `undefined` khi doc mới
   * (đọc từ đầu). Filter loại `EntryStatus.Void` — entry void không đóng góp
   * vào doanh thu/exposure. Projection MỎNG — KHÔNG kéo `lines`/`payout` (vé
   * Bao 18 có 18.564 lines, kéo nhầm là nổ RAM).
   *
   * Index hậu thuẫn: `{drawId, _id}` (`idx_draw_id`, p0-01).
   *
   * @param drawId - Kỳ cần đọc.
   * @param afterId - ObjectId hex watermark, `undefined` = đọc từ đầu.
   * @param limit - Trần số entry đọc 1 lần gọi (`READ_BATCH`).
   */
  async getEntriesForStatsAfter(drawId: string, afterId: string | undefined, limit: number): Promise<EntryForStats[]> {
    const filter: Record<string, unknown> = { drawId, status: { $ne: EntryStatus.Void } };
    if (afterId) {
      filter._id = { $gt: new ObjectId(afterId) };
    }
    const docs = await this.findManyAsDocuments(filter, {
      sort: { _id: 1 },
      limit,
      projection: {
        _id: 1,
        drawId: 1,
        tenantId: 1,
        accountId: 1,
        username: 1,
        amount: 1,
        betUnitCount: 1,
        "tenant.commissionAmount": 1,
        "entrySummary.boards": 1,
      },
    });
    return docs.map(mapDocToEntryForStats);
  }

  /**
   * Boards của account trong 1 kỳ — ownership-gate minh bạch combo player (p1-01).
   *
   * Projection CHỈ `entrySummary.boards.{playType,numbers}` (2 field) để build tập
   * comboKey account sở hữu. Loại `EntryStatus.Void` (entry huỷ không tính là sở hữu).
   * Board không có `numbers` bỏ qua.
   *
   * Index hậu thuẫn: `{drawId, accountId}` (`idx_draw_account`, p0-01).
   *
   * @param accountId - Tài khoản người chơi.
   * @param drawId - Kỳ cần soi.
   */
  async getBoardsByAccountDraw(accountId: string, drawId: string): Promise<OwnedBoard[]> {
    const docs = await this.findManyAsDocuments(
      { accountId, drawId, status: { $ne: EntryStatus.Void } },
      {
        projection: { _id: 0, "entrySummary.boards.playType": 1, "entrySummary.boards.numbers": 1 },
      },
    );
    const boards: OwnedBoard[] = [];
    for (const d of docs as Array<{ entrySummary?: { boards?: OwnedBoard[] } }>) {
      for (const b of d.entrySummary?.boards ?? []) {
        if (b.numbers) {
          boards.push({ playType: b.playType, numbers: b.numbers });
        }
      }
    }
    return boards;
  }
  async getScheduledEntriesBatch(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy entries scheduled cho settle batch — query đơn giản hơn paging. */
  async getScheduledEntries(drawId: string, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ drawId, status: EntryStatus.Scheduled }, { sort: { createdAt: 1 }, limit });
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

  // ─────────────────────────────────────────────
  // Aggregation (settle financials / report)
  // ─────────────────────────────────────────────

  /**
   * Re-aggregate tổng payoutAmount từ tất cả settled entries cho 1 draw.
   *
   * Dùng sau PatchJackpotPrize để tính totalPayout chính xác (giải cố định + jackpot).
   * Kết quả dùng cho $set trên DrawDoc → **idempotent** (thay vì $inc).
   * Query đơn giản: $match + $group + 1 $sum, hit index { drawId, status }.
   */
  async aggregateTotalPayout(drawId: string): Promise<number> {
    const result = await this.aggregate([
      { $match: { drawId, status: { $ne: EntryStatus.Void } } },
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
   * Aggregate tổng doanh thu và hoa hồng cho 1 draw (exclude voided entries).
   * Group by null — 1 document kết quả, hiệu quả hơn aggregateRevenueByTenant
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

  /**
   * Aggregate tổng tiền giải cố định + tier counts từ settled entries.
   * Tính lại từ DB – không phụ thuộc accumulator.
   * Dùng cho calculate-financials sau khi settle xong.
   */
  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalPayoutAmount: number;
    totalFixedPrizes: number;
    /** Tổng số lines đã expand và match (sum hitCount tất cả tiers). */
    totalLines: number;
    /** Số lượt trúng per tier. Key = PrizeTier (vd. "jackpot", "tier1", ...). */
    tierWinnerCounts: Partial<Record<PrizeTier, number>>;
    /** Tổng tiền thưởng đã tính theo tier (VND). Key = PrizeTier. Jackpot = 0 tại bước này. */
    tierPrizeAmounts: Partial<Record<PrizeTier, number>>;
  }> {
    // 1 aggregation duy nhất: facet song song tiers và totals trên cùng $match.
    const facetResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $facet: {
          tiers: [
            { $unwind: "$payout.tiers" },
            {
              $group: {
                _id: "$payout.tiers.tier",
                totalHitCount: { $sum: "$payout.tiers.hitCount" },
                totalAmount: { $sum: "$payout.tiers.amount" },
              },
            },
          ],
          totals: [
            {
              $group: {
                _id: null,
                totalSettled: { $sum: 1 },
                totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
                // totalLines = tổng hitCount tất cả entries × tất cả tiers
                // (số lines đã expand và match, tương đương countLinesByDrawId).
                totalLines: {
                  $sum: {
                    $reduce: {
                      input: { $ifNull: ["$payout.tiers", []] },
                      initialValue: 0,
                      in: { $add: ["$$value", "$$this.hitCount"] },
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

    for (const r of tiers as any[]) {
      tierWinnerCounts[r._id as PrizeTier] = r.totalHitCount;
      tierPrizeAmounts[r._id as PrizeTier] = r.totalAmount;
      if (r._id !== PrizeTier.Jackpot) {
        totalFixedPrizes += r.totalAmount;
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
  // Payout Dispatch (Outbox Enqueue)
  // ─────────────────────────────────────────────

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

  // ─────────────────────────────────────────────
  // Void Draw
  // ─────────────────────────────────────────────

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled (chưa settled, chưa void).
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

    const docs = await this.findManyAsDocuments(
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
    );

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
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.originalAmount", 0] }, 0],
            },
          },
          totalRefundedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.refundAmount", 0] }, 0],
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
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.originalAmount", 0] }, 0],
            },
          },
          totalRefundedAmount: {
            $sum: {
              $cond: [{ $eq: ["$status", EntryStatus.Void] }, { $ifNull: ["$voidInfo.refundAmount", 0] }, 0],
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
    return this.distinct("ticketId", { drawId }) as Promise<string[]>;
  }

  // ─────────────────────────────────────────────
  // Feed Sync (cho worker sync-entry-feed)
  // ─────────────────────────────────────────────

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─────────────────────────────────────────────
  // Aggregation (report)
  // ─────────────────────────────────────────────

  /**
   * Aggregate số player unique per tenant cho 1 draw đã settle.
   *
   * Dùng bởi BuildSettleReportUseCase để tính playerCount per tenant.
   * 2-level group: { tenantId, accountId } → { tenantId } → playerCount.
   */
  async aggregatePlayerCountByTenant(drawId: string): Promise<Array<{ tenantId: string; playerCount: number }>> {
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
      playerCount: r.playerCount,
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
    return result.map((r) => ({
      tenantId: r._id,
      entryCount: r.entryCount ?? 0,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake ?? 0,
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
   * Mega645 có lineCount (expanded lines từ bao).
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

    return result.map((r) => ({
      drawId: r._id as string,
      playerCount: r.playerCount ?? 0,
      tenantCount: r.tenants?.length ?? 0,
    }));
  }

  // ─────────────────────────────────────────────
  // Jackpot Winners
  // ─────────────────────────────────────────────

  // ─────────────────────────────────────────────
  // Operations Dashboard – Query methods
  // ─────────────────────────────────────────────

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
  async getWinningEntries(drawId: string, limit: number, cursorId?: string): Promise<TicketEntryEntity[]> {
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
   * Tính tổng hợp entries trúng thưởng của 1 kỳ quay.
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

  /**
   * Tìm entries trúng giải Jackpot trong 1 draw.
   * Jackpot = có payout.tiers chứa tier "jackpot" với hitCount > 0.
   */
  async findJackpotWinners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findMany({
      drawId,
      "payout.tiers": {
        $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 } },
      },
    });
  }

  // ─────────────────────────────────────────────
  // Jackpot Prize Patch
  // ─────────────────────────────────────────────

  /**
   * Patch jackpot prize cho từng entry theo tỷ lệ betCount.
   *
   * Mỗi BOARD phủ bộ số trúng sinh 1 line JP (C(6,6)=1) với `betCount` riêng —
   * entry multi-board (≥2 board cùng phủ S) có thể có NHIỀU line JP. Mỗi entry
   * nhận: `prizeAmount = jackpotPerUnit × (tổng betCount của các JP lines thuộc
   * entry đó)` — đúng luật Vietlott "chia đều theo tỷ lệ giá trị tham gia dự
   * thưởng" (mirror Power 6/55 `patchJackpotPrizePerEntry`).
   *
   * Idempotent: chỉ patch entries có tiers[jackpot].amount = 0.
   *
   * @param drawId ID kỳ quay.
   * @param perEntryAmounts Map entryId → { prizeAmount, jackpotPerUnit } đã tính trước.
   * @returns Số entries đã patch.
   */
  async patchJackpotPrizePerEntry(
    drawId: string,
    perEntryAmounts: Map<string, { prizeAmount: number; jackpotPerUnit: number }>,
  ): Promise<number> {
    if (perEntryAmounts.size === 0) return 0;

    const entryIds = Array.from(perEntryAmounts.keys()).map((id) => new ObjectId(id));

    const matchingEntries = await this.findManyAsDocuments(
      {
        _id: { $in: entryIds },
        drawId,
        status: EntryStatus.Settled,
        outcome: EntryOutcome.Win,
        "payout.tiers": {
          $elemMatch: {
            tier: PrizeTier.Jackpot,
            hitCount: { $gt: 0 },
            amount: 0,
          },
        },
      },
      {
        projection: { _id: 1, "payout.tiers": 1 },
      },
    );

    if (matchingEntries.length === 0) return 0;

    const ops: Array<{
      updateOne: { filter: Record<string, unknown>; update: Record<string, unknown> };
    }> = [];

    for (const entry of matchingEntries) {
      const entryId = (entry._id as ObjectId).toHexString();
      const prizeInfo = perEntryAmounts.get(entryId);

      // Entry match filter (trúng JP, chưa patch) NHƯNG không có trong
      // perEntryAmounts → SKIP thay vì ghi amount=0. betUnitsByEntry đọc từ
      // findJackpotLinesByDrawId (retry-safe) nên map luôn phủ đủ mọi entry
      // trúng JP; nhánh này chỉ mang tính defensive. TUYỆT ĐỐI không dùng
      // fallback `?? 0`: ghi 0 sẽ khoá entry trúng JP về 0 đồng vĩnh viễn
      // (filter amount=0 skip lần sau).
      if (!prizeInfo) {
        console.warn(
          `[PatchJackpotPrizePerEntry Mega645] entry ${entryId} trúng jackpot nhưng thiếu trong perEntryAmounts — skip (không ghi amount=0).`,
        );
        continue;
      }

      const { jackpotPerUnit, prizeAmount } = prizeInfo;

      const tiers = (entry.payout as any)?.tiers ?? [];
      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0) {
          // unitAmount = jackpotPerUnit (giá trị 1 đơn vị tham gia dự thưởng)
          // amount = prizeAmount = jackpotPerUnit × tổng betCount của entry này
          return { ...t, unitAmount: jackpotPerUnit, amount: prizeAmount };
        }
        return t;
      });

      // Tổng winAmount = tổng tất cả tiers sau khi patch
      const totalWin = updatedTiers.reduce((sum: number, t: any) => sum + (t.amount ?? 0), 0);

      ops.push({
        updateOne: {
          filter: {
            _id: entry._id,
            "payout.tiers": {
              $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 }, amount: 0 },
            },
          },
          update: {
            $set: {
              "payout.tiers": updatedTiers,
              "payout.winAmount": totalWin,
              "payout.payoutAmount": totalWin,
              updatedAt: new Date(),
            },
          } as any,
        },
      });
    }

    if (ops.length === 0) return 0;

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  /**
   * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3.
   *
   * BẮT BUỘC cả drawId lẫn tenantId — KHÔNG query cross-draw.
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async aggregatePlayersByDrawAndTenant(drawId: string, tenantId: string): Promise<PlayerBreakdownRow[]> {
    const result = await this.aggregate([
      { $match: { drawId, tenantId, status: EntryStatus.Settled } },
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
   * Query entries cho 1 draw × 1 tenant × 1 player. Drill cấp 4.
   *
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async findByDrawTenantPlayer(drawId: string, tenantId: string, accountId: string): Promise<TicketEntryEntity[]> {
    return this.findMany({ drawId, tenantId, accountId });
  }

  // ─────────────────────────────────────────────
  // Resettle – Jackpot winner pre-flight detection
  // ─────────────────────────────────────────────

  /**
   * Kiểm tra NHANH liệu kết quả ĐỀ XUẤT có sinh ra Jackpot winner trong draw không.
   *
   * Dùng bởi `DetectBoundariesUseCase` (resettle pre-flight) để phân loại scenario:
   * có winner → cycle đóng → cần xét cascade (Type B); không winner → roll-over (Type A).
   *
   * **Mega 6/45 — SINGLE jackpot (6/6):** chỉ 1 điều kiện trúng JP — tồn tại 1 board
   * chứa ĐỦ cả 6 số winning (`$all`). KHÔNG có bonus number, KHÔNG có JP2 → query
   * đơn giản hơn Power 6/55 (1 clause thay vì 2).
   *
   * **Bao N:** board chọn N=6–18 số. `$all` containment đúng tự nhiên — board phải
   * chứa đủ 6 số winning; board chỉ 6 số trùng đủ cũng thỏa. `$elemMatch` bảo đảm
   * 6 số nằm trên CÙNG 1 board (không gộp số từ board khác).
   *
   * Hit index `{ drawId, status, "entrySummary.boards.numbers" }` (compound, multikey
   * trên field cuối). Hỗ trợ Settled (resettle lần đầu) + Scheduled (entries đã bị
   * PrepareResettle reset nhưng chưa re-settle — retry detection). `exists` dùng
   * count limit:1 → dừng ngay khi gặp winner đầu tiên.
   *
   * @param drawId - Kỳ quay cần check
   * @param proposedWinningNumbers - 6 số chính đề xuất (string zero-padded "01"-"45")
   * @param statuses - Các status entry cần quét (vd. [Settled, Scheduled])
   * @returns true nếu tồn tại ít nhất 1 board trúng Jackpot theo kết quả đề xuất
   */
  async existsJpWinnerForDraw(drawId: string, proposedWinningNumbers: string[], statuses: string[]): Promise<boolean> {
    // JP: tồn tại 1 board chứa đủ cả 6 số winning (→ 6/6 match).
    // count limit:1 dừng ngay khi gặp winner đầu tiên.
    return this.exists({
      drawId,
      status: { $in: statuses },
      "entrySummary.boards": {
        $elemMatch: { numbers: { $all: proposedWinningNumbers } },
      },
    });
  }
}
