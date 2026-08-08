/**
 * Power 6/55 – Settle Draw Report Repository
 *
 * Ghi/đọc per-game settle draw reports cho Power 6/55.
 * Collection: power655_settle_draw_reports — 1 doc/draw.
 *
 * Methods:
 *   upsertDrawReport     — upsert 1 doc
 *   deleteByDrawId       — xoá doc khi void-after-settle
 *   findByDrawId         — đọc để snapshot trước void
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleDrawReport, SettleDrawReportEntity } from "@megawin/game-power655/entities";
import { POWER655_SETTLE_DRAW_REPORTS } from "@megawin/game-power655/entities";

import { SettleDrawReportMapper } from "../mappers";
import { BaseRepo } from "./base-repo";
import type { DrawSummaryResult } from "./types";

/**
 * Repository ghi/đọc settle draw reports cho Power 6/55.
 *
 * 1 doc = 1 draw. Unique index: { drawId: 1 }.
 */
export class SettleDrawReportRepository extends BaseRepo<SettleDrawReportEntity, SettleDrawReportMapper> {
  constructor() {
    super({ collName: POWER655_SETTLE_DRAW_REPORTS, dataMapper: new SettleDrawReportMapper() });
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
    return await this.findOne({ drawId });
  }

  /**
   * Query settle draw reports trong date range, sorted DESC.
   *
   * Dùng cho tab "Theo kỳ quay" cấp 1. Paginated.
   * Index: { financialDate: 1 }
   */
  async findByDateRange(
    from: string,
    to: string,
    options?: { skip?: number; limit?: number },
  ): Promise<{ data: SettleDrawReport[]; total: number }> {
    const filter = {
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
      }),
      this.count(filter),
    ]);
    return { data, total };
  }

  /**
   * Aggregate summary — SUM tất cả draws trong date range.
   *
   * Dùng cho KPI strip tab "Theo kỳ quay".
   * Trả null nếu không có draw nào trong range.
   */
  async aggregateSummary(from: string, to: string): Promise<DrawSummaryResult | null> {
    const result = await this.aggregate([
      // Lọc draws trong date range
      {
        $match: {
          financialDate: {
            $gte: from,
            $lte: to,
          },
        },
      },
      // SUM tất cả draws → 1 summary row
      {
        $group: {
          _id: null,
          drawCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $max: "$tenantCount" },
          lineCount: { $sum: "$lineCount" },
          totalStake: { $sum: "$totalStake" },
          totalWin: { $sum: "$totalWin" },
          totalPayout: { $sum: "$totalPayout" },
          ggr: { $sum: "$ggr" },
          totalCommission: { $sum: "$totalCommission" },
          netProfit: { $sum: "$netProfit" },
        },
      },
    ]);

    if (result.length === 0) return null;

    const r = result[0] as any;
    return {
      drawCount: r.drawCount as number,
      entryCount: r.entryCount as number,
      playerCount: r.playerCount as number,
      tenantCount: r.tenantCount as number,
      lineCount: r.lineCount as number,
      totalStake: r.totalStake as number,
      totalWin: r.totalWin as number,
      totalPayout: r.totalPayout as number,
      ggr: r.ggr as number,
      totalCommission: r.totalCommission as number,
      netProfit: r.netProfit as number,
    };
  }
}
