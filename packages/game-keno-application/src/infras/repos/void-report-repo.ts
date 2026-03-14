/**
 * Keno – Void Report Repository
 *
 * Ghi per-game void reports cho Keno.
 * Collection: keno_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport } from "@megawin/game-keno/entities";
import { KENO_VOID_DRAW_REPORTS } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi void report cho Keno.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: KENO_VOID_DRAW_REPORTS });
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
   * Lấy danh sách void reports trong khoảng ngày tài chính.
   *
   * Sort: financialDate DESC để mới nhất lên đầu.
   */
  async findByDateRange(from: string, to: string): Promise<VoidDrawReport[]> {
    return (await this.findMany(
      { financialDate: { $gte: from, $lte: to } },
      { sort: { financialDate: -1 } },
    )) as VoidDrawReport[];
  }
}
