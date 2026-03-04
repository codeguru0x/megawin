/**
 * Use Case: Settle Entries Batch (Bingo 18)
 *
 * Xử lý 1 batch entries: match boards + side bets → payout → settle.
 *
 * CRASH-SAFE:
 *   - Luôn query status = "scheduled" với limit cố định (DEFAULT_BATCH_SIZE)
 *   - settleEntry() atomic: chỉ update nếu status = "scheduled"
 *   - done = true khi không còn entries "scheduled"
 *
 * Bingo 18 matching logic:
 *   - SingleNum: matchSingleNum → match1/2/3 prizes
 *   - DoubleMatch: matchDoubleMatch → win if ≥2 same
 *   - TripleMatch: matchTripleMatch → specific/any
 *   - SumTotal: matchSumTotal → exact sum match
 *   - BigSmallDraw: matchBigSmallDraw → big/draw/small
 *
 * NO payout caps. NO Jackpot.
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  Bingo18PlayType,
  type Bingo18BigSmallBet,
  type Bingo18TripleKind,
  PayoutStatus,
} from "@megawin/game-bingo18/entities";
import {
  matchSingleNum,
  matchDoubleMatch,
  matchTripleMatch,
  matchSumTotal,
  matchBigSmallDraw,
  type DrawResultForMatch,
} from "@megawin/game-bingo18/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { BingoDrawResult, BingoSettleConfig } from "./types";

const DEFAULT_BATCH_SIZE = 500;

export interface SettleEntriesBatchInput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Kết quả quay. */
  result: BingoDrawResult;
  /** Bảng giải thưởng dùng để tính payout. */
  config: Pick<
    BingoSettleConfig,
    "singleNumPrizes" | "doubleMatchPrizes" | "tripleMatchPrizes" | "sumTotalPrizes" | "bigSmallDrawPrizes"
  >;
}

export interface SettleAccumulator {
  /** Tổng entries đã settle thành công (batch hiện tại). */
  totalSettled: number;
  /** Tổng tiền trả thưởng (VND) = Σ(entry.payoutAmount). */
  totalPayoutAmount: number;
  /** Tổng tiền thắng (VND) = Σ(entry.winAmount). */
  totalWinAmount: number;
}

export interface SettleEntriesBatchResult {
  /** true khi không còn entries status "scheduled" → kết thúc loop. */
  done: boolean;
  /** Bộ tích luỹ thống kê batch hiện tại. */
  accumulator: SettleAccumulator;
  /** Số entries đã settle trong batch này. */
  batchSettled: number;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: SettleEntriesBatchInput
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config } = input;
    const drawResult: DrawResultForMatch = {
      numbers: result.numbers,
      sum: result.sum,
    };

    const entries = await this.entryRepo.getScheduledEntries(
      drawId,
      DEFAULT_BATCH_SIZE
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
    const now = new Date();

    for (const entry of entries) {
      const boardPayouts: Array<{
        boardNo: string;
        playType: string;
        matchCount: number;
        winAmount: number;
      }> = [];

      const boards = entry.entrySummary?.boards ?? [];
      for (const board of boards) {
        if (board.isVoid) continue;

        if (board.playType === Bingo18PlayType.SingleNum) {
          const matchResult = matchSingleNum(
            board.number!,
            drawResult,
            config.singleNumPrizes,
          );
          boardPayouts.push({
            boardNo: board.boardNo,
            playType: board.playType,
            matchCount: matchResult.matchCount,
            winAmount: matchResult.winAmount,
          });
        } else if (board.playType === Bingo18PlayType.DoubleMatch) {
          const matchResult = matchDoubleMatch(
            board.number!,
            drawResult,
            config.doubleMatchPrizes,
          );
          boardPayouts.push({
            boardNo: board.boardNo,
            playType: board.playType,
            matchCount: matchResult.matchCount,
            winAmount: matchResult.winAmount,
          });
        } else if (board.playType === Bingo18PlayType.TripleMatch) {
          const matchResult = matchTripleMatch(
            board.tripleKind as Bingo18TripleKind,
            board.number,
            drawResult,
            config.tripleMatchPrizes,
          );
          boardPayouts.push({
            boardNo: board.boardNo,
            playType: board.playType,
            matchCount: matchResult.isWin ? 3 : 0,
            winAmount: matchResult.winAmount,
          });
        }
      }

      const sideBetPayouts: Array<{
        playType: string;
        sum?: number;
        bet?: string;
        outcome: string;
        isWin: boolean;
        winAmount: number;
      }> = [];

      const sideBets = entry.entrySummary?.sideBets ?? [];
      for (const sb of sideBets) {
        if (sb.isVoid) continue;

        if (sb.playType === Bingo18PlayType.SumTotal) {
          const matchResult = matchSumTotal(
            sb.sum!,
            drawResult,
            config.sumTotalPrizes,
          );
          sideBetPayouts.push({
            playType: sb.playType,
            sum: sb.sum,
            outcome: matchResult.outcome,
            isWin: matchResult.isWin,
            winAmount: matchResult.winAmount,
          });
        } else if (sb.playType === Bingo18PlayType.BigSmallDraw) {
          const matchResult = matchBigSmallDraw(
            sb.bet as Bingo18BigSmallBet,
            drawResult,
            config.bigSmallDrawPrizes,
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
          numbers: result.numbers,
          sum: result.sum,
          publishedAt: now,
        }
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
