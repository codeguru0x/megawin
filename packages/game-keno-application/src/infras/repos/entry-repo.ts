/**
 * Keno – Entry Repository
 *
 * Collection: kenoTicketEntries
 *
 * VERSION TRACKING:
 * Mỗi khi entry thay đổi trạng thái business (insert, status transition, settle, void),
 * field `version` được gán 1 giá trị mới từ global entryChangeSeq.
 * Worker sync-entry-feed dùng `version` để detect changes → copy sang entryFeed.
 *
 * Payout/refund dispatch KHÔNG bump version vì đây chỉ là trạng thái giao dịch
 * nội bộ, không thay đổi kết quả thắng thua hay số tiền trong báo cáo tenant.
 */

import { KenoCollections } from "@megawin/game-keno/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { ObjectId, Long } from "mongodb";
import { BaseRepo } from "./base-repo";
import { EntryMapper, type EntryEntity } from "../mappers/entry-mapper";
import { EntryChangeSeqRepository } from "@megawin/game-core-application/repos";

const PAYOUT_STATUS_PENDING = "pending";
const PAYOUT_STATUS_FAILED = "failed";
const PAYOUT_STATUS_DISPATCHED = "dispatched";

/** Singleton — reuse across lambda invocations. */
let seqRepo: EntryChangeSeqRepository | null = null;
function getSeqRepo(): EntryChangeSeqRepository {
  if (!seqRepo) seqRepo = new EntryChangeSeqRepository();
  return seqRepo;
}

export class EntryRepository extends BaseRepo<EntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: KenoCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  /** Allocate 1 version mới từ global sequence. */
  private async nextVersion(): Promise<Long> {
    return getSeqRepo().nextSeq();
  }

  /** Allocate N versions liên tiếp. Trả về array Long sorted ASC. */
  private async allocateVersions(count: number): Promise<Long[]> {
    if (count <= 0) return [];
    const { startSeq, endSeq } = await getSeqRepo().allocateSeq(count);
    const versions: Long[] = [];
    let current =
      typeof startSeq === "number" ? BigInt(startSeq) : startSeq.toBigInt();
    const end = typeof endSeq === "number" ? BigInt(endSeq) : endSeq.toBigInt();
    while (current <= end) {
      versions.push(Long.fromBigInt(current));
      current++;
    }
    return versions;
  }

  /** Insert 1 entry mới kèm version từ global sequence. */
  async insertEntry(doc: Record<string, unknown>): Promise<string> {
    const version = await this.nextVersion();
    return await this.insertOne({ ...doc, version } as any);
  }

  /** Insert nhiều entries kèm mỗi entry 1 version riêng. */
  async insertEntries(docs: Record<string, unknown>[]): Promise<number> {
    if (docs.length === 0) return 0;
    const versions = await this.allocateVersions(docs.length);
    const docsWithVersion = docs.map((doc, i) => ({
      ...doc,
      version: versions[i]!,
    }));
    const result = await this.insertMany(docsWithVersion as any[]);
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
      winningNumbers: number[];
      publishedAt: Date;
      bigCount: number;
      smallCount: number;
      evenCount: number;
      oddCount: number;
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
        pickCount: number;
        winAmount: number;
      }>;
      sideBetPayouts: Array<{
        playType: string;
        bet: string;
        outcome: string;
        isWin: boolean;
        winAmount: number;
      }>;
      settledAt: Date;
      payoutStatus?: string;
    }
  ): Promise<boolean> {
    const version = await this.nextVersion();
    return await this.updateOne(
      { _id: new ObjectId(entryId), status: EntryStatus.Drawn },
      {
        $set: {
          status: EntryStatus.Settled,
          payout,
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
      commissionRate: number;
      entryCount: number;
    }>
  > {
    const result = await this.aggregate([
      { $match: { drawId } },
      {
        $group: {
          _id: "$tenantId",
          revenue: { $sum: "$amount" },
          entryCount: { $sum: 1 },
          commissionRate: { $first: "$tenantSnapshot.commissionRate" },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id,
      revenue: r.revenue,
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
          commissionRate: { $first: "$tenantSnapshot.commissionRate" },
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
    }));
  }

  async aggregatePlayerReport(
    drawId: string,
    financialDate: string
  ): Promise<
    Array<{
      tenantId: string;
      playerId: string;
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
          _id: { tenantId: "$tenantId", playerId: "$playerId" },
          totalStake: { $sum: "$amount" },
          totalWin: { $sum: { $ifNull: ["$payout.winAmount", 0] } },
          totalPayout: { $sum: { $ifNull: ["$payout.payoutAmount", 0] } },
          entryCount: { $sum: 1 },
        },
      },
    ]);
    return result.map((r: any) => ({
      tenantId: r._id.tenantId,
      playerId: r._id.playerId,
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
          { "payout.payoutStatus": PAYOUT_STATUS_PENDING },
          { "payout.payoutStatus": PAYOUT_STATUS_FAILED },
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
        { "payout.payoutStatus": PAYOUT_STATUS_PENDING },
        { "payout.payoutStatus": PAYOUT_STATUS_FAILED },
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
          "payout.payoutStatus": PAYOUT_STATUS_DISPATCHED,
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
          "payout.payoutStatus": PAYOUT_STATUS_FAILED,
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
            refundStatus: "pending",
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
        "voidInfo.refundStatus": { $in: ["pending", "failed"] },
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
          "voidInfo.refundStatus": "dispatched",
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
          "voidInfo.refundStatus": "failed",
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
