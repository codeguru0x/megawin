/**
 * Use Case: Finalize Settle (Mega 6/45)
 *
 * Bước cuối: settling → settled + ghi jackpot snapshot + cập nhật cycle.
 * CRASH-SAFE + IDEMPOTENT.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { MegaSplitTierDetail } from "./types";

export interface FinalizeSettleInput {
  /** ID kỳ quay cần hoàn tất settle. */
  drawId: string;
  /** Giá trị jackpot đầu kỳ (VND). */
  jackpotOpeningAmount: number;
  /** Giá trị jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Giá trị jackpot mở đầu cycle tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Có người trúng jackpot (6/6) trong kỳ không. */
  hasJackpotWinner: boolean;
  /** Kỳ này có thực hiện split jackpot không. */
  isSplitCycle: boolean;
  /**
   * Chi tiết chia jackpot theo hạng (chỉ có khi isSplitCycle = true).
   * Key = tier, value = thông tin chia.
   */
  splitDetails?: Record<string, MegaSplitTierDetail>;
}

export interface FinalizeSettleResult {
  /** ID kỳ quay đã hoàn tất settle. */
  drawId: string;
  /** Trạng thái sau khi hoàn tất (= "settled"). */
  status: string;
  /** Giá trị jackpot cuối kỳ (VND). */
  closingJackpot: number;
  /** Giá trị jackpot mở đầu cycle tiếp theo (VND). */
  nextJackpotOpening: number;
  /** Thời điểm hoàn tất settle (ISO datetime). */
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
