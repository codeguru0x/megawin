/**
 * Use Case: Settle Entries (Batch) — Max 3D
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 2 TRONG SETTLE FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Xử lý entries theo batch 500: load boards → match against draw result → persist lines → bulk settle entries.
 * Chạy trong vòng lặp time-bounded (10 phút) cho đến hết entries hoặc hết thời gian.
 *
 * SETTLE FLOW (per entry):
 *   1. Load ticket boards (from entrySummary snapshot)
 *   2. For each board: matchBoard() → get tier + winAmount + lineResults
 *   3. Build TicketLineDoc for each line
 *   4. lineRepo.upsertLines(lineDocs)     ← persist LINES trước (idempotent)
 *   5. Aggregate payout tiers from all boards
 *   6. Collect settle ops → bulkSettleEntries() cuối batch
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "scheduled"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - bulkSettleEntries() atomic per entry: chỉ update nếu status = "scheduled" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "scheduled"
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PayoutStatus } from "@megawin/game-max3d/entities";
import { EntryOutcome } from "@megawin/game-core/entities";
import type {
  TicketLineDoc,
  EntryBoardSnapshot,
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
} from "@megawin/game-max3d/entities";
import {
  matchBoard,
  flattenDrawResult,
  buildPayoutTiers,
  type BoardMatchResult,
} from "@megawin/game-max3d/rules/prize-tiers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchResult {
  done: boolean;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleContext,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result: drawResult, prizeConfig } = input;
    // Tính 1 lần — dùng chung cho tất cả entries/boards trong toàn bộ settle run.
    const flattenedResult = flattenDrawResult(drawResult);

    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();

      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: string;
        result: EntryResult;
      }> = [];

      for (const entry of entries) {
        const boards: EntryBoardSnapshot[] = entry.entrySummary.boards;
        const boardResults: BoardMatchResult[] = [];
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = [];

        let entryWinAmount = 0;
        let lineIndex = 0;

        // Loop through each board and match the board with the draw result
        for (const board of boards) {
          const boardMatch = matchBoard(
            {
              boardNo: board.boardNo,
              playMode: board.playMode,
              playType: board.playType,
              triplets: board.triplets,
            },
            flattenedResult,
            prizeConfig,
          );

          // betCount = số lần cược nhân bội — nhân vào winAmount.
          // matchBoard() trả kết quả per-unit (1 lần cược), nhân betCount ở đây.
          // Dùng ?? 1 để backward compat với entries cũ chưa có betCount field.
          const betCount = board.betCount ?? 1;

          boardResults.push(boardMatch);

          entryWinAmount += boardMatch.winAmount * betCount;

          for (const lineResult of boardMatch.lineResults) {
            // winAmount đã nhân betCount → lineDoc.matchResult.winAmount = tổng thực tế.
            // betCount lưu kèm để audit trail — giải thích tại sao winAmount > giá trị 1 unit.
            const effectiveWin = lineResult.winAmount * betCount;

            lineDocs.push({
              tenantId: entry.tenantId,
              accountId: entry.accountId,
              username: entry.username,
              ticketId: entry.ticketId,
              entryId: entry.id,
              drawId: entry.drawId,
              financialDate: entry.financialDate,
              boardNo: board.boardNo,
              lineIndex: lineIndex,
              playMode: board.playMode,
              playType: board.playType,
              triplets: lineResult.triplets,
              betCount,
              matchResult: {
                tier: lineResult.tier,
                winAmount: effectiveWin,
              },
              createdAt: now,
            });
            lineIndex++;
          }
        }

        if (lineDocs.length > 0) {
          await this.lineRepo.upsertLines(lineDocs);
        }

        // Tạo adjusted boardResults với winAmount đã nhân betCount trước khi truyền vào buildPayoutTiers.
        // buildPayoutTiers gom tiers dựa trên lineResults.winAmount — cần đã nhân betCount.
        // Dùng ?? 1 để backward compat với entries cũ chưa có betCount field.
        const adjustedResults: BoardMatchResult[] = boardResults.map((br, idx) => {
          const betCount = boards[idx]!.betCount ?? 1;
          return {
            ...br,
            winAmount: br.winAmount * betCount,
            lineResults: br.lineResults.map((lr) => ({
              ...lr,
              winAmount: lr.winAmount * betCount,
            })),
          };
        });

        const payoutTiers = buildPayoutTiers(adjustedResults);

        const hasWin = entryWinAmount > 0;

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount: entryWinAmount,
            payoutAmount: entryWinAmount,
            tiers: payoutTiers,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          } satisfies EntryPayout,
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            special: drawResult.special,
            first: drawResult.first,
            second: drawResult.second,
            third: drawResult.third,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }

      // If the number of entries is less than BATCH_SIZE, return done: true
      if (entries.length < BATCH_SIZE) {
        return { done: true };
      }
    }

    return { done: false };
  }
}
