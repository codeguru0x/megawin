/**
 * Max 3D Pro – Void Report Repository
 *
 * Ghi per-game void reports cho Max 3D Pro.
 * Collection: max3dpro_void_draw_reports.
 *
 * Methods:
 *   upsertVoidReport   — upsert 1 doc
 *   findByDateRange    — list void reports trong date range
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport, VoidDrawReportEntity } from "@megawin/game-max3dpro/entities";
import { MAX3DPRO_VOID_DRAW_REPORTS } from "@megawin/game-max3dpro/entities";
import { BaseRepo } from "./base-repo";
import { VoidDrawReportMapper } from "../mappers";

/**
 * Repository ghi void report cho Max 3D Pro.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<VoidDrawReportEntity, VoidDrawReportMapper> {
  constructor() {
    super({ collName: MAX3DPRO_VOID_DRAW_REPORTS, dataMapper: new VoidDrawReportMapper() });
  }

  /**
   * Upsert báo cáo void theo draw. Filter: { drawId }.
   *
   * Idempotent: retry ghi đè kết quả giống nhau.
   */
  async upsertVoidReport(report: Omit<VoidDrawReport, "createdAt" | "updatedAt">): Promise<void> {
    const now = new Date();
    await this.findOneAndUpdate(
      {
        drawId: report.drawId,
      },
      {
        $set: {
          ...report,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      {
        upsert: true,
      },
    );
  }

  /**
   * List void reports trong khoảng ngày tài chính.
   *
   * Sort: financialDate desc.
   */
  async findByDateRange(opts: { from: string; to: string }): Promise<VoidDrawReport[]> {
    return await this.findMany(
      { financialDate: { $gte: opts.from, $lte: opts.to } },
      { sort: { financialDate: -1, drawId: -1 } },
    );
  }
}
