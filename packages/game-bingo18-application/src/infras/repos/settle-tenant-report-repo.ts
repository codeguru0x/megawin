/**
 * Bingo 18 – Settle Tenant Report Repository
 *
 * Ghi/đọc per-game settle tenant reports cho Bingo 18.
 * Collection: bingo18_settle_tenant_reports — 1 doc/tenant/draw.
 *
 * Methods:
 *   upsertTenantReports  — bulkWrite upsert nhiều docs
 *   deleteByDrawId       — xoá khi void-after-settle
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleTenantReport } from "@megawin/game-bingo18/entities";
import { BINGO18_SETTLE_TENANT_REPORTS } from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";
import type { TenantAggregateSummary } from "./types";

/**
 * Repository ghi/đọc settle tenant reports cho Bingo 18.
 *
 * 1 doc = 1 tenant × 1 draw. Unique index: { drawId: 1, tenantId: 1 }.
 */
export class SettleTenantReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: BINGO18_SETTLE_TENANT_REPORTS });
  }

  /**
   * Bulk upsert báo cáo settle theo tenant × draw. Filter per doc: { drawId, tenantId }.
   *
   * Dùng bulkWrite để giảm số lần round-trip DB.
   * Idempotent: chạy lại overwrite.
   */
  async upsertTenantReports(
    reports: Omit<SettleTenantReport, "createdAt" | "updatedAt">[],
  ): Promise<void> {
    if (reports.length === 0) return;
    const now = new Date();
    const ops = reports.map((report) => ({
      updateOne: {
        filter: {
          drawId: report.drawId,
          tenantId: report.tenantId,
        },
        update: {
          $set: {
            ...report,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));
    await this.bulkWrite(ops);
  }

  /**
   * Xoá tất cả settle tenant reports của 1 draw.
   *
   * Dùng khi void-after-settle. deleteMany idempotent — xoá 0 docs cũng OK.
   */
  async deleteByDrawId(drawId: string): Promise<void> {
    await this.deleteMany({
      drawId,
    });
  }

  /** Lấy tất cả tenant reports của 1 draw — drill-down level 2. */
  async findByDrawId(drawId: string): Promise<SettleTenantReport[]> {
    return (await this.findMany({ drawId }, { sort: { totalStake: -1 } })) as SettleTenantReport[];
  }

  /** Aggregate tổng hợp theo tenant trong date range. Bingo 18 KHÔNG có lineCount. */
  async aggregateByTenant(from: string, to: string): Promise<TenantAggregateSummary[]> {
    const result = await this.aggregate([
      { $match: { financialDate: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: "$tenantId",
          drawCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          commission: { $sum: "$commission" },
        },
      },
      { $sort: { totalStake: -1 } },
    ]);
    return (result as any[]).map((r) => ({
      tenantId: r._id,
      drawCount: r.drawCount,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      commission: r.commission,
    }));
  }

  /** Lấy danh sách draws của 1 tenant trong date range — drill-down level 3. */
  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<{ data: SettleTenantReport[]; total: number }> {
    const filter = { tenantId, financialDate: { $gte: from, $lte: to } };
    const [data, total] = await Promise.all([
      this.findMany(filter, { sort: { financialDate: -1 } }),
      this.count(filter),
    ]);
    return { data: data as SettleTenantReport[], total };
  }
}
