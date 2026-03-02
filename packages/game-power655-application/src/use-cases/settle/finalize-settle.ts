/**
 * Use Case: Finalize Settle (Power 6/55)
 *
 * Bước cuối cùng trong settle flow:
 *   1. Chuyển draw: settling → settled (atomic, idempotent)
 *   2. Ghi dual jackpot snapshot lên draw (JP1 + JP2 opening/closing)
 *   3. Cập nhật / đóng jackpot cycle (JP1 + JP2 separately)
 *
 * Khác biệt so với Lotto 5/35:
 *   - Dual jackpot snapshot (openingJp1/closingJp1 + openingJp2/closingJp2)
 *   - Cycle update cho cả JP1 và JP2
 *   - Close cycle reason: jackpot1_winner, jackpot2_winner, both_winner, split
 *   - Overflow handling: JP1 cap → overflow sang JP2
 *
 * CRASH-SAFE:
 *   - transitionStatus atomic: settling → settled
 *   - Jackpot snapshot overwrite OK (idempotent)
 *   - Cycle update idempotent
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import type { JackpotCycleClosedReason } from "@megawin/game-power655/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { GetGlobalConfigInternalUseCase } from "../game-config/get-global-config-internal";
import { JackpotCycleRepository } from "../../infras/repos/jackpot-cycle-repo";

export interface FinalizeSettleInput {
  /** ID kỳ quay cần finalize. */
  drawId: string;
  /** Số dư Jackpot 1 đầu kỳ (VND). */
  jp1OpeningAmount: number;
  /** Số dư Jackpot 2 đầu kỳ (VND). */
  jp2OpeningAmount: number;
  /** Số dư Jackpot 1 cuối kỳ (VND). Reset về seed nếu có winner/split. */
  closingJp1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). Reset về seed nếu có winner/split. */
  closingJp2: number;
  /** Số dư Jackpot 1 opening cho kỳ tiếp theo (VND). */
  nextJp1Opening: number;
  /** Số dư Jackpot 2 opening cho kỳ tiếp theo (VND). */
  nextJp2Opening: number;
  /** Có người trúng Jackpot 1 (6/6) hay không. */
  hasJackpot1Winner: boolean;
  /** Có người trúng Jackpot 2 (5/6 + bonus) hay không. */
  hasJackpot2Winner: boolean;
  /** Có phải kỳ chia giải (tổng JP vượt splitThreshold) hay không. */
  isSplitCycle: boolean;
  /** Chi tiết chia giải theo tier (chỉ có khi isSplitCycle = true). */
  splitDetails?: Record<
    string,
    {
      /** Số tiền ban đầu phân bổ cho tier (VND). */
      initialAmount: number;
      /** Số tiền tái phân phối từ tier không có winner (VND). */
      redistributedAmount: number;
      /** Tổng tiền cho tier (VND). */
      totalAmount: number;
      /** Số người thắng tier này. */
      winnerCount: number;
      /** Số tiền bonus mỗi người (VND). */
      bonusPerWinner: number;
    }
  >;
}

export interface FinalizeSettleResult {
  /** ID kỳ quay đã finalize. */
  drawId: string;
  /** Trạng thái mới sau finalize (= "settled"). */
  status: string;
  /** Số dư Jackpot 1 cuối kỳ (VND). */
  closingJp1: number;
  /** Số dư Jackpot 2 cuối kỳ (VND). */
  closingJp2: number;
  /** Số dư Jackpot 1 opening cho kỳ tiếp theo (VND). */
  nextJp1Opening: number;
  /** Số dư Jackpot 2 opening cho kỳ tiếp theo (VND). */
  nextJp2Opening: number;
  /** Thời điểm hoàn thành settle (ISO 8601). */
  completedAt: string;
}

/**
 * Finalize settle: transition draw + ghi dual jackpot snapshot + update cycle.
 */
export class FinalizeSettleUseCase extends StepFunctionUseCase<
  FinalizeSettleInput,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();
  private readonly cycleRepo = new JackpotCycleRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  /** @inheritdoc */
  protected async execute(
    input: FinalizeSettleInput
  ): Promise<FinalizeSettleResult> {
    const { drawId, closingJp1, closingJp2, nextJp1Opening, nextJp2Opening } =
      input;

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
      closingJp1,
      closingJp2,
      nextJp1Opening,
      nextJp2Opening,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * Ghi dual jackpot snapshot lên draw đã settle (bản ghi lịch sử).
   * Idempotent: overwrite OK.
   */
  private async writeJackpotSnapshot(
    input: FinalizeSettleInput
  ): Promise<void> {
    const {
      drawId,
      jp1OpeningAmount,
      jp2OpeningAmount,
      closingJp1,
      closingJp2,
      isSplitCycle,
    } = input;

    await this.drawRepo.updateJackpot(drawId, {
      openingJackpot1: jp1OpeningAmount,
      closingJackpot1: closingJp1,
      openingJackpot2: jp2OpeningAmount,
      closingJackpot2: closingJp2,
      isSplitCycle: isSplitCycle || undefined,
    });
  }

  /**
   * Cập nhật jackpot cycle sau settle (dual JP1 + JP2).
   *
   * Close reasons:
   *   - jackpot1_winner: có người trúng JP1 (6/6)
   *   - jackpot2_winner: có người trúng JP2 (5/6 + bonus)
   *   - both_winner: cả JP1 và JP2 đều có winner
   *   - split: tổng JP vượt splitThreshold
   */
  private async updateJackpotCycle(input: FinalizeSettleInput): Promise<void> {
    const {
      drawId,
      closingJp1,
      closingJp2,
      hasJackpot1Winner,
      hasJackpot2Winner,
      isSplitCycle,
      splitDetails,
    } = input;

    const activeCycle = await this.cycleRepo.getActiveCycle();
    if (!activeCycle) return;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) return;

    const newDrawCount = activeCycle.drawCount + 1;
    const shouldCloseCycle =
      hasJackpot1Winner || hasJackpot2Winner || isSplitCycle;

    if (shouldCloseCycle) {
      let closedReason: JackpotCycleClosedReason;
      if (hasJackpot1Winner && hasJackpot2Winner) {
        closedReason = "both_winner";
      } else if (hasJackpot1Winner) {
        closedReason = "jackpot1_winner";
      } else if (hasJackpot2Winner) {
        closedReason = "jackpot2_winner";
      } else {
        closedReason = "split";
      }

      let winners: any[] | undefined;
      if (hasJackpot1Winner) {
        const jp1Entries = await this.entryRepo.findJackpot1Winners(drawId);
        const jp1PerWinner =
          jp1Entries.length > 0
            ? Math.floor(input.jp1OpeningAmount / jp1Entries.length)
            : 0;
        winners = jp1Entries.map((e) => ({
          accountId: e.accountId,
          tenantId: e.tenantId,
          prizeAmount: jp1PerWinner,
          entryId: e.id,
          drawId,
          jackpotType: "jackpot1",
        }));
      }
      if (hasJackpot2Winner) {
        const jp2Entries = await this.entryRepo.findJackpot2Winners(drawId);
        const jp2PerWinner =
          jp2Entries.length > 0
            ? Math.floor(input.jp2OpeningAmount / jp2Entries.length)
            : 0;
        const jp2Winners = jp2Entries.map((e) => ({
          accountId: e.accountId,
          tenantId: e.tenantId,
          prizeAmount: jp2PerWinner,
          entryId: e.id,
          drawId,
          jackpotType: "jackpot2",
        }));
        winners = [...(winners ?? []), ...jp2Winners];
      }

      let splitDetail: any;
      if (isSplitCycle && splitDetails) {
        let totalWinners = 0;
        let totalPaid = 0;
        for (const tier of Object.values(splitDetails)) {
          totalWinners += tier.winnerCount;
          totalPaid += tier.bonusPerWinner * tier.winnerCount;
        }
        splitDetail = {
          splitAmount:
            activeCycle.jackpot1Current + activeCycle.jackpot2Current,
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
        closedReason,
        finalJp1: activeCycle.jackpot1Current,
        finalJp2: activeCycle.jackpot2Current,
        splitDetail,
        winners,
      });

      const globalConfig = await this.getGlobalConfig.run();
      await this.cycleRepo.createCycle({
        startDrawId: drawId,
        jp1SeedAmount: globalConfig.jackpot.jackpot1.seedAmount,
        jp2SeedAmount: globalConfig.jackpot.jackpot2.seedAmount,
        config: {
          splitThreshold: globalConfig.jackpot.splitThreshold,
          splitRatios: globalConfig.jackpot.splitRatios,
        },
      });
    } else {
      await this.cycleRepo.updateCycleStats({
        cycleNo: activeCycle.cycleNo,
        jackpot1Current: closingJp1,
        jackpot2Current: closingJp2,
        drawCount: newDrawCount,
        lastSettledDrawId: drawId,
      });
    }
  }
}
