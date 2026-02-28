/**
 * Use Case: Settle Entries Batch (Keno)
 *
 * Xử lý 1 batch entries: match boards + side bets → payout → settle.
 *
 * CRASH-SAFE:
 *   - Luôn query page 1 filter status = "drawn"
 *   - settleEntry() atomic: chỉ update nếu status = "drawn"
 *   - done = true khi không còn entries "drawn"
 *
 * Keno khác Lotto: match cả boards (basic) + side bets (big/small, even/odd).
 * Không có Jackpot tích luỹ – tất cả giải thưởng cố định theo bảng.
 *
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import {
  type KenoBigSmallBet,
  type KenoEvenOddBet,
  KenoPlayType,
  PayoutStatus,
} from "@megawin/game-keno/entities";
import {
  matchBasicBoard,
  matchBigSmallBet,
  matchEvenOddBet,
  type DrawResultForMatch,
} from "@megawin/game-keno/helpers";
import {
  getPickCountFromPlayType,
  calculateCappedPrize,
} from "@megawin/game-keno/rules";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface SettleEntriesBatchInput {
  drawId: string;
  result: {
    winningNumbers: number[];
    bigCount: number;
    smallCount: number;
    evenCount: number;
    oddCount: number;
  };
  config: {
    basicPrizes: Record<string, Record<number, number>>;
    bigSmallPrizes: Record<string, number>;
    evenOddPrizes: Record<string, number>;
    payoutCaps: {
      pick8MaxPerDraw: number;
      pick8MaxSetsForFixed: number;
      pick9MaxPerDraw: number;
      pick9MaxSetsForFixed: number;
      pick10MaxPerDraw: number;
      pick10MaxSetsForFixed: number;
    };
  };
  batchSize: number;
}

export interface SettleAccumulator {
  totalSettled: number;
  totalPayoutAmount: number;
  totalWinAmount: number;
}

export interface SettleEntriesBatchResult {
  done: boolean;
  accumulator: SettleAccumulator;
  batchSettled: number;
}

export class SettleEntriesBatchUseCase extends StepFunctionUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: SettleEntriesBatchInput
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config, batchSize } = input;
    const drawResult: DrawResultForMatch = {
      winningNumbers: result.winningNumbers,
      bigCount: result.bigCount,
      smallCount: result.smallCount,
      evenCount: result.evenCount,
      oddCount: result.oddCount,
    };

    const entries = await this.entryRepo.getDrawnEntriesBatch(
      drawId,
      1,
      batchSize
    );

    if (entries.length === 0) {
      return {
        done: true,
        accumulator: emptyAccumulator(),
        batchSettled: 0,
      };
    }

    const acc = emptyAccumulator();
    let batchSettled = 0;

    for (const entry of entries) {
      const boardPayouts: Array<{
        boardNo: string;
        playType: string;
        matchCount: number;
        pickCount: number;
        winAmount: number;
      }> = [];

      const boards = entry.entrySummary?.boards ?? [];
      for (const board of boards) {
        if (board.isVoid) continue;

        const pickCount = board.numbers.length;
        const playTypePrizes = config.basicPrizes[`pick${pickCount}`];
        const prizeTable = playTypePrizes
          ? { [pickCount]: playTypePrizes }
          : undefined;

        const matchResult = matchBasicBoard(
          board.numbers,
          drawResult,
          prizeTable
        );
        boardPayouts.push({
          boardNo: board.boardNo,
          playType: board.playType,
          matchCount: matchResult.matchCount,
          pickCount: matchResult.pickCount,
          winAmount: matchResult.winAmount,
        });
      }

      const sideBetPayouts: Array<{
        playType: string;
        bet: string;
        outcome: string;
        isWin: boolean;
        winAmount: number;
      }> = [];

      const sideBets = entry.entrySummary?.sideBets ?? [];
      for (const sb of sideBets) {
        if (sb.isVoid) continue;

        if (sb.playType === KenoPlayType.BigSmall) {
          const matchResult = matchBigSmallBet(
            sb.bet as KenoBigSmallBet,
            drawResult,
            config.bigSmallPrizes as any
          );
          sideBetPayouts.push({
            playType: sb.playType,
            bet: sb.bet,
            outcome: matchResult.outcome,
            isWin: matchResult.isWin,
            winAmount: matchResult.winAmount,
          });
        } else if (sb.playType === KenoPlayType.EvenOdd) {
          const matchResult = matchEvenOddBet(
            sb.bet as KenoEvenOddBet,
            drawResult,
            config.evenOddPrizes as any
          );
          sideBetPayouts.push({
            playType: sb.playType,
            bet: sb.bet,
            outcome: matchResult.outcome,
            isWin: matchResult.isWin,
            winAmount: matchResult.winAmount,
          });
        }
      }

      const winAmount =
        boardPayouts.reduce((sum, b) => sum + b.winAmount, 0) +
        sideBetPayouts.reduce((sum, s) => sum + s.winAmount, 0);

      const hasWin = winAmount > 0;

      const settled = await this.entryRepo.settleEntry(
        entry.id,
        {
          winAmount,
          payoutAmount: winAmount,
          boardPayouts,
          sideBetPayouts,
          settledAt: new Date(),
          payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
        },
        hasWin ? EntryOutcome.Win : EntryOutcome.Loss
      );

      if (!settled) continue;

      acc.totalSettled++;
      acc.totalWinAmount += winAmount;
      acc.totalPayoutAmount += winAmount;
      batchSettled++;
    }

    return {
      done: entries.length < batchSize,
      accumulator: acc,
      batchSettled,
    };
  }
}

function emptyAccumulator(): SettleAccumulator {
  return {
    totalSettled: 0,
    totalPayoutAmount: 0,
    totalWinAmount: 0,
  };
}
