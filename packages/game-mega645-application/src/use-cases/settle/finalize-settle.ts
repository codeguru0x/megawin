/**
 * Use Case: Finalize Settle (Mega 6/45)
 *
 * Bước cuối: settling → settled + ghi jackpot snapshot (atomic, 1 query) + cập nhật cycle.
 * CRASH-SAFE + IDEMPOTENT.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { JackpotCycleCloseReason } from "@megawin/game-mega645/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";
import type { SettleContextWithFinancials } from "./types";

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
  SettleContextWithFinancials,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: SettleContextWithFinancials): Promise<FinalizeSettleResult> {
    const {
      drawId,
      jackpotOpeningAmount,
      isSplitCycle,
    } = input;
    const {
      closingJackpot,
      nextJackpotOpening,
      hasJackpotWinner,
      splitDetails,
    } = input.financials;

    const updated = await this.drawRepo.settleComplete(drawId, {
      openingAmount: input.jackpotOpeningAmount,
      closingAmount: closingJackpot,
      isSplitCycle: isSplitCycle || undefined,
    });

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        console.log(`Draw ${drawId} already settled, skipping transition.`);
      } else {
        throw new Error(`Cannot finalize draw ${drawId}. Current status: ${draw?.status}`);
      }
    }

    await this.updateJackpotCycle(input);

    return {
      drawId,
      status: DrawStatus.Settled,
      closingJackpot,
      nextJackpotOpening,
      completedAt: new Date().toISOString(),
    };
  }

  private async updateJackpotCycle(input: SettleContextWithFinancials): Promise<void> {
    const { drawId, isSplitCycle } = input;
    const { closingJackpot, hasJackpotWinner, splitDetails } = input.financials;

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
            ]),
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
