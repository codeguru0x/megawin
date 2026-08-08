/**
 * Max 3D – Settle Draw Report Repository
 *
 * Ghi/đọc per-game settle draw reports cho Max 3D.
 * Collection: max3d_settle_draw_reports — 1 doc/draw.
 *
 * Methods:
 *   upsertDrawReport     — upsert 1 doc
 *   deleteByDrawId       — xoá doc khi void-after-settle
 *   findByDrawId         — đọc để snapshot trước void
 *   findByDateRange      — list draws trong khoảng ngày (paginated)
 *   aggregateSummary     — SUM tất cả draws trong date range
 *
 * IDEMPOTENT: tất cả write dùng upsert overwrite — chạy lại an toàn.
 * KHÔNG dùng $inc.
 */

import type { SettleDrawReport, SettleDrawReportEntity } from "@megawin/game-max3d/entities";
import { MAX3D_SETTLE_DRAW_REPORTS } from "@megawin/game-max3d/entities";
import { BaseRepo } from "./base-repo";
import { SettleDrawReportMapper } from "../mappers";
import type { DrawSummaryResult } from "./types";

/**
 * Repository ghi/đọc settle draw reports cho Max 3D.
 *
 * 1 doc = 1 draw. Unique index: { drawId: 1 }.
 */
export class SettleDrawReportRepository extends BaseRepo<SettleDrawReportEntity, SettleDrawReportMapper> {
  constructor() {
    super({ collName: MAX3D_SETTLE_DRAW_REPORTS, dataMapper: new SettleDrawReportMapper() });
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
   * List settle draw reports trong khoảng ngày tài chính — paginated.
   *
   * `from` và `to` là ngày dạng "YYYY-MM-DD" (financialDate field).
   * Sort: financialDate desc. Trả về data + total để render pagination.
   */
  async findByDateRange(opts: {
    from: string;
    to: string;
    page: number;
    limit: number;
  }): Promise<{ data: SettleDrawReport[]; total: number }> {
    const filter = {
      financialDate: { $gte: opts.from, $lte: opts.to },
    };
    const [data, total] = await Promise.all([
      this.findMany(filter, {
        sort: { financialDate: -1, drawId: -1 },
        skip: (opts.page - 1) * opts.limit,
        limit: opts.limit,
      }),
      this.count(filter),
    ]);
    return { data, total };
  }

  /**
   * Aggregate SUM tất cả draws trong date range.
   *
   * Trả về DrawSummaryResult để hiển thị KPI strip.
   * Max 3D KHÔNG CÓ jackpotContribution.
   */
  async aggregateSummary(opts: { from: string; to: string }): Promise<DrawSummaryResult | null> {
    const result = await this.aggregate([
      {
        $match: { financialDate: { $gte: opts.from, $lte: opts.to } },
      },
      {
        $group: {
          _id: null,
          drawCount: { $sum: 1 },
          entryCount: { $sum: "$entryCount" },
          playerCount: { $sum: "$playerCount" },
          tenantCount: { $sum: "$tenantCount" },
          lineCount: { $sum: { $ifNull: ["$lineCount", 0] } },
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
      drawCount: r.drawCount,
      entryCount: r.entryCount,
      playerCount: r.playerCount,
      tenantCount: r.tenantCount,
      lineCount: r.lineCount ?? 0,
      totalStake: r.totalStake,
      totalWin: r.totalWin,
      totalPayout: r.totalPayout,
      ggr: r.ggr,
      totalCommission: r.totalCommission,
      netProfit: r.netProfit,
    };
  }
}
