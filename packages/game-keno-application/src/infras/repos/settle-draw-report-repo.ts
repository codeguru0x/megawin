/**
 * Keno – Settle Draw Report Repository
 *
 * Ghi/đọc per-game settle draw reports cho Keno.
 * Collection: keno_settle_draw_reports — 1 doc/draw.
 *
 * Methods:
 *   upsertDrawReport     — upsert 1 doc
 *   deleteByDrawId       — xoá doc khi void-after-settle
 *   findByDrawId         — đọc để snapshot trước void
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleDrawReport } from "@megawin/game-keno/entities";
import { KENO_SETTLE_DRAW_REPORTS } from "@megawin/game-keno/entities";
import { BaseRepo } from "./base-repo";

/**
 * Repository ghi/đọc settle draw reports cho Keno.
 *
 * 1 doc = 1 draw. Unique index: { drawId: 1 }.
 */
export class SettleDrawReportRepository extends BaseRepo<any> {
  constructor() {
    super({ collName: KENO_SETTLE_DRAW_REPORTS });
  }

  /**
   * Upsert báo cáo settle theo draw. Filter: { drawId }.
   *
   * Overwrite toàn bộ document — idempotent khi re-settle.
   */
  async upsertDrawReport(report: Omit<SettleDrawReport, "createdAt" | "updatedAt">): Promise<void> {
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
   * Xoá settle draw report theo drawId.
   *
   * Dùng khi void-after-settle. deleteMany idempotent — xoá 0 docs cũng OK.
   */
  async deleteByDrawId(drawId: string): Promise<void> {
    await this.deleteMany({
      drawId,
    });
  }

  /**
   * Tìm settle draw report theo drawId. Trả null nếu không tìm thấy.
   *
   * Dùng bởi BuildVoidReport để snapshot settle data trước khi xoá.
   */
  async findByDrawId(drawId: string): Promise<SettleDrawReport | null> {
    return (await this.findOne({ drawId })) as SettleDrawReport | null;
  }
}
