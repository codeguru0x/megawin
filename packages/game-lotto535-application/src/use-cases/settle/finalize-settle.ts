/**
 * Use Case: Finalize Settle (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 7 TRONG SETTLE FLOW (BƯỚC CUỐI TRƯỚC DISPATCH PAYOUTS)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Bước cuối cùng trong settle flow (trước payout):
 *   1. Chuyển draw: settling → settled + ghi jackpot snapshot (atomic, 1 query)
 *   2. Cập nhật / đóng jackpot cycle
 *
 * LƯU Ý: Tiền thưởng jackpot đã được patch vào entries + lines
 * ở step 4a (PatchJackpotPrize). Split bonus đã được patch ở step 4b
 * (ApplySplitBonuses). Step này CHỈ ghi cycle metadata (winners, splitDetail).
 *
 * ────────────────────────────────────────────────
 * LOGIC CHÍNH:
 * ────────────────────────────────────────────────
 *
 *   A. TRANSITION DRAW STATUS:
 *      - settling → settled (atomic update với guard status = "settling")
 *      - Ghi jackpot snapshot lên draw:
 *        { openingAmount, closingAmount, isSplitCycle }
 *      - Nếu draw đã settled (retry) → skip, không throw
 *
 *   B. CẬP NHẬT JACKPOT CYCLE:
 *      Có 3 nhánh:
 *
 *      B0. ĐÃ XỬ LÝ (retry):
 *          → Tìm thấy closed cycle với endDrawId = drawId
 *          → Chỉ đảm bảo active cycle tồn tại cho kỳ tiếp theo
 *
 *      B1. CẦN ĐÓNG (có winner JP hoặc split thực tế):
 *          → Đóng cycle hiện tại + ghi winners/splitDetail
 *          → Tạo cycle mới nếu có draw tiếp theo
 *
 *      B2. TÍCH LUỸ (kỳ thường):
 *          → Update stats cycle hiện tại
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - settleComplete: settling → settled (idempotent, skip nếu đã settled)
 *   - Cycle đóng: kiểm tra findClosedByEndDrawId(drawId) trước khi làm gì
 *     → Nếu đã đóng (retry) → chỉ đảm bảo active cycle tồn tại
 *   - closeCycle: filter status = "active" → nếu đã closed thì no-op
 *   - createCycle: guard bằng getActiveCycle() → không tạo duplicate
 *
 * ────────────────────────────────────────────────
 * JACKPOT SOURCE OF TRUTH:
 * ────────────────────────────────────────────────
 *   - Active draws: Jackpot KHÔNG lưu trên draw → đọc từ jackpot_cycles.currentAmount
 *   - Settled draws: snapshot Jackpot được ghi lên draw tại step này (bản ghi lịch sử)
 *   - Kỳ tiếp theo lấy Jackpot opening từ cycle mới (hoặc cycle đã update)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContextWithFinancials } from "./types";
import { AppException } from "@megawin/shared/errors";

export interface FinalizeSettleResult {
  drawId: string;
  status: string;
  closingJackpot: number;
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const { drawId, isSplitCycle, jackpotOpeningAmount, financials } = input;
    const { closingJackpot } = financials;

    // ── STEP A: Transition draw settling → settled + ghi jackpot snapshot ──
    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: jackpotOpeningAmount,
      closingAmount: closingJackpot,
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

    // ── STEP B: Cập nhật Jackpot Cycle ──
    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot,
      completedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Jackpot Cycle Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Cập nhật jackpot cycle sau settle.
   *
   * Flow:
   *   1. Cycle đã đóng cho draw này? (retry detection)
   *      → YES: chỉ đảm bảo active cycle tồn tại → return
   *   2. Lấy active cycle
   *   3. Cần đóng cycle? (JP winner hoặc split thực tế)
   *      → YES: đóng cycle + tạo cycle mới
   *      → NO:  update stats (tích luỹ)
   */
  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, isSplitCycle, financials } = input;
    const { closingJackpot, hasJackpotWinner, splitDetails, jackpotContribution } = financials;

    const splitExecuted = isSplitCycle && splitDetails != null;
    const shouldCloseCycle = hasJackpotWinner || splitExecuted;

    // ── BƯỚC 1: Retry detection ──
    // Nếu đã có closed cycle với endDrawId = drawId → lần trước đã closeCycle thành công.
    // Chỉ cần đảm bảo active cycle tồn tại cho kỳ tiếp theo (phòng crash sau close, trước create).
    if (shouldCloseCycle) {
      const alreadyClosed = await this.cycleRepo.findClosedByEndDrawId(drawId);
      if (alreadyClosed) {
        console.log(
          `Cycle ${alreadyClosed.cycleNo} already closed for draw ${drawId}, ensuring next cycle exists.`,
        );
        await this.ensureNextCycleExists(drawId);
        return;
      }
    }

    // ── BƯỚC 2: Lấy active cycle ──
    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (!activeCycle) {
      return;
    }

    // Nếu cần đóng cycle → đóng cycle + tạo cycle mới cho draw tiếp theo.
    if (shouldCloseCycle) {
      // ── BƯỚC 3a: ĐÓNG CYCLE ──
      await this.closeAndCreateNextCycle(activeCycle, input);
    } else {
      // ── BƯỚC 3b: UPDATE STATS (tích luỹ) ──
      await this.cycleRepo.updateCycleStats({
        cycleNo: activeCycle.cycleNo,
        currentAmount: closingJackpot,
        contribution: activeCycle.totalContribution + jackpotContribution,
        drawCount: activeCycle.drawCount + 1,
        lastSettledDrawId: drawId,
      });
    }
  }

  /**
   * Đóng cycle hiện tại + tạo cycle mới cho draw tiếp theo.
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

    // ── Build winners metadata (nếu có JP winner) ──
    let winners = undefined;
    if (hasJackpotWinner) {
      const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);
      const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
      const jackpotPerWinner =
        jackpotEntries.length > 0 ? Math.floor(totalJackpotPrize / jackpotEntries.length) : 0;

      winners = jackpotEntries.map((e) => ({
        accountId: e.accountId,
        tenantId: e.tenantId,
        prizeAmount: jackpotPerWinner,
        entryId: e.id,
        drawId,
      }));
    }

    // ── Build split detail (nếu split thực tế) ──
    const splitExecuted = isSplitCycle && splitDetails != null;
    let splitDetail = undefined;
    if (splitExecuted && splitDetails) {
      let totalWinners = 0;
      let totalPaid = 0;
      for (const tier of Object.values(splitDetails)) {
        totalWinners += tier.winnerCount;
        totalPaid += tier.bonusPerWinner * tier.winnerCount;
      }

      splitDetail = {
        splitAmount: activeCycle.currentAmount,
        tierAllocations: Object.fromEntries(
          Object.entries(splitDetails).map(([tier, d]) => [
            tier,
            {
              winnerCount: d.winnerCount,
              bonusPerWinner: d.bonusPerWinner,
              totalAmount: d.totalAmount,
            },
          ]),
        ),
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
      finalAmount: activeCycle.currentAmount,
      splitDetail,
      winners,
    });

    // ── Tạo cycle mới nếu cần ──
    await this.ensureNextCycleExists(drawId);
  }

  /**
   * Đảm bảo có active cycle cho draw tiếp theo.
   * Nếu đã có active cycle → skip (idempotent khi retry).
   * Nếu không có draw tiếp → skip (create-draws hoặc prepare-settle sẽ tạo sau).
   */
  private async ensureNextCycleExists(drawId: string): Promise<void> {
    const existingActive = await this.cycleRepo.getActiveCycle();

    // Nếu đã có active cycle → skip (idempotent khi retry).
    if (existingActive) {
      return;
    }

    const nextDraw = await this.drawRepo.findNextPendingDraw(drawId);
    if (!nextDraw) return;

    const globalConfig = await this.getGlobalConfig.run();
    await this.cycleRepo.createCycle({
      startDrawId: nextDraw.drawId,
      seedAmount: globalConfig.jackpot.seedAmount,
      config: {
        splitThreshold: globalConfig.jackpot.splitThreshold,
        splitRatios: globalConfig.jackpot.splitRatios,
      },
    });
  }
}
