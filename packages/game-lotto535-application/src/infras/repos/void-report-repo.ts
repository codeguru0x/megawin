/**
 * Lotto 5/35 – Void Report Repository
 *
 * Ghi per-game void reports cho Lotto 5/35.
 * Collection: lotto535_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport } from "@megawin/game-lotto535/entities";
import { LOTTO535_VOID_DRAW_REPORTS } from "@megawin/game-lotto535/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi void report cho Lotto 5/35.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: LOTTO535_VOID_DRAW_REPORTS });
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
   * Query void draw reports trong date range.
   *
   * Dùng cho Void Reports page. Sort theo financialDate DESC.
   * Index: { financialDate: 1 }
   */
  async findByDateRange(from: string, to: string): Promise<VoidDrawReport[]> {
    return (await this.findMany(
      {
        financialDate: {
          $gte: from,
          $lte: to,
        },
      },
      {
        sort: { financialDate: -1 },
      },
    )) as VoidDrawReport[];
  }
}
