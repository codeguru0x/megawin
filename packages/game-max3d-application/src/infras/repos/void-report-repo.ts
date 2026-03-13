/**
 * Max 3D – Void Report Repository
 *
 * Ghi per-game void reports cho Max 3D.
 * Collection: max3d_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport } from "@megawin/game-max3d/entities";
import { MAX3D_VOID_DRAW_REPORTS } from "@megawin/game-max3d/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi void report cho Max 3D.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: MAX3D_VOID_DRAW_REPORTS });
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
