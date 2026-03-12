/**
 * Use Case: Finalize Settle (Lotto 5/35)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TỔNG QUAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Bước cuối của settle pipeline: chuyển draw status settling → settled,
 * ghi jackpot snapshot vào DrawDoc (atomic, 1 query), cập nhật JackpotCycle.
 * CRASH-SAFE + IDEMPOTENT.
 *
 * Lotto 5/35 theo luật Vietlott: có Split Cycle khi Jackpot >= splitThreshold.
 * Cycle đóng khi có winner, split thực tế, hoặc manual_reset.
 *
 * LƯU Ý: Tiền thưởng jackpot đã được patch vào entries + lines
 * ở step PatchJackpotPrize. Split bonus đã được patch ở step ApplySplitBonuses.
 * Step này CHỈ ghi cycle metadata (winners, splitDetail).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalJackpotPrize / số winners).
 *
 * closeCycle với finalAmount = totalJackpotPrize (ghi lịch sử Jackpot đã trao).
 * Cycle mới bắt đầu từ seedAmount (lấy từ settleCtx.config).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI SPLIT (không có winner)
 * ─────────────────────────────────────────────────────────────────────────────
 * isSplitCycle = true && splitDetails != null → chia Jackpot cho tier1-tier5 winners.
 * closeCycle với finalAmount = activeCycle.currentAmount, ghi splitDetail.
 * Cycle mới bắt đầu từ seedAmount.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI KHÔNG CÓ WINNER (roll-over)
 * ─────────────────────────────────────────────────────────────────────────────
 * Roll-over: closingJackpot = openingAmount + contribution → tích luỹ sang kỳ sau.
 * updateCycleStats dùng giá trị snapshot từ PrepareSettle → idempotent.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import {
  JackpotCycleCloseReason,
  type JackpotSplitDetail,
  type SplitTierAllocation,
} from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContextWithFinancials, LottoSplitTierDetail } from "./types";

export interface FinalizeSettleResult {
  /** ID kỳ quay đã hoàn tất settle. */
  drawId: string;
  /** Trạng thái sau khi hoàn tất (= "settled"). */
  status: string;
  /** Giá trị jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Thời điểm hoàn tất settle (ISO datetime). */
  completedAt: string;
}

/**
 * Bước cuối của settle pipeline Lotto 5/35: chuyển draw settling → settled,
 * ghi jackpot snapshot, cập nhật JackpotCycle.
 *
 * CRASH-SAFE + IDEMPOTENT: mọi bước đều idempotent — chạy lại an toàn sau crash.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JACKPOT KHI CÓ WINNER
 * ─────────────────────────────────────────────────────────────────────────────
 * totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *   → Winner nhận toàn bộ pool tích luỹ + contribution kỳ này.
 *   → Nhiều winners: chia đều = floor(totalJackpotPrize / số winners).
 *
 * RETRY DETECTION cho winner/split flow:
 *   - findClosedByEndDrawId: nếu đã có closed cycle → chỉ đảm bảo active cycle tồn tại.
 *   - closeCycle filter status = "active" → idempotent (no-op nếu đã closed).
 *   - createCycle guard getActiveCycle() → skip nếu đã tạo.
 *
 * JACKPOT KHI KHÔNG CÓ WINNER (roll-over)
 * ─────────────────────────────────────────────────────────────────────────────
 * DrawDoc.jackpot.closingAmount = openingAmount + contribution.
 * updateCycleStats dùng giá trị snapshot từ PrepareSettle (không cộng dồn từ activeCycle)
 * → idempotent.
 */
export class FinalizeSettleUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly cycleRepo = new JackpotCycleRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, isSplitCycle, jackpotOpeningAmount, financials } = input;
    const closingAmount = jackpotOpeningAmount + financials.jackpotContribution;

    // ── Bước 1: Chuyển draw status settling → settled + ghi jackpot snapshot ──
    // settleComplete filter status = "settling" → idempotent (no-op nếu đã settled).
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: jackpotOpeningAmount,
      closingAmount,
      isSplitCycle: isSplitCycle || undefined,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw AppException.internal(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`,
        );
      }
    }

    // ── Bước 2: Cập nhật JackpotCycle ─────────────────────────────────────────
    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot: closingAmount,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Cập nhật jackpot cycle sau settle.
   *
   * Winner/Split flow (crash-safe):
   *   1. findClosedByEndDrawId(drawId) → nếu đã closed (retry) → chỉ ensureNextCycle.
   *   2. getActiveCycle → lấy cycle hiện tại.
   *   3. closeCycle (filter status=active → idempotent).
   *   4. createCycle (guard getActiveCycle → idempotent).
   *
   * Roll-over flow (idempotent):
   *   - updateCycleStats dùng giá trị snapshot từ PrepareSettle:
   *     contribution = cycleContributionBefore + jackpotContribution (tuyệt đối)
   *     drawCount = cycleDrawCountBefore + 1 (tuyệt đối)
   *   → chạy lại nhiều lần cho kết quả giống nhau.
   */
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, isSplitCycle, financials } = input;
    const { hasJackpotWinner, splitDetails, jackpotContribution } = financials;

    const splitExecuted = isSplitCycle && splitDetails != null;
    const shouldCloseCycle = hasJackpotWinner || splitExecuted;

    if (shouldCloseCycle) {
      // ── Winner / Split flow ─────────────────────────────────────────────────

      // Retry detection: nếu đã có closed cycle với endDrawId = drawId
      // → closeCycle đã chạy thành công lần trước → chỉ đảm bảo active cycle tồn tại.
      const alreadyClosed = await this.cycleRepo.findClosedByEndDrawId(drawId);
      if (alreadyClosed) {
        console.log(
          `Cycle ${alreadyClosed.cycleNo} already closed for draw ${drawId}, ensuring next cycle exists.`,
        );
        await this.ensureNextCycleExists(drawId, input.config);
        return;
      }

      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.closeAndCreateNextCycle(activeCycle, input);
    } else {
      // ── Roll-over flow ──────────────────────────────────────────────────────
      // Không có winner, không split: tích luỹ tiếp.
      // Dùng giá trị snapshot từ PrepareSettle (cycleContributionBefore, cycleDrawCountBefore)
      // thay vì đọc lại activeCycle → idempotent khi retry (không cộng dồn 2 lần).
      const activeCycle = await this.cycleRepo.getActiveCycle();
      if (!activeCycle) return;

      await this.cycleRepo.updateCycleStats({
        cycleNo: input.config.cycleNo,
        currentAmount: input.jackpotOpeningAmount + jackpotContribution,
        contribution: input.config.cycleContributionBefore + jackpotContribution,
        drawCount: input.config.cycleDrawCountBefore + 1,
        lastSettledDrawId: drawId,
      });
    }
  }

  /**
   * Đóng cycle hiện tại + tạo cycle mới.
   *
   * closeCycle idempotent: filter status = "active" → nếu đã closed thì no-op.
   * ensureNextCycleExists: kiểm tra active cycle trước khi tạo → không duplicate.
   */
  private async closeAndCreateNextCycle(
    activeCycle: { cycleNo: number; currentAmount: number },
    input: SettleContextWithFinancials,
  ): Promise<void> {
    const { drawId, isSplitCycle, jackpotOpeningAmount, financials } = input;
    const { hasJackpotWinner, splitDetails, jackpotContribution } = financials;

    // ── Build split detail (nếu split thực tế) ──
    const splitExecuted = isSplitCycle && splitDetails != null;
    let splitDetail: JackpotSplitDetail | undefined = undefined;
    if (splitExecuted && splitDetails) {
      const tierEntries = Object.entries(splitDetails) as [string, LottoSplitTierDetail][];
      let totalWinners = 0;
      let totalPaid = 0;
      for (const [, tier] of tierEntries) {
        totalWinners += tier.winnerCount;
        totalPaid += tier.bonusPerWinner * tier.winnerCount;
      }

      const tierAllocations: Record<string, SplitTierAllocation> = {};
      for (const [name, d] of tierEntries) {
        tierAllocations[name] = {
          winnerCount: d.winnerCount,
          bonusPerWinner: d.bonusPerWinner,
          totalAmount: d.totalAmount,
        };
      }

      splitDetail = {
        splitAmount: activeCycle.currentAmount,
        tierAllocations,
        totalWinners,
        totalPaid,
      };
    }

    // ── Đóng cycle (idempotent: filter status = "active") ──
    await this.cycleRepo.closeCycle({
      cycleNo: activeCycle.cycleNo,
      endDrawId: drawId,
      closeReason: hasJackpotWinner
        ? JackpotCycleCloseReason.Winner
        : JackpotCycleCloseReason.Split,
      finalAmount: hasJackpotWinner
        ? jackpotOpeningAmount + jackpotContribution
        : activeCycle.currentAmount,
      // cycleDrawCountBefore + 1 = số kỳ bao gồm kỳ đang đóng (tuyệt đối → idempotent khi retry).
      drawCount: input.config.cycleDrawCountBefore + 1,
      splitDetail,
      winners: hasJackpotWinner ? (input.jackpotWinners ?? []) : undefined,
    });

    // ── Tạo cycle mới ──
    await this.ensureNextCycleExists(drawId, input.config);
  }

  /**
   * Đảm bảo có active cycle cho draw tiếp theo.
   * createCycle có guard findOne({ status: Active }) → skip nếu đã tồn tại (idempotent).
   * Nếu không có draw tiếp → skip (create-draws hoặc prepare-settle sẽ tạo sau).
   */
  private async ensureNextCycleExists(
    drawId: string,
    config: SettleContextWithFinancials["config"],
  ): Promise<void> {
    const existingActive = await this.cycleRepo.getActiveCycle();
    if (existingActive) return;

    const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
    if (!nextDraw) return;

    await this.cycleRepo.createCycle({
      startDrawId: nextDraw.drawId,
      seedAmount: config.seedAmount,
      config: {
        splitThreshold: config.splitThreshold,
        splitRatios: config.splitRatios,
      },
    });
  }
}
