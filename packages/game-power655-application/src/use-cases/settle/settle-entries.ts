/**
 * Use Case: Settle Entries (Batch) — Power 6/55
 *
 * Xử lý 1 batch entries: expand → match → persist lines → settle entry.
 *
 * Khác biệt so với Lotto 5/35:
 *   - expandAllBoards không có special number (Power 6/55 lines chỉ có main)
 *   - matchLines trả về tiers[] (có thể trúng jackpot1 hoặc jackpot2)
 *   - Tính payout cho fixed tiers (tier1/tier2/tier3) + mark jackpot1/jackpot2 wins
 *   - Line doc có bonusMatched thay vì specialMatched
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "drawn"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - settleEntry() atomic: chỉ update nếu status = "drawn" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "drawn"
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-power655/entities";
import type { TicketLineDoc } from "@megawin/game-power655/entities";
import { expandAllBoards } from "@megawin/game-power655/helpers";
import {
  matchLines,
  type DrawResultForMatch,
} from "@megawin/game-power655/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";

export interface SettleEntriesBatchInput {
  drawId: string;
  result: { winningMain: number[]; bonusNumber: number };
  prizeAmounts: Record<string, number>;
  isSplitCycle: boolean;
  batchSize: number;
}

export interface SettleAccumulator {
  totalSettled: number;
  totalPayoutAmount: number;
  totalWinAmount: number;
  tierWinnerCounts: Record<string, number>;
  totalFixedPrizes: number;
}

export interface SettleEntriesBatchResult {
  done: boolean;
  accumulator: SettleAccumulator;
  batchSettled: number;
}

/**
 * Settle 1 batch entries Power 6/55.
 * Expand boards → match lines (with bonus) → persist lines → settle entry.
 */
export class SettleEntriesBatchUseCase extends StepFunctionUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly lineRepo = new LineRepository();

  /** @inheritdoc */
  protected async execute(
    input: SettleEntriesBatchInput
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeAmounts, batchSize } = input;
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
      bonusNumber: result.bonusNumber,
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
    const ticketCache = new Map<string, any>();

    for (const entry of entries) {
      const ticketId = extractTicketId(entry.ticketId);

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

      // Step 1-2: Expand boards → lines, match with bonus number
      const lines = expandAllBoards(ticket.boards);
      const matchResult = matchLines(lines, drawResult);

      // Step 3: Build line docs with matchResult + ownership
      const now = new Date();
      const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map(
        (line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const highestTier =
            perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
          const unitAmount =
            highestTier != null ? (prizeAmounts[highestTier] ?? 0) : 0;

          return {
            tenantId: ticket.tenantId,
            accountId: ticket.accountId,
            ticketId: ticket.id,
            entryId: entry.id,
            drawId: entry.drawId,
            drawDate: entry.drawDate,
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            main: line.main,
            mainMatchCount: perLine.mainMatchCount,
            bonusMatched: perLine.bonusMatched,
            tier: highestTier,
            prizeAmount:
              highestTier === PrizeTier.Jackpot1 ||
              highestTier === PrizeTier.Jackpot2
                ? 0
                : unitAmount,
            createdAt: now,
          };
        }
      );

      // Step 4: Persist LINES (idempotent)
      await this.lineRepo.upsertLines(lineDocs);

      // Step 5: Build payout tiers, tính winAmount
      const payoutTiers = buildPayoutTiers(
        matchResult.tierCounts,
        prizeAmounts
      );
      const winAmount = payoutTiers.reduce((sum, t) => sum + t.totalPrize, 0);
      const hasWin = winAmount > 0 || hasJackpotTier(payoutTiers);

      // Step 6: Persist ENTRY
      const settled = await this.entryRepo.settleEntry(
        entry.id,
        {
          winAmount,
          payoutAmount: winAmount,
          tiers: payoutTiers,
          settledAt: now,
          payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
        },
        hasWin ? "win" : "loss"
      );

      if (!settled) continue;

      // Accumulator (monitoring only)
      acc.totalSettled++;
      acc.totalWinAmount += winAmount;
      acc.totalPayoutAmount += winAmount;
      batchSettled++;

      for (const [tier, count] of matchResult.tierCounts) {
        acc.tierWinnerCounts[tier] = (acc.tierWinnerCounts[tier] ?? 0) + count;
        if (tier !== PrizeTier.Jackpot1 && tier !== PrizeTier.Jackpot2) {
          acc.totalFixedPrizes += (prizeAmounts[tier] ?? 0) * count;
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

// ─── Helpers ───

function emptyAccumulator(): SettleAccumulator {
  return {
    totalSettled: 0,
    totalPayoutAmount: 0,
    totalWinAmount: 0,
    tierWinnerCounts: {},
    totalFixedPrizes: 0,
  };
}

function extractTicketId(ticketId: unknown): string {
  if (typeof ticketId === "string") return ticketId;
  if (ticketId && typeof (ticketId as any).toHexString === "function") {
    return (ticketId as any).toHexString();
  }
  return String(ticketId);
}

function hasJackpotTier(
  tiers: Array<{ tier: string; matchCount: number }>
): boolean {
  return tiers.some(
    (t) =>
      (t.tier === PrizeTier.Jackpot1 || t.tier === PrizeTier.Jackpot2) &&
      t.matchCount > 0
  );
}

function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>
): Array<{
  tier: string;
  matchCount: number;
  prizePerLine: number;
  totalPrize: number;
  isSplitBonus?: boolean;
}> {
  const tiers: Array<{
    tier: string;
    matchCount: number;
    prizePerLine: number;
    totalPrize: number;
    isSplitBonus?: boolean;
  }> = [];

  for (const [tier, matchCount] of tierCounts) {
    if (matchCount === 0) continue;

    if (tier === PrizeTier.Jackpot1 || tier === PrizeTier.Jackpot2) {
      tiers.push({
        tier,
        matchCount,
        prizePerLine: 0,
        totalPrize: 0,
        isSplitBonus: false,
      });
      continue;
    }

    const prizePerLine = prizeAmounts[tier] ?? 0;
    tiers.push({
      tier,
      matchCount,
      prizePerLine,
      totalPrize: prizePerLine * matchCount,
    });
  }

  return tiers;
}
