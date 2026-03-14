/**
 * Power 6/55 – Settle Tenant Report Repository
 *
 * Ghi/đọc per-game settle tenant reports cho Power 6/55.
 * Collection: power655_settle_tenant_reports — 1 doc/tenant/draw.
 *
 * Methods:
 *   upsertTenantReports  — bulkWrite upsert nhiều docs
 *   deleteByDrawId       — xoá khi void-after-settle
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleTenantReport } from "@megawin/game-power655/entities";
import { POWER655_SETTLE_TENANT_REPORTS } from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";
import type { TenantAggregateSummary } from "./types";

/**
 * Repository ghi/đọc settle tenant reports cho Power 6/55.
 *
 * 1 doc = 1 tenant × 1 draw. Unique index: { drawId: 1, tenantId: 1 }.
 */
export class SettleTenantReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: POWER655_SETTLE_TENANT_REPORTS });
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
   * Query tenant reports cho 1 draw. Drill cấp 2.
   *
   * Index: { drawId: 1, tenantId: 1 }
   */
  async findByDrawId(drawId: string): Promise<SettleTenantReport[]> {
    return (await this.findMany({ drawId })) as SettleTenantReport[];
  }

  /**
   * Aggregate by tenantId trong date range. Tab "Theo đại lý" cấp 1.
   *
   * Group by tenantId → SUM tất cả draws trong range.
   * Index: { financialDate: 1, tenantId: 1 }
   */
  async aggregateByTenant(from: string, to: string): Promise<TenantAggregateSummary[]> {
    const result = await this.aggregate([
      // Lọc trong date range
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // Nhóm theo tenantId → SUM tất cả draws
      {
        $group: {
          _id: "$tenantId",
          drawCount: { $addToSet: "$drawId" },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          lineCount: { $sum: "$lineCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          commission: { $sum: "$commission" },
        },
      },
      // Sắp xếp theo doanh thu giảm dần
      {
        $sort: {
          totalStake: -1,
        },
      },
    ]);

    return (result as any[]).map((r) => ({
      tenantId: r._id as string,
      drawCount: (r.drawCount as string[]).length,
      entryCount: r.entryCount as number,
      playerCount: r.playerCount as number,
      lineCount: r.lineCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
      ggr: r.ggr as number,
      commission: r.commission as number,
    }));
  }

  /**
   * Draw list cho 1 tenant trong date range. Drill cấp 2 (tenant tab). Paginated.
   *
   * Index: { financialDate: 1, tenantId: 1 }
   */
  async findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    options?: { skip?: number; limit?: number },
  ): Promise<{ data: SettleTenantReport[]; total: number }> {
    const filter = {
      tenantId,
      financialDate: {
        $gte: from,
        $lte: to,
      },
    };
    const [data, total] = await Promise.all([
      this.findMany(filter, {
        sort: { financialDate: -1 },
        skip: options?.skip ?? 0,
        limit: options?.limit ?? 20,
      }) as Promise<SettleTenantReport[]>,
      this.count(filter),
    ]);
    return { data, total };
  }
}
