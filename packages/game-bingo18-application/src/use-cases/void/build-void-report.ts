/**
 * Use Case: Build Void Report (Bingo 18)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP MỚI TRONG VOID FLOW (sau VoidEntries, trước FinalizeVoid)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Xây dựng void report và dọn dẹp settle reports (nếu void-after-settle).
 *
 * FLOW (3 phases):
 *
 * Phase 0 — Cleanup (chỉ khi void-after-settle):
 *   0a. Đọc bingo18_settle_draw_reports WHERE drawId → snapshot vào VoidPreviousSettleSnapshot
 *   0b. DELETE bingo18_settle_tenant_reports WHERE drawId
 *   0c. DELETE bingo18_settle_draw_reports WHERE drawId
 *
 * Phase 1 — Build void report:
 *   1. Aggregate voided entries: entryCount, playerCount, tenantCount, totalOriginalStake, totalRefundAmount
 *   2. Upsert bingo18_void_draw_reports
 *
 * CRASH-SAFE:
 *   - Crash sau snapshot (0a): void report chưa tạo, settle còn nguyên.
 *     Retry: upsert void (idempotent), xoá settle (deleteMany idempotent).
 *   - Crash sau delete tenant (0b): tenant đã xoá, draw report còn.
 *     Retry: deleteMany draw (idempotent), re-aggregate.
 *   - Crash sau delete draw (0c): settle đã xoá, daily stale.
 *     Retry: Phase 1 re-aggregate + upsert void (idempotent).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import type { VoidPreviousSettleSnapshot } from "@megawin/game-bingo18/entities";

import { EntryRepository } from "../../infras/repos/entry-repo";
import { SettleDrawReportRepository } from "../../infras/repos/settle-draw-report-repo";
import { SettleTenantReportRepository } from "../../infras/repos/settle-tenant-report-repo";
import { VoidReportRepository } from "../../infras/repos/void-report-repo";
import type { VoidContext } from "./types";

export interface BuildVoidReportResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Số entry đã void. */
  entryCount: number;
  /** Draw này đã từng settle trước khi void hay không. */
  wasPreviouslySettled: boolean;
}

/**
 * Xây dựng void report và cleanup settle reports khi void-after-settle.
 *
 * CRASH-SAFE: tất cả steps idempotent — retry an toàn ở mọi điểm crash.
 */
export class BuildVoidReportUseCase extends InternalUseCase<VoidContext, BuildVoidReportResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly drawReportRepo = new SettleDrawReportRepository();
  private readonly tenantReportRepo = new SettleTenantReportRepository();
  private readonly voidReportRepo = new VoidReportRepository();

  protected async execute(input: VoidContext): Promise<BuildVoidReportResult> {
    const { drawId, financialDate } = input;

    // ── Phase 0: Cleanup nếu void-after-settle ────────────────────────────
    // Đọc settle draw report để biết có wasPreviouslySettled không.
    const existingSettleReport = await this.drawReportRepo.findByDrawId(drawId);
    const wasPreviouslySettled = existingSettleReport !== null;

    let previousSettleSnapshot: VoidPreviousSettleSnapshot | undefined;

    if (wasPreviouslySettled && existingSettleReport) {
      // 0a. Snapshot settle data trước khi xoá — dùng cho audit trail trong void report
      previousSettleSnapshot = {
        totalStake: existingSettleReport.totalStake,
        totalPayout: existingSettleReport.totalPayout,
        ggr: existingSettleReport.ggr,
        totalCommission: existingSettleReport.totalCommission,
        netProfit: existingSettleReport.netProfit,
      } satisfies VoidPreviousSettleSnapshot;

      // 0b. Xoá settle tenant reports trước
      // deleteMany idempotent — crash sau bước này → retry xoá draw report tiếp
      await this.tenantReportRepo.deleteByDrawId(drawId);

      // 0c. Xoá settle draw report
      await this.drawReportRepo.deleteByDrawId(drawId);
    }

    // ── Phase 1: Aggregate voided entries và build void report ──────────────
    const voidMetrics = await this.entryRepo.aggregateVoidMetrics(drawId);

    await this.voidReportRepo.upsertVoidReport({
      drawId,
      financialDate,
      entryCount: voidMetrics.entryCount,
      playerCount: voidMetrics.playerCount,
      tenantCount: voidMetrics.tenantCount,
      totalOriginalStake: voidMetrics.totalOriginalStake,
      totalRefundAmount: voidMetrics.totalRefundAmount,
      wasPreviouslySettled,
      previousSettleSnapshot,
    });

    return {
      drawId,
      entryCount: voidMetrics.entryCount,
      wasPreviouslySettled,
    };
  }
}
