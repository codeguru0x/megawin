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
  WinningEntriesSummary,
  PrizeSummaryRow,
  WinningEntryForDispatch,
  VoidedEntryForDispatch,
} from "./types";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import { mapDocToEntryForStats } from "../mappers/entry-for-stats-mapper";
import type {
  Bingo18BigSmallBet,
  Bingo18TripleKind,
  TicketEntryEntity,
} from "@megawin/game-bingo18/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type { OutstandingDrawMetrics, OutstandingDrawCounts } from "./types";
import type { EntryForStats } from "./types";

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

  /** Lấy 1 entry theo entryId — dùng cho dialog xem chi tiết từ Winning Entries Dialog. */
  async getEntryById(entryId: string): Promise<TicketEntryEntity | null> {
    return await this.findOne({ _id: new ObjectId(entryId) });
  }

  /** Lấy tất cả entries của 1 ticket, sắp xếp theo drawId tăng dần. */
  async getEntriesByTicketId(ticketId: string): Promise<TicketEntryEntity[]> {
    return await this.findMany(
      { ticketId },
      {
        sort: { drawId: 1 },
      },
    );
  }

  // ─── Operations Stats: insert-stream watermark reads ───

  /**
   * Đọc entries MỚI của 1 DRAW theo watermark insert-stream — cho stats worker
   * (analysis bingo18-ops §3.3). Watermark PER-DRAW (không dùng min toàn cục) → không
   * đọc thừa entry đã cộng của draw khác (tránh lãng phí I/O + double-count).
   *
   * Entries là insert-only tại place-bet → `_id` ObjectId tăng đơn điệu là watermark
   * tin cậy. Lấy `{ drawId, _id > afterId }`, sort `_id: 1`, limit batch. Dùng index
   * `idx_draw_id` (`{ drawId: 1, _id: 1 }`) — equality prefix + range `_id`.
   * Projection tối thiểu (không kéo payout/result — chưa settle) → nhẹ.
   *
   * Loại `status: Void` NGAY TẠI NGUỒN đọc — betting stats không bao giờ tính entry đã
   * huỷ (dù void toàn kỳ hay per-entry sau này). Đơn giản + an toàn hơn "cộng rồi trừ bù"
   * (cách cũ có khoảng hở: recompute trúng lúc draw đang `Voiding` giữa chừng sẽ đếm
   * nhầm entry chưa kịp void — bài học Keno chốt 30/07/2026).
   *
   * @param drawId - Draw đang mở/chưa chốt cần theo dõi.
   * @param afterId - Watermark: chỉ lấy entry có `_id` lớn hơn (exclusive). undefined = từ đầu.
   * @param limit - Kích thước batch.
   */
  async getEntriesForStatsAfter(
    drawId: string,
    afterId: string | undefined,
    limit: number,
  ): Promise<EntryForStats[]> {
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
        unitPrice: 1,
        "tenant.commissionAmount": 1,
        "entrySummary.boards": 1,
      },
    });
    return docs.map(mapDocToEntryForStats);
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

  // ─── Payout Dispatch (enqueue to outbox) ───

  /**
   * Lấy winning entries cho 1 draw để enqueue vào tenant_dispatch_orders.
   *
   * Chỉ trả về fields tối thiểu cần build `TenantDispatchOrderDoc` — giảm payload
   * khi kỳ quay có hàng ngàn winners.
   *
   * Filter: status=Settled + payout.winAmount > 0 + có payoutTx.
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

  /** Lấy voided entries cho 1 draw để enqueue refund dispatch. */
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

  // ─── Operations Dashboard ─────────────────────────────────────────────────
  // Các aggregation on-demand cũ (aggregateOpsSummary/TenantBreakdown/DiceFrequency/
  // PlayTypeDistribution/TopCombos) đã XOÁ 30/07/2026 — thay bằng pre-aggregated
  // `bingo18_draw_betting_stats` (worker stats-sync, đọc qua BettingStatsRepository).
  // Xem plan bingo18-ops p0-05 §6 (dead-code cleanup theo checklist Keno §9.3).

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
      username: string;
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
          username: { $first: "$username" },
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
      username: r.username ?? r._id,
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
