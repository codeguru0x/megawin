/**
 * Power 6/55 – Void Report Repository
 *
 * Ghi per-game void reports cho Power 6/55.
 * Collection: power655_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport } from "@megawin/game-power655/entities";
import { POWER655_VOID_DRAW_REPORTS } from "@megawin/game-power655/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi void report cho Power 6/55.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: POWER655_VOID_DRAW_REPORTS });
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
}
