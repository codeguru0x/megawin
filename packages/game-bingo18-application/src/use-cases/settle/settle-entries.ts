/**
 * Use Case: Settle Entries Batch (Bingo 18)
 *
 * Xử lý entries: match boards + side bets → payout → bulk settle.
 *
 * CRASH-SAFE:
 *   - Luôn query status = "scheduled" với limit cố định (BATCH_SIZE)
 *   - bulkSettleEntries() atomic: chỉ update nếu status = "scheduled"
 *   - done = true khi không còn entries "scheduled"
 *   - Time-limited: tự dừng sau MAX_EXECUTION_MS để tránh Lambda timeout
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
import type { SettleContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchResult {
  /** true khi không còn entries status "scheduled" → kết thúc loop. */
  done: boolean;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleContext,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(
    input: SettleContext
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config } = input;
    const drawResult: DrawResultForMatch = {
      numbers: result.numbers,
      sum: result.sum,
    };

    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(
        drawId,
        BATCH_SIZE
      );

      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();
      const settleOps: Array<{
        entryId: string;
        payout: {
          winAmount: number;
          payoutAmount: number;
          boardPayouts: Array<{
            boardNo: string;
            playType: string;
            matchCount: number;
            winAmount: number;
          }>;
          sideBetPayouts: Array<{
            playType: string;
            sum?: number;
            bet?: string;
            outcome: string;
            isWin: boolean;
            winAmount: number;
          }>;
          settledAt: Date;
          payoutStatus?: string;
        };
        outcome: string;
        result: {
          numbers: number[];
          sum: number;
          publishedAt: Date;
        };
      }> = [];

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

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            boardPayouts,
            sideBetPayouts,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          },
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            numbers: result.numbers,
            sum: result.sum,
            publishedAt: now,
          },
        });
      }

      await this.entryRepo.bulkSettleEntries(settleOps);
    }

    return { done: false };
  }
}
