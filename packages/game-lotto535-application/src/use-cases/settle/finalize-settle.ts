/**
 * Use Case: Finalize Settle
 *
 * Bước cuối cùng trong settle flow:
 *   1. Chuyển draw: settling → settled (atomic, idempotent)
 *   2. Ghi jackpot snapshot lên draw đã settle (openingAmount + closingAmount)
 *   3. Cập nhật / đóng jackpot cycle
 *
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Nếu draw đã settled → skip (không throw)
 *   - Jackpot snapshot overwrite OK (idempotent)
 *   - Cycle update idempotent: overwrite stats / close OK
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws không lưu jackpot — đọc từ `jackpot_cycles.currentAmount`.
 *   Chỉ khi settle xong mới ghi snapshot lên draw (bản ghi lịch sử).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-lotto535/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";

export interface FinalizeSettleInput {
  /** Mã kỳ quay cần finalize. */
  drawId: string;
  /** Số tiền Jackpot đầu kỳ (VND) — từ PrepareSettle. */
  jackpotOpeningAmount: number;
  /** Số tiền Jackpot cuối kỳ (VND) — từ CalculateFinancials. */
  closingJackpot: number;
  /** Số tiền Jackpot mở cho kỳ tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Có người trúng Jackpot hay không. */
  hasJackpotWinner: boolean;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /**
   * Chi tiết phân bổ split — chỉ có khi isSplitCycle = true.
   * Key: tier name, Value: thông tin phân bổ.
   */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân cho tier (VND). */
      initialAmount: number;
      /** Số tiền tái phân bổ (VND). */
      redistributedAmount: number;
      /** Tổng tiền tier nhận (VND). */
      totalAmount: number;
      /** Số người trúng tier. */
      winnerCount: number;
      /** Bonus mỗi người (VND). */
      bonusPerWinner: number;
    }
  >;
}

export interface FinalizeSettleResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Trạng thái sau finalize (= "settled"). */
  status: string;
  /** Số tiền Jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Số tiền Jackpot mở kỳ tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Thời điểm hoàn thành settle (ISO 8601). */
  completedAt: string;
}

export class FinalizeSettleUseCase extends InternalUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(
    input: FinalizeSettleInput
  ): Promise<FinalizeSettleResult> {
    const {
      drawId,
      closingJackpot,
      nextJackpotOpening,
      hasJackpotWinner,
      isSplitCycle,
      splitDetails,
    } = input;

    const updated = await this.drawRepo.transitionStatus(
      drawId,
      DrawStatus.Settling,
      DrawStatus.Settled
    );

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw new Error(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`
        );
      }
    }

    await this.writeJackpotSnapshot(input);

    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot,
      nextJackpotOpening,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Ghi jackpot snapshot lên draw đã settle (bản ghi lịch sử).
   * Dùng jackpotOpeningAmount từ PrepareSettle (crash-safe, không query lại cycle).
   * Idempotent: overwrite OK.
   */
  private async writeJackpotSnapshot(
    input: FinalizeSettleInput
  ): Promise<void> {
    const { drawId, jackpotOpeningAmount, closingJackpot, isSplitCycle } =
      input;

    await this.drawRepo.updateJackpot(drawId, {
      openingAmount: jackpotOpeningAmount,
      closingAmount: closingJackpot,
      isSplitCycle: isSplitCycle || undefined,
    });
  }

  /**
   * Cập nhật jackpot cycle sau settle.
   *
   * - Luôn update stats (currentAmount, drawCount)
   * - Nếu có winner hoặc split → close cycle + tạo cycle mới
   */
  private async updateJackpotCycle(input: FinalizeSettleInput): Promise<void> {
    const {
      drawId,
      closingJackpot,
      hasJackpotWinner,
      isSplitCycle,
      splitDetails,
    } = input;

    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (!activeCycle) return;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) return;

    const contribution = draw.financial?.jackpotContribution ?? 0;
    const newDrawCount = activeCycle.drawCount + 1;

    const shouldCloseCycle = hasJackpotWinner || isSplitCycle;

    if (shouldCloseCycle) {
      let winners = undefined;

      if (hasJackpotWinner) {
        const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);
        const jackpotPerWinner =
          jackpotEntries.length > 0
            ? Math.floor(input.jackpotOpeningAmount / jackpotEntries.length)
            : 0;
        winners = jackpotEntries.map((e) => ({
          accountId: e.accountId,
          tenantId: e.tenantId,
          prizeAmount: jackpotPerWinner,
          entryId: e.id,
          drawId,
        }));
      }

      let splitDetail = undefined;
      if (isSplitCycle && splitDetails) {
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
            ])
          ),
          totalWinners,
          totalPaid,
        };
      }

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

      const globalConfig = await this.getGlobalConfig.run();
      await this.cycleRepo.createCycle({
        startDrawId: drawId,
        seedAmount: globalConfig.jackpot.seedAmount,
        config: {
          splitThreshold: globalConfig.jackpot.splitThreshold,
          splitRatios: globalConfig.jackpot.splitRatios,
        },
      });
    } else {
      await this.cycleRepo.updateCycleStats({
        cycleNo: activeCycle.cycleNo,
        currentAmount: closingJackpot,
        contribution: activeCycle.totalContribution + contribution,
        drawCount: newDrawCount,
        lastSettledDrawId: drawId,
      });
    }
  }
}
