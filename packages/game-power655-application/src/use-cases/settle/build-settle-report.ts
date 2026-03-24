/**
 * Use Case: Build Settle Report (Power 6/55)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP MỚI TRONG SETTLE FLOW (sau BuildReport cũ, trước FinalizeSettle)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Xây dựng per-game financial reports từ entries đã settle.
 * Dùng MongoDB aggregation pipeline (server-side) — không load entries vào memory.
 *
 * FLOW (2 bước, idempotent):
 *   1. Aggregate entries WHERE { drawId, status: "settled" }
 *      → group by { tenantId, accountId } để đếm playerCount per tenant
 *      → group by { tenantId } để tính metrics tài chính per tenant
 *   2. Upsert SettleTenantReport[] vào power655_settle_tenant_reports
 *   3. SUM tenant reports + financials từ context → Upsert SettleDrawReport
 *
 * Power 6/55 DUAL Jackpot:
 *   jackpotContribution = jackpot1Contribution + jackpot2Contribution
 *   companyTake = actualCompanyTake
 *
 * CRASH-SAFE:
 *   - Crash sau tenant upsert (partial): retry upsert overwrite → idempotent.
 *   - Crash sau draw upsert: cả 2 reports đã ghi. Daily stale → PublishSettleDaily re-aggregate.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import type { SettleContext } from "./types";
import { sumBy } from "@megawin/shared/utils";
export interface BuildSettleReportResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** Số tenant đã upsert report. */
  tenantCount: number;
}

/**
 * Xây dựng per-game settle reports cho Power 6/55.
 *
 * CRASH-SAFE: aggregate từ DB → idempotent, chạy lại nhiều lần an toàn.
 * Ghi tenant reports trước, draw report sau — đảm bảo draw = SUM(tenants).
 *
 * Power 6/55 DUAL Jackpot: jackpotContribution = JP1 + JP2.
 */
export class BuildSettleReportUseCase extends InternalUseCase<
  SettleContext,
  BuildSettleReportResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawReportRepo = new SettleDrawReportRepository();
  private readonly tenantReportRepo = new SettleTenantReportRepository();

  protected async execute(input: SettleContext): Promise<BuildSettleReportResult> {
    const { drawId, financialDate, financials } = input;

    // ── Bước 1: Aggregate entries đã settle theo tenant ──────────────────────
    // Chạy song song 2 aggregations để giảm latency:
    //   - playerAgg: group by { tenantId, accountId } → playerCount per tenant
    //   - tenantAgg: group by { tenantId } → metrics tài chính
    const [playerAggs, tenantAggs] = await Promise.all([
      this.entryRepo.aggregatePlayerCountByTenant(drawId),
      this.entryRepo.aggregateTenantSettleMetrics(drawId),
    ]);

    // Map playerCount per tenantId để merge vào tenant reports
    const playerCountMap = new Map<string, number>(
      playerAggs.map((p) => [p.tenantId, p.playerCount]),
    );

    // ── Bước 2: Upsert SettleTenantReport[] ─────────────────────────────────
    const tenantReports = tenantAggs.map((t) => {
      // ggr per tenant = tiền cược - tiền trả thưởng (có thể âm khi jackpot winner ở tenant này)
      const ggr = t.totalStake - t.totalPayout;
      // netProfit per tenant = ggr - totalCommission (có thể âm)
      const netProfit = ggr - t.totalCommission;
      return {
        drawId,
        tenantId: t.tenantId,
        financialDate,
        entryCount: t.entryCount,
        playerCount: playerCountMap.get(t.tenantId) ?? 0,
        lineCount: t.lineCount,
        totalStake: t.totalStake,
        totalWin: t.totalWin,
        totalPayout: t.totalPayout,
        ggr,
        totalCommission: t.totalCommission,
        netProfit,
      };
    });

    await this.tenantReportRepo.upsertTenantReports(tenantReports);

    // ── Bước 3: Upsert SettleDrawReport ────────────────────────────────────
    // SUM từ tenant reports + financials từ SettleContext (từ CalculateFinancials)
    const totalStake = sumBy(tenantAggs, (t) => t.totalStake);
    const totalWin = sumBy(tenantAggs, (t) => t.totalWin);
    const totalPayout = sumBy(tenantAggs, (t) => t.totalPayout);
    const totalCommission = sumBy(tenantAggs, (t) => t.totalCommission);
    const lineCount = sumBy(tenantAggs, (t) => t.lineCount);
    const entryCount = sumBy(tenantAggs, (t) => t.entryCount);
    const tenantCount = tenantAggs.length;

    // Đếm unique players: SUM playerCount per tenant (mỗi tenant có playerSet riêng)
    // Không thể deduplicate cross-tenant ở đây vì 1 player có thể mua nhiều tenant.
    // playerCount = số unique player trong toàn draw (aggregate cross-tenant).
    const playerCount = sumBy(playerAggs, (p) => p.playerCount);

    const ggr = totalStake - totalPayout;
    // netProfit CÓ THỂ ÂM khi trúng jackpot lớn → KHÔNG validate >= 0
    const netProfit = ggr - totalCommission;

    // Power 6/55 DUAL Jackpot: jackpotContribution = JP1 + JP2 contribution
    // companyTake = actualCompanyTake từ CalculateFinancials
    const companyTake = financials?.actualCompanyTake ?? 0;
    const jackpotContribution =
      (financials?.jackpot1Contribution ?? 0) + (financials?.jackpot2Contribution ?? 0);

    await this.drawReportRepo.upsertDrawReport({
      drawId,
      financialDate,
      entryCount,
      playerCount,
      tenantCount,
      lineCount,
      totalStake,
      totalWin,
      totalPayout,
      ggr,
      totalCommission,
      netProfit,
      companyTake,
      jackpotContribution,
    });

    return {
      drawId,
      financialDate,
      tenantCount,
    };
  }
}
