/**
 * Use Case: Build Report (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 6 TRONG SETTLE FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Tạo/cập nhật báo cáo tài chính hàng ngày từ entries đã settle.
 * Dùng MongoDB aggregation pipeline (server-side) — không load entries vào memory.
 *
 * ────────────────────────────────────────────────
 * 3 LOẠI BÁO CÁO:
 * ────────────────────────────────────────────────
 *
 *   ① TENANT REPORT (lotto535DailyReports collection):
 *      - Aggregate theo tenantId × drawId × financialDate
 *      - Ghi: revenue, commission, stake, payout, win, GGR, netRevenue
 *      - GGR (Gross Gaming Revenue) = totalStake - totalPayout
 *      - netRevenue = totalStake - totalCommission
 *
 *   ② PLAYER REPORT (lotto535DailyReports collection):
 *      - Aggregate theo accountId × tenantId × drawId × financialDate
 *      - Ghi: stake, win, payout, entryCount, netAmount
 *      - netAmount = totalStake - totalPayout (dương = player thua, âm = player thắng)
 *
 *   ③ GAME-CORE REPORT (gameDailyReports collection — dashboard chung):
 *      - Publish tổng hợp lên game-core cho dashboard cross-game
 *      - Gồm: tenant reports + company financials + jackpot tracking
 *      - Chỉ publish khi có financials (từ CalculateFinancials output)
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   Upsert pattern: ghi đè nếu đã tồn tại → chạy lại safe.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { publishGameReport } from "@megawin/game-core-application/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { ReportRepository } from "../../infras/repos/report-repo";
import type { SettleContext } from "./types";

export interface BuildReportResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số tenant đã tạo/cập nhật báo cáo. */
  tenantsReported: number;
  /** Số player đã tạo/cập nhật báo cáo. */
  playersReported: number;
  /** Đã publish báo cáo lên game-core (cho dashboard chung) hay chưa. */
  gameCoreReportPublished: boolean;
}

export class BuildReportUseCase extends InternalUseCase<SettleContext, BuildReportResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly reportRepo = new ReportRepository();

  /** Tạo/cập nhật báo cáo. Upsert pattern – idempotent. */
  protected async execute(input: SettleContext): Promise<BuildReportResult> {
    const { drawId, financialDate, financials, jackpotOpeningAmount } = input;

    // ── STEP 1: Game-specific TENANT report ──
    // Aggregate entries theo tenant: totalStake, totalPayout, totalWin, totalCommission
    // → Upsert vào lotto535DailyReports collection (unique key: tenantId+drawId+financialDate)
    const tenantAggs = await this.entryRepo.aggregateTenantReport(drawId, financialDate);

    for (const t of tenantAggs) {
      await this.reportRepo.upsertTenantDailyReport({
        tenantId: t.tenantId,
        financialDate,
        drawId,
        product: GameProduct.Lotto535,
        revenue: t.totalStake,
        commission: t.totalCommission,
        commissionRate: t.commissionRate,
        totalStake: t.totalStake,
        totalPayout: t.totalPayout,
        totalWin: t.totalWin,
        entryCount: t.entryCount,
        // GGR = doanh thu thuần sau khi trả thưởng (Gross Gaming Revenue)
        ggr: t.totalStake - t.totalPayout,
        // netRevenue = doanh thu sau khi trả commission đại lý
        netRevenue: t.totalStake - t.totalCommission,
      });
    }

    // ── STEP 2: Game-specific PLAYER report ──
    // Aggregate entries theo player (accountId): stake, win, payout
    // → Upsert vào lotto535DailyReports (unique key: accountId+tenantId+drawId+financialDate)
    const playerAggs = await this.entryRepo.aggregatePlayerReport(drawId, financialDate);

    for (const p of playerAggs) {
      await this.reportRepo.upsertPlayerDailyReport({
        tenantId: p.tenantId,
        accountId: p.accountId,
        financialDate,
        drawId,
        product: GameProduct.Lotto535,
        totalStake: p.totalStake,
        totalWin: p.totalWin,
        totalPayout: p.totalPayout,
        entryCount: p.entryCount,
        // netAmount: dương = player lỗ, âm = player thắng
        netAmount: p.totalStake - p.totalPayout,
      });
    }

    // ── STEP 3: Publish lên game-core gameDailyReports (dashboard chung) ──
    // Chỉ publish nếu có financials (bước CalculateFinancials đã tính xong)
    // Bao gồm: tenant reports + company financials + jackpot tracking
    let gameCoreReportPublished = false;

    if (financials) {
      const totalStake = financials.totalRevenue;
      const totalPayout = tenantAggs.reduce((s, t) => s + t.totalPayout, 0);
      const totalWin = tenantAggs.reduce((s, t) => s + t.totalWin, 0);

      await publishGameReport({
        gameProduct: GameProduct.Lotto535,
        drawId,
        financialDate,
        tenantReports: tenantAggs.map((t) => ({
          tenantId: t.tenantId,
          totalStake: t.totalStake,
          totalPayout: t.totalPayout,
          totalWin: t.totalWin,
          commission: t.totalCommission,
          commissionRate: t.commissionRate,
          entryCount: t.entryCount,
        })),
        companyFinancials: {
          totalStake,
          totalPayout,
          totalWin,
          totalCommission: financials.totalAgentCommission,
          companyTake: financials.actualCompanyTake,
          jackpotContribution: financials.jackpotContribution,
        },
        jackpotTracking: {
          openingAmount: jackpotOpeningAmount ?? 0,
          closingAmount: (jackpotOpeningAmount ?? 0) + financials.jackpotContribution,
          hasJackpotWinner: financials.hasJackpotWinner,
          totalContribution: financials.jackpotContribution,
        },
      });

      gameCoreReportPublished = true;
    }

    return {
      drawId,
      financialDate,
      tenantsReported: tenantAggs.length,
      playersReported: playerAggs.length,
      gameCoreReportPublished,
    };
  }
}
