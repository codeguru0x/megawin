/**
 * Keno – Settle Tenant Report Repository
 *
 * Ghi/đọc per-game settle tenant reports cho Keno.
 * Collection: keno_settle_tenant_reports — 1 doc/tenant/draw.
 *
 * Methods:
 *   upsertTenantReports  — bulkWrite upsert nhiều docs
 *   deleteByDrawId       — xoá khi void-after-settle
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleTenantReport, SettleTenantReportEntity } from "@megawin/game-keno/entities";
import { KENO_SETTLE_TENANT_REPORTS } from "@megawin/game-keno/entities";
import { SettleTenantReportMapper } from "../mappers";
import { BaseRepo } from "./base-repo";
import type { TenantAggregateSummary } from "./types";

/**
 * Repository ghi/đọc settle tenant reports cho Keno.
 *
 * 1 doc = 1 tenant × 1 draw. Unique index: { drawId: 1, tenantId: 1 }.
 */
export class SettleTenantReportRepository extends BaseRepo<SettleTenantReportEntity, SettleTenantReportMapper> {
  constructor() {
    super({
      collName: KENO_SETTLE_TENANT_REPORTS,
      dataMapper: new SettleTenantReportMapper(),
    });
  }

  /**
   * Bulk upsert báo cáo settle theo tenant × draw. Filter per doc: { drawId, tenantId }.
   *
   * Dùng bulkWrite để giảm số lần round-trip DB.
   * Idempotent: chạy lại overwrite.
   */
  async upsertTenantReports(reports: Omit<SettleTenantReport, "createdAt" | "updatedAt">[]): Promise<void> {
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
   * Lấy tất cả tenant reports của 1 draw.
   *
   * Dùng bởi ListTenantsByDraw use case — drill-down level 2.
   */
  async findByDrawId(drawId: string): Promise<SettleTenantReportEntity[]> {
    return this.findMany(
      { drawId },
      {
        sort: { totalStake: -1 },
      },
    );
  }

  /**
   * Aggregate tổng hợp theo tenant trong date range.
   *
   * Keno KHÔNG có lineCount.
   * Trả mảng TenantAggregateSummary sorted by totalStake DESC.
   */
  async aggregateByTenant(from: string, to: string): Promise<TenantAggregateSummary[]> {
    const result = await this.aggregate([
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
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
          totalCommission: { $sum: "$totalCommission" },
        },
      },
      {
        $sort: { totalStake: -1 },
      },
    ]);
    return result.map((r) => ({
      tenantId: r["_id"] as string,
      drawCount: r["drawCount"] as number,
      entryCount: r["entryCount"] as number,
      playerCount: r["playerCount"] as number,
      totalStake: r["totalStake"] as number,
      totalWin: r["totalWin"] as number,
      totalPayout: r["totalPayout"] as number,
      ggr: r["ggr"] as number,
      totalCommission: r["totalCommission"] as number,
    }));
  }

  /**
   * Lấy danh sách draws của 1 tenant trong date range.
   *
   * Dùng bởi drill-down level 3 (tenant → draws của tenant đó).
   */
  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<{ data: SettleTenantReportEntity[]; total: number }> {
    const filter = {
      tenantId,
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };
    const [data, total] = await Promise.all([
      this.findMany(filter, { sort: { financialDate: -1 } }),
      this.count(filter),
    ]);
    return { data, total };
  }
}
