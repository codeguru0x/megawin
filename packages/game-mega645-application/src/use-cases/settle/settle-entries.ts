/**
 * Use Case: Settle Entries (Batch) — Mega 6/45
 *
 * Xử lý entries trong vòng lặp while với time-bound MAX_EXECUTION_MS.
 * Mỗi iteration: query batch → expand → match → persist lines → collect settle ops → bulkSettle.
 * Mega 6/45 lines chỉ có main (không có special).
 *
 * CRASH-SAFE: Luôn query status = "scheduled" với limit cố định (BATCH_SIZE).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-mega645/entities";
import type { TicketLineDoc, MainTuple } from "@megawin/game-mega645/entities";
import { expandAllBoards } from "@megawin/game-mega645/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-mega645/helpers";
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
    const { drawId, result, prizeAmounts } = input;
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
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
        payout: {
          winAmount: number;
          payoutAmount: number;
          tiers: Array<{
            tier: string;
            hitCount: number;
            unitAmount: number;
            amount: number;
            isSplitBonus?: boolean;
          }>;
          settledAt: Date;
          payoutStatus?: string;
        };
        outcome: string;
        result: { winningMain: typeof result.winningMain; publishedAt: Date };
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

        const lines = expandAllBoards(ticket.boards);
        const matchResult = matchLines(lines, drawResult);

        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount = perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;

          return {
            tenantId: ticket.tenantId,
            accountId: ticket.accountId,
            username: ticket.username,
            ticketId: ticket._id,
            entryId: entry._id,
            drawId: entry.drawId,
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            main: line.main,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              tier: perLine.tier,
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount,
            },
            createdAt: now,
          };
        });

        await this.lineRepo.upsertLines(lineDocs);

        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
        const hasWin = winAmount > 0;

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            tiers: payoutTiers,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          },
          outcome: hasWin ? "win" : "loss",
          result: {
            winningMain: result.winningMain as any,
            publishedAt: now,
          },
        });
      }

      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps as any);
      }
    }

    return { done: false };
  }
}

function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
): Array<{
  tier: string;
  hitCount: number;
  unitAmount: number;
  amount: number;
  isSplitBonus?: boolean;
}> {
  const tiers: Array<{
    tier: string;
    hitCount: number;
    unitAmount: number;
    amount: number;
    isSplitBonus?: boolean;
  }> = [];

  for (const [tier, hitCount] of tierCounts) {
    if (hitCount === 0) continue;

    if (tier === PrizeTier.Jackpot) {
      tiers.push({
        tier,
        hitCount,
        unitAmount: 0,
        amount: 0,
        isSplitBonus: false,
      });
      continue;
    }

    const unitAmount = prizeAmounts[tier] ?? 0;
    tiers.push({ tier, hitCount, unitAmount, amount: unitAmount * hitCount });
  }

  return tiers;
}
