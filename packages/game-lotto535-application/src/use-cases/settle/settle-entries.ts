/**
 * Use Case: Settle Entries (Batch)
 *
 * Xử lý 1 batch entries: expand → match → payout → settle.
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "drawn"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - Nếu crash giữa batch: chạy lại sẽ pick up entries còn lại
 *   - settleEntry() atomic: chỉ update nếu status = "drawn" → no duplicate
 *   - done = true khi không còn entries nào status = "drawn"
 *
 * Accumulator chỉ dùng cho monitoring/logging, KHÔNG dùng để tính financials.
 * CalculateFinancials tính lại từ DB (crash-safe).
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-lotto535/entities";
import { expandAllBoards } from "@megawin/game-lotto535/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-lotto535/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";

export interface SettleEntriesBatchInput {
  drawId: string;
  result: { winningMain: number[]; winningSpecial: number };
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
  ticketsCompleted: number;
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
  private readonly ticketRepo = new TicketRepository();

  /** Settle 1 batch entries. Loop cho đến khi done = true. */
  protected async execute(input: SettleEntriesBatchInput): Promise<SettleEntriesBatchResult> {
  const { drawId, result, prizeAmounts, batchSize } = input;
  const drawResult: DrawResultForMatch = {
    winningMain: result.winningMain as any,
    winningSpecial: result.winningSpecial,
  };

  /**
   * QUAN TRỌNG: Luôn query page 1.
   * Entries đã settled (status != "drawn") tự filter ra.
   * Khi crash + restart, query vẫn đúng vì chỉ lấy "drawn".
   */
  const entries = await this.entryRepo.getDrawnEntriesBatch(drawId, 1, batchSize);

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
      console.error(`Ticket ${ticketId} not found for entry ${entry.id}, skipping.`);
      continue;
    }

    const lines = expandAllBoards(ticket.boards);
    const matchResult = matchLines(lines, drawResult);
    const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
    const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
    const hasWin = winAmount > 0;

    const settled = await this.entryRepo.settleEntry(entry.id, {
      winAmount,
      payoutAmount: winAmount,
      tiers: payoutTiers,
      settledAt: new Date(),
      payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
    });

    if (!settled) continue;

    const enrolledDrawIds: string[] = ticket.drawPlan?.enrolledDrawIds ?? [];
    const currentIndex = enrolledDrawIds.indexOf(drawId);
    const nextDrawId = currentIndex >= 0 && currentIndex < enrolledDrawIds.length - 1
      ? enrolledDrawIds[currentIndex + 1]!
      : null;
    const newSettledCount = (ticket.progress?.settledDraws ?? 0) + 1;
    const isCompleted =
      newSettledCount >= (ticket.progress?.totalDraws ?? ticket.drawPlan?.drawCount ?? 1)
      && (ticket.drawPlan?.fullyEnrolled ?? true);

    await this.ticketRepo.updateSettleProgress(ticketId, nextDrawId, isCompleted, winAmount);
    if (isCompleted) acc.ticketsCompleted++;

    acc.totalSettled++;
    acc.totalWinAmount += winAmount;
    acc.totalPayoutAmount += winAmount;
    batchSettled++;

    for (const [tier, count] of matchResult.tierCounts) {
      acc.tierWinnerCounts[tier] = (acc.tierWinnerCounts[tier] ?? 0) + count;
      if (tier !== PrizeTier.Jackpot) {
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
    ticketsCompleted: 0,
  };
}

function extractTicketId(ticketId: unknown): string {
  if (typeof ticketId === "string") return ticketId;
  if (ticketId && typeof (ticketId as any).toHexString === "function") {
    return (ticketId as any).toHexString();
  }
  return String(ticketId);
}

function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
): Array<{
  tier: string; hitCount: number; unitAmount: number; amount: number; isSplitBonus?: boolean;
}> {
  const tiers: Array<{
    tier: string; hitCount: number; unitAmount: number; amount: number; isSplitBonus?: boolean;
  }> = [];

  for (const [tier, hitCount] of tierCounts) {
    if (hitCount === 0) continue;

    if (tier === PrizeTier.Jackpot) {
      tiers.push({ tier, hitCount, unitAmount: 0, amount: 0, isSplitBonus: false });
      continue;
    }

    const unitAmount = prizeAmounts[tier] ?? 0;
    tiers.push({ tier, hitCount, unitAmount, amount: unitAmount * hitCount });
  }

  return tiers;
}
