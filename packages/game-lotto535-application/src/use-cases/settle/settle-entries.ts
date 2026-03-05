/**
 * Use Case: Settle Entries (Batch) — Lotto 5/35
 *
 * Xử lý nhiều batch entries trong 1 Lambda: expand → match → persist lines → bulk settle.
 * Dừng sớm khi sắp hết thời gian Lambda.
 *
 * SETTLE FLOW (bottom-up, per entry):
 *   1. expandAllBoards(ticket.boards) → lines[]
 *   2. matchLines(lines, drawResult) → { tierCounts, perLineResults[] }
 *   3. Build line docs (gắn matchResult + ownership info)
 *   4. lineRepo.upsertLines(lineDocs)          ← persist LINES trước (idempotent)
 *   5. buildPayoutTiers(tierCounts) → winAmount
 *   6. Collect settle op into settleOps array
 *   7. entryRepo.bulkSettleEntries(settleOps)  ← persist ENTRIES (batch)
 *
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 *
 * CRASH-SAFE:
 *   - Luôn query status = "scheduled" → đã settle thì tự skip
 *   - bulkWrite atomic per entry: chỉ update nếu status = "scheduled"
 *   - done = true khi không còn entries "scheduled"
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-lotto535/entities";
import type { TicketLineDoc } from "@megawin/game-lotto535/entities";
import { expandAllBoards } from "@megawin/game-lotto535/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-lotto535/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { LottoDrawResult } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchInput {
  drawId: string;
  result: LottoDrawResult;
  prizeAmounts: Record<string, number>;
  isSplitCycle: boolean;
}

export interface SettleEntriesBatchResult {
  done: boolean;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleEntriesBatchInput): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeAmounts } = input;
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
      winningSpecial: result.winningSpecial,
    };

    const startTime = Date.now();
    const ticketCache = new Map<string, any>();

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
        result: {
          winningMain: typeof result.winningMain;
          winningSpecial: typeof result.winningSpecial;
          publishedAt: Date;
        };
      }> = [];

      for (const entry of entries) {
        const ticketId = entry.ticketId as string;

        let ticket = ticketCache.get(ticketId);
        if (!ticket) {
          ticket = await this.ticketRepo.getTicketById(ticketId);
          if (ticket) ticketCache.set(ticketId, ticket);
        }
        if (!ticket) {
          console.error(`Ticket ${ticketId} not found for entry ${entry.id}, skipping.`);
          continue;
        }

        // ── Step 1-2: Expand boards → lines, match trong 1 pass ──
        const lines = expandAllBoards(ticket.boards);
        const matchResult = matchLines(lines, drawResult);

        // ── Step 3: Build line docs với matchResult + ownership ──
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
            special: line.special,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              specialMatched: perLine.specialMatched,
              tier: perLine.tier,
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount,
            },
            createdAt: now,
          };
        });

        // ── Step 4: Persist LINES trước (idempotent) ──
        await this.lineRepo.upsertLines(lineDocs);

        // ── Step 5: Build payout tiers, tính winAmount ──
        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
        const hasWin = winAmount > 0;

        // ── Step 6: Collect settle op ──
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
            winningSpecial: result.winningSpecial,
            publishedAt: now,
          },
        });
      }

      await this.entryRepo.bulkSettleEntries(settleOps as any);
    }

    return { done: false };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

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
