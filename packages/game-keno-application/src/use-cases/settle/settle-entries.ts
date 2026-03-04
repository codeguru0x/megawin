/**
 * Use Case: Settle Entries Batch (Keno)
 *
 * Xử lý 1 batch entries: match boards + side bets → payout → settle.
 *
 * CRASH-SAFE:
 *   - Luôn query status = "scheduled" với limit cố định (DEFAULT_BATCH_SIZE)
 *   - settleEntry() atomic: chỉ update nếu status = "scheduled"
 *   - done = true khi không còn entries "scheduled"
 *
 * Keno khác Lotto: match cả boards (basic) + side bets (big/small, even/odd).
 * Không có Jackpot tích luỹ – tất cả giải thưởng cố định theo bảng.
 *
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  type KenoBigSmallBet,
  type KenoEvenOddBet,
  KenoPlayType,
  PayoutStatus,
} from "@megawin/game-keno/entities";
import { matchBasicBoard, matchBigSmallBet, matchEvenOddBet } from "@megawin/game-keno/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { KenoDrawResult, KenoSettleConfig } from "./types";

const DEFAULT_BATCH_SIZE = 500;

export interface SettleEntriesBatchInput {
  drawId: string;
  result: KenoDrawResult;
  config: Pick<KenoSettleConfig, "basicPrizes" | "bigSmallPrizes" | "evenOddPrizes" | "payoutCaps">;
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

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: SettleEntriesBatchInput): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config } = input;

    const entries = await this.entryRepo.getScheduledEntries(drawId, DEFAULT_BATCH_SIZE);

    if (entries.length === 0) {
      return {
        done: true,
        accumulator: emptyAccumulator(),
        batchSettled: 0,
      };
    }

    const acc = emptyAccumulator();
    let batchSettled = 0;
    const now = new Date();

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
        const playTypePrizes = config.basicPrizes[board.playType];
        const pickCount = board.numbers.length;
        const prizeTable = playTypePrizes ? { [pickCount]: playTypePrizes } : undefined;

        const matchResult = matchBasicBoard(board.numbers, result, prizeTable);
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
        if (sb.playType === KenoPlayType.BigSmall) {
          const matchResult = matchBigSmallBet(
            sb.bet as KenoBigSmallBet,
            result,
            config.bigSmallPrizes,
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
            result,
            config.evenOddPrizes,
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
          settledAt: now,
          payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
        },
        hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
        {
          winningNumbers: result.winningNumbers,
          publishedAt: now,
          bigCount: result.bigCount,
          smallCount: result.smallCount,
          evenCount: result.evenCount,
          oddCount: result.oddCount,
        },
      );

      if (!settled) continue;

      acc.totalSettled++;
      acc.totalWinAmount += winAmount;
      acc.totalPayoutAmount += winAmount;
      batchSettled++;
    }

    return {
      done: entries.length < DEFAULT_BATCH_SIZE,
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
