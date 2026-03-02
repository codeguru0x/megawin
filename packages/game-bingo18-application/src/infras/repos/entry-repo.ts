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
  PayoutStatus,
  RefundStatus,
} from "@megawin/game-bingo18/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

/** Singleton — reuse across lambda invocations. */
let seqRepo: EntryChangeSeqRepository | null = null;
function getSeqRepo(): EntryChangeSeqRepository {
  if (!seqRepo) seqRepo = new EntryChangeSeqRepository();
  return seqRepo;
}

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: Bingo18Collections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. Dùng cho place-bet, settle, void... */
  async nextVersion(): Promise<Long> {
    return getSeqRepo().nextSeq();
  }

  /** Insert 1 entry mới kèm version từ global sequence. */
  async insertEntry(doc: Record<string, unknown>): Promise<string> {
    const version = await this.nextVersion();
    return await this.insertOne({ ...doc, version } as any);
  }

  /**
   * Insert nhiều entries đã có sẵn version.
   * Caller phải gán version vào docs trước khi gọi.
   */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const result = await this.insertMany(docs as any[]);
    return result.insertedCount;
  }

  // ─── Query ───

  async getEntriesByDrawId(
    drawId: string,
    page: number,
    size: number
  ): Promise<EntryEntity[]> {
    return await this.paging({ drawId }, page, size, {
      sort: { createdAt: 1 },
    });
  }

  async getDrawnEntriesBatch(
    drawId: string,
    page: number,
    size: number
  ): Promise<EntryEntity[]> {
    return await this.paging(
      { drawId, status: EntryStatus.Drawn },
      page,
      size,
      { sort: { createdAt: 1 } }
    );
  }

  async countEntriesByDrawId(drawId: string): Promise<number> {
    return await this.count({ drawId });
  }

  // ─── Status Transitions ───

  /** Batch update entry status cho 1 draw. Gán version mới cho toàn batch. */
  async batchTransitionByDrawId(
    drawId: string,
    fromStatus: string,
    toStatus: string,
    extraSet?: Record<string, unknown>
  ): Promise<number> {
    const version = await this.nextVersion();
    const $set: Record<string, unknown> = {
      status: toStatus,
      version,
      updatedAt: new Date(),
      ...extraSet,
    };
    const result = await this.updateMany(
      { drawId, status: fromStatus },
      { $set }
    );
    return result.modifiedCount;
  }

  /** Copy draw result vào tất cả active entries. Gán version mới cho toàn batch. */
  async stampResultOnEntries(
    drawId: string,
    result: {
      numbers: number[];
      sum: number;
      publishedAt: Date;
    }
  ): Promise<number> {
    const version = await this.nextVersion();
    const updated = await this.updateMany(
      { drawId, status: EntryStatus.Active },
      {
        $set: {
          result,
          status: EntryStatus.Drawn,
          version,
          updatedAt: new Date(),
        },
      }
    );
    return updated.modifiedCount;
  }

  /**
   * Settle 1 entry: drawn → settled + ghi payout + gán version.
   * Atomic: chỉ update nếu entry đang ở status "drawn".
   */
  async settleEntry(
    entryId: string,
    payout: {
      winAmount: number;
      payoutAmount: number;
      boardPayouts: Array<{
        boardNo: string;
        playType: string;
        matchCount: number;
        winAmount: number;
      }>;
      sideBetPayouts: Array<{
        playType: string;
        sum?: number;
        bet?: string;
        outcome: string;
        isWin: boolean;
        winAmount: number;
      }>;
      settledAt: Date;
      payoutStatus?: string;
    },
    outcome: string
  ): Promise<boolean> {
    const version = await this.nextVersion();
    return await this.updateOne(
      { _id: new ObjectId(entryId), status: EntryStatus.Drawn },
      {
        $set: {
          status: EntryStatus.Settled,
          payout,
          outcome,
          version,
          updatedAt: new Date(),
        },
      }
    );
  }

  // ─── Aggregation ───

  async aggregateRevenueByTenant(drawId: string): Promise<
    Array<{
      tenantId: string;
      revenue: number;
      commission: number;
      commissionRate: number;
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
          commissionRate: { $first: "$tenant.commissionRate" },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      revenue: r.revenue,
      commission: r.commission ?? 0,
      commissionRate: r.commissionRate ?? 0.2,
      entryCount: r.entryCount,
    }));
  }

  async aggregateSettledPayoutSummary(drawId: string): Promise<{
    totalSettled: number;
    totalWinAmount: number;
    totalPayoutAmount: number;
    totalPrizes: number;
  }> {
    const summaryResult = await this.aggregate([
      { $match: { drawId, status: EntryStatus.Settled } },
      {
        $group: {
          _id: null,
          totalSettled: { $sum: 1 },
          totalWinAmount: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayoutAmount: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
        },
      },
    ]);
    const summary = (summaryResult[0] as any) ?? {};
    return {
      totalSettled: summary.totalSettled ?? 0,
      totalWinAmount: summary.totalWinAmount ?? 0,
      totalPayoutAmount: summary.totalPayoutAmount ?? 0,
      totalPrizes: summary.totalWinAmount ?? 0,
    };
  }

  async aggregateTenantReport(
    drawId: string,
    financialDate: string
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

  async aggregatePlayerReport(
    drawId: string,
    financialDate: string
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

  // ─── Payout Dispatch ───

  async getPendingPayoutEntries(
    drawId: string,
    limit: number
  ): Promise<EntryEntity[]> {
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
      { sort: { tenantId: 1, createdAt: 1 }, limit }
    );
  }

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
      }
    );
    return result.modifiedCount;
  }

  async batchMarkPayoutFailed(
    entryIds: string[],
    error: string
  ): Promise<number> {
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
      }
    );
    return result.modifiedCount;
  }

  // ─── Void Draw ───

  /**
   * Lấy batch entries chưa void cho 1 draw bị huỷ.
   * Chỉ lấy entries có status scheduled/active/drawn.
   */
  async getVoidableEntriesBatch(
    drawId: string,
    limit: number
  ): Promise<EntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: {
          $in: [EntryStatus.Scheduled, EntryStatus.Active, EntryStatus.Drawn],
        },
      },
      { sort: { createdAt: 1 }, limit }
    );
  }

  /**
   * Void 1 entry: chuyển status → void, ghi voidInfo + gán version.
   * Atomic: chỉ update nếu entry đang ở status voidable.
   */
  async voidEntry(
    entryId: string,
    voidInfo: {
      reason: string;
      originalAmount: number;
      refundAmount: number;
      voidedBy?: string;
    }
  ): Promise<boolean> {
    const version = await this.nextVersion();
    return await this.updateOne(
      {
        _id: new ObjectId(entryId),
        status: {
          $in: [EntryStatus.Scheduled, EntryStatus.Active, EntryStatus.Drawn],
        },
      },
      {
        $set: {
          status: EntryStatus.Void,
          voidInfo: {
            ...voidInfo,
            refundStatus: RefundStatus.Pending,
            voidedAt: new Date(),
          },
          version,
          updatedAt: new Date(),
        },
      }
    );
  }

  /** Đếm entries voidable cho 1 draw. */
  async countVoidableEntries(drawId: string): Promise<number> {
    return await this.count({
      drawId,
      status: {
        $in: [EntryStatus.Scheduled, EntryStatus.Active, EntryStatus.Drawn],
      },
    });
  }

  /** Lấy entries đã void nhưng chưa hoàn tiền. */
  async getPendingRefundEntries(
    drawId: string,
    limit: number
  ): Promise<EntryEntity[]> {
    return await this.findMany(
      {
        drawId,
        status: EntryStatus.Void,
        "voidInfo.refundStatus": {
          $in: [RefundStatus.Pending, RefundStatus.Failed],
        },
      },
      { sort: { createdAt: 1 }, limit }
    );
  }

  /** Đánh dấu entry đã dispatch refund thành công. */
  async markRefundDispatched(entryId: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": RefundStatus.Dispatched,
          "voidInfo.refundedAt": new Date(),
          updatedAt: new Date(),
        },
      }
    );
  }

  /** Đánh dấu entry refund thất bại. */
  async markRefundFailed(entryId: string, error: string): Promise<boolean> {
    return await this.updateOne(
      { _id: new ObjectId(entryId) },
      {
        $set: {
          "voidInfo.refundStatus": RefundStatus.Failed,
          "voidInfo.refundLastError": error,
          updatedAt: new Date(),
        },
      }
    );
  }

  /** Aggregate tổng kết void cho 1 draw. */
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

  // ─── Ticket Summary Aggregation ───

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
              $cond: [
                { $eq: ["$status", EntryStatus.Void] },
                "$drawId",
                "$$REMOVE",
              ],
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
   * Lấy danh sách distinct ticketIds từ entries của 1 draw.
   * Dùng cho SyncTicketSummaries — biết cần sync ticket nào.
   */
  async getDistinctTicketIdsByDrawId(drawId: string): Promise<ObjectId[]> {
    const col = await this.getCollection();
    return col.distinct("ticketId", { drawId }) as Promise<ObjectId[]>;
  }

  // ─── Feed Sync ───

  /**
   * Lấy entries có version > afterVersion, sorted ASC.
   * Worker dùng để detect thay đổi → copy sang entryFeed.
   */
  async getChangedEntries(
    afterVersion: Long,
    limit: number
  ): Promise<EntryEntity[]> {
    return await this.findMany(
      { version: { $gt: afterVersion } },
      { sort: { version: 1 }, limit }
    );
  }
}
