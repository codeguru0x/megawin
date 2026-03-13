/**
 * Mega 6/45 – Void Report Repository
 *
 * Ghi per-game void reports cho Mega 6/45.
 * Collection: mega645_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport } from "@megawin/game-mega645/entities";
import { MEGA645_VOID_DRAW_REPORTS } from "@megawin/game-mega645/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi void report cho Mega 6/45.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: MEGA645_VOID_DRAW_REPORTS });
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
