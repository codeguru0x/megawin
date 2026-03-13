/**
 * Max 3D Pro – Settle Tenant Report Repository
 *
 * Ghi/đọc per-game settle tenant reports cho Max 3D Pro.
 * Collection: max3dpro_settle_tenant_reports — 1 doc/tenant/draw.
 *
 * Methods:
 *   upsertTenantReports  — bulkWrite upsert nhiều docs
 *   deleteByDrawId       — xoá khi void-after-settle
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleTenantReport } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_SETTLE_TENANT_REPORTS } from "@megawin/game-max3dpro/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi/đọc settle tenant reports cho Max 3D Pro.
 *
 * 1 doc = 1 tenant × 1 draw. Unique index: { drawId: 1, tenantId: 1 }.
 */
export class SettleTenantReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: MAX3DPRO_SETTLE_TENANT_REPORTS });
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
}
