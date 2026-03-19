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
  Max3dPrizeConfig,
  Triplet,
  BasicPrizeTier,
  PlusPrizeTier,
} from "@megawin/game-max3d/entities";
import type { Max3dDrawResult as EntityDrawResult } from "@megawin/game-max3d/entities";
import { matchBoard, type BoardMatchResult } from "@megawin/game-max3d/rules/prize-tiers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
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
  private readonly ticketRepo = new TicketRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeConfig } = input;
    const drawResult: EntityDrawResult = {
      special: result.special as [Triplet, Triplet],
      first: result.first as [Triplet, Triplet, Triplet, Triplet],
      second: result.second as [Triplet, Triplet, Triplet, Triplet, Triplet, Triplet],
      third: result.third as [
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
      ],
    };

    const ticketCache = new Map<string, any>();
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
        const ticketId = entry.ticketId;

        let ticket = ticketCache.get(ticketId);
        if (!ticket) {
          ticket = await this.ticketRepo.getTicketById(ticketId);
          if (ticket) ticketCache.set(ticketId, ticket);
        }
        if (!ticket) {
          console.error(`Ticket ${ticketId} not found for entry ${entry.id}, skipping.`);
          continue;
        }

        const boards: EntryBoardSnapshot[] = entry.entrySummary.boards;
        const boardResults: BoardMatchResult[] = [];
        const allLineDocs: Array<Omit<TicketLineDoc, "_id">> = [];
        let entryWinAmount = 0;
        let globalLineIndex = 0;

        for (const board of boards) {
          const boardMatch = matchBoard(
            {
              boardNo: board.boardNo,
              playMode: board.playMode,
              playType: board.playType,
              triplets: board.triplets,
            },
            drawResult,
            prizeConfig,
          );

          boardResults.push(boardMatch);
          entryWinAmount += boardMatch.winAmount;

          for (const lineResult of boardMatch.lineResults) {
            allLineDocs.push({
              tenantId: entry.tenantId,
              accountId: entry.accountId,
              username: entry.username,
              ticketId: entry.ticketId,
              entryId: entry.id,
              drawId: entry.drawId,
              financialDate: entry.financialDate,
              boardNo: board.boardNo,
              lineIndex: globalLineIndex,
              playMode: board.playMode,
              playType: board.playType,
              triplets: lineResult.triplets,
              matchResult: {
                tier: lineResult.tier,
                winAmount: lineResult.winAmount,
              },
              createdAt: now,
            });
            globalLineIndex++;
          }
        }

        if (allLineDocs.length > 0) {
          await this.lineRepo.upsertLines(allLineDocs);
        }

        const payoutTiers = buildPayoutTiers(boardResults);
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
            special: result.special,
            first: result.first,
            second: result.second,
            third: result.third,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }
    }

    return { done: false };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildPayoutTiers(boardResults: BoardMatchResult[]): EntryPayoutTier[] {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const br of boardResults) {
    for (const line of br.lineResults) {
      if (line.tier && line.winAmount > 0) {
        const existing = tierMap.get(line.tier);
        if (existing) {
          existing.hitCount += 1;
          existing.totalAmount += line.winAmount;
        } else {
          tierMap.set(line.tier, { hitCount: 1, totalAmount: line.winAmount });
        }
      }
    }
  }

  const tiers: EntryPayoutTier[] = [];

  for (const [tier, info] of tierMap) {
    tiers.push({
      tier: tier as BasicPrizeTier | PlusPrizeTier,
      hitCount: info.hitCount,
      unitAmount: info.hitCount > 0 ? Math.round(info.totalAmount / info.hitCount) : 0,
      amount: info.totalAmount,
    });
  }

  return tiers;
}
