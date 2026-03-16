/**
 * Max 3D – Settle Tenant Report Repository
 *
 * Ghi/đọc per-game settle tenant reports cho Max 3D.
 * Collection: max3d_settle_tenant_reports — 1 doc/tenant/draw.
 *
 * Methods:
 *   upsertTenantReports       — bulkWrite upsert nhiều docs
 *   deleteByDrawId            — xoá khi void-after-settle
 *   findByDrawId              — list tenant reports của 1 draw
 *   aggregateByTenant         — SUM theo tenant trong date range
 *   findByTenantAndDateRange  — list draws của 1 tenant (paginated)
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleTenantReport, SettleTenantReportEntity } from "@megawin/game-max3d/entities";
import { MAX3D_SETTLE_TENANT_REPORTS } from "@megawin/game-max3d/entities";
import { BaseRepo } from "./base-repo";
import { SettleTenantReportMapper } from "../mappers";
import type { TenantAggregateSummary } from "./types";

/**
 * Repository ghi/đọc settle tenant reports cho Max 3D.
 *
 * 1 doc = 1 tenant × 1 draw. Unique index: { drawId: 1, tenantId: 1 }.
 */
export class SettleTenantReportRepository extends BaseRepo<SettleTenantReportEntity, SettleTenantReportMapper> {
  constructor() {
    super({ collName: MAX3D_SETTLE_TENANT_REPORTS, dataMapper: new SettleTenantReportMapper() });
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

  /**
   * List tất cả tenant reports cho 1 draw đã settle.
   *
   * Sort: totalCommission desc (tenant doanh thu lớn lên trên).
   */
  async findByDrawId(drawId: string): Promise<SettleTenantReport[]> {
    return await this.findMany({ drawId }, { sort: { totalCommission: -1 } });
  }

  /**
   * Aggregate SUM theo tenant trong date range — dùng cho tab "Theo Đại Lý".
   *
   * Group by tenantId, SUM các trường tài chính.
   * Sort: totalStake desc.
   */
  async aggregateByTenant(opts: { from: string; to: string }): Promise<TenantAggregateSummary[]> {
    const result = await this.aggregate([
      {
        $match: { financialDate: { $gte: opts.from, $lte: opts.to } },
      },
      {
        $group: {
          _id: "$tenantId",
          drawCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
          totalStake: { $sum: "$financial.totalRevenue" },
          totalWin: { $sum: "$financial.totalWin" },
          totalPayout: { $sum: "$financial.totalPayout" },
          ggr: { $sum: "$financial.ggr" },
          totalCommission: { $sum: "$totalCommission" },
        },
      },
      { $sort: { totalStake: -1 } },
    ]);

    return (result as any[]).map((r) => ({
      tenantId: r._id,
      drawCount: r.drawCount,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      totalCommission: r.totalCommission,
    }));
  }

  /**
   * List draws của 1 tenant trong date range — paginated.
   *
   * Sort: financialDate desc. Trả data + total để render pagination.
   */
  async findByTenantAndDateRange(opts: {
    tenantId: string;
    from: string;
    to: string;
    page: number;
    limit: number;
  }): Promise<{ data: SettleTenantReport[]; total: number }> {
    const filter = {
      tenantId: opts.tenantId,
      financialDate: { $gte: opts.from, $lte: opts.to },
    };
    const [data, total] = await Promise.all([
      this.findMany(filter, {
        sort: { financialDate: -1, drawId: -1 },
        skip: (opts.page - 1) * opts.limit,
        limit: opts.limit,
      }),
      this.count(filter),
    ]);
    return { data, total };
  }
}
