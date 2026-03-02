/**
 * Use Case: Settle Entries (Batch) — Max 3D
 *
 * Xử lý 1 batch entries: load boards → match against draw result → persist lines → settle entry.
 *
 * SETTLE FLOW (per entry):
 *   1. Load ticket boards (from entrySummary snapshot)
 *   2. For each board: matchBoard() → get tier + winAmount + lineResults
 *   3. Build TicketLineDoc for each line
 *   4. lineRepo.upsertLines(lineDocs)     ← persist LINES trước (idempotent)
 *   5. Aggregate payout tiers from all boards
 *   6. entryRepo.settleEntry(payout)      ← persist ENTRY
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "scheduled"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - settleEntry() atomic: chỉ update nếu status = "scheduled" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "scheduled"
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PayoutStatus } from "@megawin/game-max3d/entities";
import type {
  TicketLineDoc,
  EntryBoardSnapshot,
  Max3dPrizeConfig,
  Triplet,
  BasicPrizeTier,
  PlusPrizeTier,
} from "@megawin/game-max3d/entities";
import type { Max3dDrawResult } from "@megawin/game-max3d/entities";
import {
  matchBoard,
  type BoardMatchResult,
} from "@megawin/game-max3d/rules/prize-tiers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";

export interface SettleEntriesBatchInput {
  /** ID kỳ quay cần settle. */
  drawId: string;
  /** Kết quả quay thưởng 20 bộ ba số. */
  result: {
    special: [string, string];
    first: [string, string, string, string];
    second: [string, string, string, string, string, string];
    third: [string, string, string, string, string, string, string, string];
  };
  /** Bảng giải thưởng áp dụng. */
  prizeConfig: Max3dPrizeConfig;
  /** Số entries xử lý mỗi batch. */
  batchSize: number;
}

export interface SettleAccumulator {
  /** Tổng entries đã settle trong batch. */
  totalSettled: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayoutAmount: number;
  /** Tổng tiền thắng (VND). */
  totalWinAmount: number;
  /** Đếm số người thắng theo từng tier. */
  tierWinnerCounts: Record<string, number>;
  /** Tổng giải thưởng cố định đã trả. */
  totalFixedPrizes: number;
}

export interface SettleEntriesBatchResult {
  /** true nếu đã hết entries cần settle. */
  done: boolean;
  /** Bộ tích lũy kết quả batch hiện tại. */
  accumulator: SettleAccumulator;
  /** Số entries đã settle trong batch này. */
  batchSettled: number;
}

export class SettleEntriesBatchUseCase extends StepFunctionUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(
    input: SettleEntriesBatchInput
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeConfig, batchSize } = input;
    const drawResult: Max3dDrawResult = {
      special: result.special as [Triplet, Triplet],
      first: result.first as [Triplet, Triplet, Triplet, Triplet],
      second: result.second as [
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
        Triplet,
      ],
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

    const entries = await this.entryRepo.getScheduledEntriesBatch(
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
    const ticketCache = new Map<string, any>();

    for (const entry of entries) {
      const ticketId = entry.ticketId;

      let ticket = ticketCache.get(ticketId);
      if (!ticket) {
        ticket = await this.ticketRepo.getTicketById(ticketId);
        if (ticket) ticketCache.set(ticketId, ticket);
      }
      if (!ticket) {
        console.error(
          `Ticket ${ticketId} not found for entry ${entry.id}, skipping.`
        );
        continue;
      }

      // ── Step 1-2: Match each board against draw result ──
      const boards: EntryBoardSnapshot[] = entry.entrySummary.boards;
      const boardResults: BoardMatchResult[] = [];
      const allLineDocs: Array<Omit<TicketLineDoc, "_id">> = [];
      const now = new Date();
      let entryWinAmount = 0;
      let globalLineIndex = 0;

      for (const board of boards) {
        if (board.isVoid) continue;

        const boardMatch = matchBoard(
          {
            boardNo: board.boardNo,
            playMode: board.playMode,
            playType: board.playType,
            triplets: board.triplets,
          },
          drawResult,
          prizeConfig
        );

        boardResults.push(boardMatch);
        entryWinAmount += boardMatch.winAmount;

        // ── Step 3: Build line docs ──
        for (const lineResult of boardMatch.lineResults) {
          allLineDocs.push({
            tenantId: ticket.tenantId,
            accountId: ticket.accountId,
            ticketId: String(ticket._id),
            entryId: String(entry._id),
            drawId: entry.drawId,
            drawDate: entry.drawDate,
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

      // ── Step 4: Persist LINES trước (idempotent) ──
      if (allLineDocs.length > 0) {
        await this.lineRepo.upsertLines(allLineDocs);
      }

      // ── Step 5: Build payout tiers ──
      const payoutTiers = buildPayoutTiers(boardResults);
      const hasWin = entryWinAmount > 0;

      // ── Step 6: Persist ENTRY ──
      const settled = await this.entryRepo.settleEntry(
        entry.id,
        {
          winAmount: entryWinAmount,
          payoutAmount: entryWinAmount,
          tiers: payoutTiers,
          settledAt: now,
          payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
        },
        hasWin ? "win" : "loss",
        {
          special: result.special as [string, string],
          first: result.first as [string, string, string, string],
          second: result.second as [string, string, string, string, string, string],
          third: result.third as [string, string, string, string, string, string, string, string],
          publishedAt: now,
        }
      );

      if (!settled) continue;

      // ── Accumulator (monitoring only) ──
      acc.totalSettled++;
      acc.totalWinAmount += entryWinAmount;
      acc.totalPayoutAmount += entryWinAmount;
      acc.totalFixedPrizes += entryWinAmount;
      batchSettled++;

      for (const br of boardResults) {
        if (br.tier) {
          acc.tierWinnerCounts[br.tier] =
            (acc.tierWinnerCounts[br.tier] ?? 0) + 1;
        }
      }
    }

    return {
      done: entries.length < batchSize,
      accumulator: acc,
      batchSettled,
    };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function emptyAccumulator(): SettleAccumulator {
  return {
    totalSettled: 0,
    totalPayoutAmount: 0,
    totalWinAmount: 0,
    tierWinnerCounts: {},
    totalFixedPrizes: 0,
  };
}


function buildPayoutTiers(boardResults: BoardMatchResult[]): Array<{
  tier: string;
  hitCount: number;
  unitAmount: number;
  amount: number;
}> {
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

  const tiers: Array<{
    tier: string;
    hitCount: number;
    unitAmount: number;
    amount: number;
  }> = [];

  for (const [tier, info] of tierMap) {
    tiers.push({
      tier,
      hitCount: info.hitCount,
      unitAmount:
        info.hitCount > 0 ? Math.round(info.totalAmount / info.hitCount) : 0,
      amount: info.totalAmount,
    });
  }

  return tiers;
}
