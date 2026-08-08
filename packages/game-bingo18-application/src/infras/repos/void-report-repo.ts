/**
 * Bingo 18 – Void Report Repository
 *
 * Ghi per-game void reports cho Bingo 18.
 * Collection: bingo18_void_draw_reports.
 *
 * IDEMPOTENT: upsert overwrite — chạy lại an toàn.
 */

import type { VoidDrawReport, VoidDrawReportEntity } from "@megawin/game-bingo18/entities";
import { BINGO18_VOID_DRAW_REPORTS } from "@megawin/game-bingo18/entities";
import { BaseRepo } from "./base-repo";
import { VoidDrawReportMapper } from "../mappers";

/**
 * Repository ghi void report cho Bingo 18.
 *
 * BuildVoidReport use case gọi sau khi đã xoá settle reports
 * (nếu void-after-settle) và aggregate voided entries.
 */
export class VoidReportRepository extends BaseRepo<VoidDrawReportEntity, VoidDrawReportMapper> {
  constructor() {
    super({ collName: BINGO18_VOID_DRAW_REPORTS, dataMapper: new VoidDrawReportMapper() });
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

  /** Lấy danh sách void reports trong khoảng ngày tài chính. */
  async findByDateRange(from: string, to: string): Promise<VoidDrawReport[]> {
    return await this.findMany({ financialDate: { $gte: from, $lte: to } }, { sort: { financialDate: -1 } });
  }
}
