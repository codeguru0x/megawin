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
  PrizeTier,
  type EntryPayout,
  type EntryVoidInfo,
  type EntryResult,
} from "@megawin/game-lotto535/entities";
import { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import { mapDocToEntryForStats } from "../mappers/entry-for-stats-mapper";
import type { TicketEntryEntity } from "@megawin/game-lotto535/entities";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";
import type {
  OutstandingDrawMetrics,
  OutstandingDrawCounts,
  WinningEntryForDispatch,
  VoidedEntryForDispatch,
  PlayerBreakdownRow,
  EntryForStats,
  OwnedBoard,
} from "./types";

export class EntryRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
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
   * Danh sách entries trúng thưởng (winAmount > 0) của 1 kỳ, cursor-based pagination.
   * Sort: winAmount desc, sau đó createdAt asc.
   */
  async getWinningEntries(drawId: string, limit: number, afterEntryId?: string): Promise<TicketEntryEntity[]> {
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

    const row = rows[0] as { totalEntries?: number; totalLines?: number; totalWin?: number } | undefined;
    return {
      totalWinningEntries: row?.totalEntries ?? 0,
      totalWinningLines: row?.totalLines ?? 0,
      totalWinAmount: row?.totalWin ?? 0,
    };
  }

  /**
   * Lấy N entries mới nhất của một kỳ quay, sort theo createdAt desc.
   * Dùng cho live feed và "cuối kỳ" trên dashboard vận hành.
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

  /** Lấy batch entries theo drawId + status (cho settle batch loop). */
  async getScheduledEntriesBatch(drawId: string, page: number, size: number): Promise<TicketEntryEntity[]> {
    return await this.paging({ drawId, status: EntryStatus.Scheduled }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  /** Lấy entries scheduled cho settle — luôn page 1, dùng findMany + limit. */
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

  /**
   * Đọc entries mới của 1 kỳ theo watermark `_id` — nguồn insert-stream cho worker
   * `SyncBettingStatsUseCase` (p0-02). Port từ Power 6/55 (`getEntriesForStatsAfter`).
   *
   * Loại `status: Void` NGAY TẠI NGUỒN (không cộng vào stats rồi trừ bù) — entry void
   * không đóng góp doanh thu/exposure thật. Projection MỎNG (không lấy toàn bộ doc) —
   * tránh tải payload lớn cho phần lớn field accumulator không cần.
   *
   * Index: `{ drawId: 1, _id: 1 }` (`idx_draw_id`) — equality prefix `drawId` + range
   * `_id > afterId`, sort khớp chiều index → IXSCAN, không collection scan.
   *
   * @param drawId - Kỳ cần đọc.
   * @param afterId - Watermark đọc — ObjectId hex string. `undefined` = đọc từ đầu.
   * @param limit - Trần entries đọc 1 batch.
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
   * Đọc boards của CHÍNH account trong 1 kỳ — cho ownership-gate minh bạch combo (p1-01).
   *
   * Chỉ lấy `entrySummary.boards` của entries account đang có trong draw (thường vài doc).
   * Projection cực nhẹ (không kéo payout/result/amount) — chỉ đủ để so combo player yêu
   * cầu có thuộc về họ không. Loại entry Void (đã huỷ = không còn sở hữu combo).
   *
   * KHÔNG index mới: tận dụng `idx_draw_accountId` `{ drawId: 1, accountId: 1 }` đã khai
   * sẵn cho mục đích này (`packages/game-lotto535/src/indexes/index.ts`).
   *
   * @param accountId - Account đang yêu cầu (từ auth).
   * @param drawId - Kỳ cần soi.
   */
  async getBoardsByAccountDraw(accountId: string, drawId: string): Promise<OwnedBoard[]> {
    const docs = await this.findManyAsDocuments(
      { accountId, drawId, status: { $ne: EntryStatus.Void } },
      {
        projection: {
          _id: 0,
          "entrySummary.boards.playType": 1,
          "entrySummary.boards.mainNumbers": 1,
          "entrySummary.boards.specialNumbers": 1,
        },
      },
    );
    const boards: OwnedBoard[] = [];
    for (const d of docs as any[]) {
      for (const b of d.entrySummary?.boards ?? []) {
        boards.push({
          playType: b.playType,
          mainNumbers: b.mainNumbers,
          specialNumbers: b.specialNumbers,
        });
      }
    }
    return boards;
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
     * Jackpot loại ra vì amount = 0 lúc settle, tiền thực được patch ở PatchJackpotPrize (step 4a).
     */
    totalFixedPrizes: number;
    /** Tổng số lines của tất cả entries trong kỳ này. */
    totalLines: number;
    /**
     * Số lần trúng theo từng tier. Key = PrizeTier (vd. "tier1", "jackpot").
     * Value = tổng hitCount của tất cả entries có tier đó.
     */
    tierWinnerCounts: Partial<Record<PrizeTier, number>>;
    /**
     * Tổng đơn vị cược (betCount × hitCount) theo từng tier.
     * Dùng cho calculateSplitDistribution: phân bổ bonus theo tỷ lệ betCount.
     */
    tierBetUnitCounts: Partial<Record<PrizeTier, number>>;
    /**
     * Tổng tiền thưởng thực tế theo từng tier (VND).
     * Key = PrizeTier. Value = Σ amount của tất cả entries trúng tier đó.
     * Jackpot = 0 lúc settle (chờ PatchJackpotPrize patch sau).
     * Dùng để build settleSummary.tiers trong draw doc.
     */
    tierTotalAmounts: Partial<Record<PrizeTier, number>>;
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
                // betUnitCount = Σ(betUnitCount per tier) — tổng đơn vị tham gia dự thưởng per tier.
                // betUnitCount được lưu trong tier doc (từ buildPayoutTiersFromLines khi settle).
                totalBetUnitCount: {
                  $sum: "$payout.tiers.betUnitCount",
                },
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
    const tierWinnerCounts: Partial<Record<PrizeTier, number>> = {};
    const tierBetUnitCounts: Partial<Record<PrizeTier, number>> = {};
    const tierTotalAmounts: Partial<Record<PrizeTier, number>> = {};

    for (const row of tierRows) {
      tierWinnerCounts[row._id as PrizeTier] = row.totalHitCount;
      // tierBetUnitCounts: tổng đơn vị tham gia dự thưởng per tier (hitCount × betCount)
      tierBetUnitCounts[row._id as PrizeTier] = row.totalBetUnitCount;
      tierTotalAmounts[row._id as PrizeTier] = row.totalAmount;
      // Jackpot tier không tính vào totalFixedPrizes:
      // amount = 0 khi settle, tiền Jackpot được patch ở PatchJackpotPrize (step 4a).
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
      tierBetUnitCounts,
      tierTotalAmounts,
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
   * Re-aggregate tổng payoutAmount từ tất cả non-void entries cho 1 draw.
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
   * Group by null — 1 document kết quả, hiệu quả hơn group by tenant
   * khi caller chỉ cần 2 scalar tổng.
   *
   * Recommended index: { drawId: 1, status: 1 }
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
   * Aggregate metrics outstanding per drawId — Query A của SyncOutstanding.
   *
   * Chỉ tính số học (entryCount, lineCount, stake, commission) — không dùng $addToSet
   * nên memory footprint nhỏ và constant bất kể số lượng entries.
   * activeDrawIds từ DrawRepo.findActiveDrawIds() — tăng selectivity, tránh full scan.
   * Index: { drawId: 1, status: 1 }
   */
  async aggregateOutstandingMetricsByDraw(activeDrawIds: string[]): Promise<OutstandingDrawMetrics[]> {
    if (activeDrawIds.length === 0) return [];

    const result = await this.aggregate([
      // Lọc entries scheduled thuộc các draws active — index { drawId: 1, status: 1 }
      {
        $match: {
          drawId: { $in: activeDrawIds },
          status: EntryStatus.Scheduled,
        },
      },
      // Tổng hợp metrics số học per draw — không cần collect array trong RAM
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

    return result.map((r) => ({
      drawId: r._id as string,
      financialDate: r.financialDate as string,
      entryCount: r.entryCount,
      lineCount: r.lineCount,
      totalStake: r.totalStake,
      estimatedCommission: r.estimatedCommission ?? 0,
    }));
  }

  /**
   * Đếm unique players và tenants per drawId — Query B của SyncOutstanding.
   *
   * Dùng double-$group pattern: group by { drawId, accountId } trước → đếm số nhóm.
   * Tránh $addToSet tích lũy array trong RAM khi có hàng chục nghìn players.
   * Chạy song song với aggregateOutstandingMetricsByDraw.
   * Index: { drawId: 1, status: 1 }
   */
  async aggregateOutstandingCountsByDraw(activeDrawIds: string[]): Promise<OutstandingDrawCounts[]> {
    if (activeDrawIds.length === 0) return [];

    const result = await this.aggregate([
      // Lọc entries scheduled — cùng filter với Query A
      {
        $match: {
          drawId: { $in: activeDrawIds },
          status: EntryStatus.Scheduled,
        },
      },
      // Bước 1: deduplicate (drawId, accountId) và (drawId, tenantId) cùng lúc
      {
        $group: {
          _id: {
            drawId: "$drawId",
            accountId: "$accountId",
            tenantId: "$tenantId",
          },
        },
      },
      // Bước 2: count unique players và tenants per draw
      // Mỗi (drawId, accountId, tenantId) unique đóng góp 1 vào playerCount và tenantCount.
      // tenantCount có thể overcounted nếu 1 tenant có nhiều players — dùng $addToSet chỉ tenantId.
      // Số tenant rất nhỏ (< 100) nên $addToSet tenantId ở bước này an toàn về memory.
      {
        $group: {
          _id: "$_id.drawId",
          playerCount: { $sum: 1 },
          tenants: { $addToSet: "$_id.tenantId" },
        },
      },
    ]);

    return result.map((r) => ({
      drawId: r._id as string,
      playerCount: r.playerCount,
      tenantCount: r.tenants?.length ?? 0,
    }));
  }

  /**
   * Aggregate số player unique per tenant cho 1 draw đã settle.
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

  /**
   * Batch aggregate summaries cho nhiều tickets cùng lúc.
   * $match ticketId ∈ batch → $group by ticketId → Map<string, summary>.
   */
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
  async getChangedEntries(afterVersion: Long, limit: number): Promise<TicketEntryEntity[]> {
    return await this.findMany({ version: { $gt: afterVersion } }, { sort: { version: 1 }, limit });
  }

  // ─────────────────────────────────────────────
  // Jackpot Split Bonus
  // ─────────────────────────────────────────────

  /**
   * Thêm split bonus tier vào payout của entries trúng tier đó trong kỳ Split Cycle.
   *
   * Được gọi bởi ApplySplitBonuses (step 4b) với bonusPerUnit và betUnitsByEntry map.
   * Idempotent: chỉ patch entry chưa có tier với isSplitBonus = true.
   *
   * ── FILTER STRATEGY ──
   *   1. outcome: "win" — chỉ scan entries THẮNG, loại bỏ ~90%+ entries thua ngay từ index.
   *   2. $elemMatch: { tier, hitCount > 0 } — chỉ lấy entries thực sự trúng tier này.
   *   3. $nor (document-level idempotent guard): đảm bảo entry CHƯA được patch tier này.
   *
   * Quy tắc Vietlott: Split bonus chia theo tỷ lệ tham gia dự thưởng (betCount).
   *   - bonusPerUnit = totalTierAmount / totalTierBetUnits
   *   - bonusAmount cho entry = bonusPerUnit × entry_bet_units (từ betUnitsByEntry map)
   *
   * @param bonusPerUnit - Bonus cho 1 đơn vị tham gia (= 1 line × 1 betCount)
   * @param betUnitsByEntry - Map: entryId → số bet units trúng tier đó (Σ betCount per winning
   *   line, build bởi use-case từ `getWinningLinesForTier`) — BẮT BUỘC, không optional. Caller
   *   duy nhất (`ApplySplitBonusesUseCase`) luôn build map này trước khi gọi.
   */
  async applySplitBonusForTier(
    drawId: string,
    tier: string,
    bonusPerUnit: number,
    betUnitsByEntry: Map<string, number>,
  ): Promise<number> {
    const filter = {
      drawId,
      status: EntryStatus.Settled,
      // Chỉ scan entries thắng — loại ~90%+ entries thua ngay từ index.
      outcome: EntryOutcome.Win,
      // Element-level: entry này có ít nhất 1 tier element trúng
      "payout.tiers": {
        $elemMatch: { tier, hitCount: { $gt: 0 } },
      },
      // Document-level idempotent guard: entry chưa được patch split bonus cho tier này.
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
      const entryId = entry._id.toString();

      // Nguồn betUnits theo thứ tự ưu tiên (map luôn có giá trị khi entry thực sự trúng —
      // caller build map từ TẤT CẢ winning lines của tier, xem `getWinningLinesForTier`):
      //   1. betUnitsByEntry.get(entryId) — chính xác nhất, tính trực tiếp từ lines vừa đọc.
      //   2. tierEntry?.betUnitCount — snapshot ghi lúc SettleEntries (buildPayoutTiersFromLines),
      //      dùng khi entryId không khớp map (lệch string hoá) — tương đương độ chính xác.
      //   3. hitCount — chỉ đúng khi mọi winning line có betCount = 1; giữ lại làm lưới an toàn
      //      cuối cho entry doc cổ (trước khi field betUnitCount tồn tại), KHÔNG xoá nếu chưa có
      //      bằng chứng query staging xác nhận 0 entry cổ còn sót (xem plan p0-00 rủi ro R4).
      const betUnits = betUnitsByEntry.get(entryId) ?? tierEntry?.betUnitCount ?? hitCount;
      const bonusAmount = bonusPerUnit * betUnits;

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
                unitAmount: bonusPerUnit,
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
  async findJackpotWinners(drawId: string): Promise<TicketEntryEntity[]> {
    return this.findMany({
      drawId,
      "payout.tiers": {
        $elemMatch: { tier: PrizeTier.Jackpot, hitCount: { $gt: 0 } },
      },
    });
  }

  /**
   * Patch jackpot prize vào payout của entries trúng Jackpot.
   *
   * Được gọi bởi PatchJackpotPrize (step 4a) sau khi tính jackpotPerUnit.
   * Cập nhật: payout.tiers[jackpot].unitAmount, amount + payout.winAmount, payoutAmount.
   *
   * Idempotent: chỉ update entries có payout.tiers[jackpot].amount = 0 (chưa được patch).
   *
   * Quy tắc Vietlott: Jackpot chia theo tỷ lệ giá trị tham gia dự thưởng (betCount).
   *   - jackpotPerUnit = floor(totalPool / totalBetUnits)
   *   - prizeAmount của entry = jackpotPerUnit × betUnits (từ betUnitsByEntry map)
   *
   * @param jackpotPerUnit - Tiền JP cho 1 đơn vị tham gia (1 line × 1 betCount)
   * @param betUnitsByEntry - Map: entryId → số bet units trúng JP (Σ betCount per JP line,
   *   build bởi use-case từ TẤT CẢ JP lines của draw) — BẮT BUỘC, không optional. Caller
   *   duy nhất (`PatchJackpotPrizeUseCase`) luôn build map này trước khi gọi.
   */
  async patchJackpotPrize(
    drawId: string,
    jackpotPerUnit: number,
    betUnitsByEntry: Map<string, number>,
  ): Promise<number> {
    const filter = {
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
    };

    const matchingEntries = await this.findManyAsDocuments(filter, {
      projection: {
        _id: 1,
        "payout.tiers": 1,
      },
    });

    if (matchingEntries.length === 0) return 0;

    const ops = matchingEntries.map((entry) => {
      const tiers = (entry.payout as any)?.tiers ?? [];
      const jpTier = tiers.find((t: any) => t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0);
      const hitCount = jpTier?.hitCount ?? 0;
      const entryId = entry._id.toString();

      // Nguồn betUnits theo thứ tự ưu tiên (map luôn có giá trị khi entry thực sự trúng JP —
      // caller build map từ TẤT CẢ JP lines của draw, xem `getJackpotLinesForDraw`):
      //   1. betUnitsByEntry.get(entryId) — chính xác nhất, tính trực tiếp từ JP lines vừa đọc.
      //   2. jpTier?.betUnitCount — snapshot ghi lúc SettleEntries (buildPayoutTiersFromLines),
      //      dùng khi entryId không khớp map (lệch string hoá) — tương đương độ chính xác.
      //   3. hitCount — chỉ đúng khi mọi JP line có betCount = 1; giữ lại làm lưới an toàn cuối
      //      cho entry doc cổ (trước khi field betUnitCount tồn tại), KHÔNG xoá nếu chưa có bằng
      //      chứng query staging xác nhận 0 entry cổ còn sót (xem plan p0-00 rủi ro R4).
      const betUnits = betUnitsByEntry.get(entryId) ?? jpTier?.betUnitCount ?? hitCount;
      const prizeAmount = jackpotPerUnit * betUnits;

      const updatedTiers = tiers.map((t: any) => {
        if (t.tier === PrizeTier.Jackpot && t.hitCount > 0 && t.amount === 0) {
          return {
            ...t,
            unitAmount: jackpotPerUnit,
            amount: prizeAmount,
          };
        }
        return t;
      });

      return {
        updateOne: {
          filter: {
            _id: entry._id,
            "payout.tiers": {
              $elemMatch: {
                tier: PrizeTier.Jackpot,
                hitCount: { $gt: 0 },
                amount: 0,
              },
            },
          },
          update: {
            $set: {
              "payout.tiers": updatedTiers,
            },
            $inc: {
              "payout.winAmount": prizeAmount,
              "payout.payoutAmount": prizeAmount,
            },
          },
        },
      };
    });

    const result = await this.bulkWrite(ops, { ordered: false });
    return result.modifiedCount;
  }

  // ─────────────────────────────────────────────
  // Financial Report Queries
  // ─────────────────────────────────────────────

  /**
   * Aggregate players cho 1 draw × 1 tenant. Drill cấp 3 trong financial reports.
   *
   * BẮT BUỘC drawId + tenantId — KHÔNG query cross-draw.
   * Index: { drawId: 1, tenantId: 1, accountId: 1 }
   */
  async aggregatePlayersByDrawAndTenant(drawId: string, tenantId: string): Promise<PlayerBreakdownRow[]> {
    const result = await this.aggregate([
      // Lọc entries đã settle trong 1 draw + 1 tenant
      {
        $match: {
          drawId,
          tenantId,
          status: "settled",
        },
      },
      // Nhóm theo player → tính metrics per player
      {
        $group: {
          _id: "$accountId",
          username: { $first: "$username" },
          entryCount: { $sum: 1 },
          lineCount: { $sum: "$lineCount" },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
      // Sắp xếp player theo doanh thu giảm dần
      {
        $sort: {
          totalStake: -1,
        },
      },
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
    return this.findMany({
      drawId,
      tenantId,
      accountId,
    });
  }

  /**
   * Pre-flight: kỳ T có JP winner (5 main + special) với kết quả đề xuất không.
   *
   * Board-level `$elemMatch`: mainNumbers chứa đủ 5 số winning + specialNumbers
   * chứa winningSpecial. Conservative — có thể over-detect với Bao nhưng an toàn
   * cho phân loại scenario (TYPE_B1 thay vì TYPE_A).
   *
   * @param statuses - status entries cần quét. Resettle truyền `[Settled, Scheduled]`:
   *   match cả entries chưa reset (`Settled` — pre-flight) lẫn entries đã bị
   *   PrepareResettle reset về `Scheduled` (re-detect khi retry). Match theo
   *   selection vé (`entrySummary.boards`) nên độc lập với status/payout.
   */
  async existsJpWinnerForDraw(
    drawId: string,
    proposedWinningMain: string[],
    proposedWinningSpecial: string,
    statuses: string[],
  ): Promise<boolean> {
    return this.exists({
      drawId,
      status: { $in: statuses },
      "entrySummary.boards": {
        $elemMatch: {
          mainNumbers: { $all: proposedWinningMain },
          specialNumbers: proposedWinningSpecial,
        },
      },
    });
  }
}
