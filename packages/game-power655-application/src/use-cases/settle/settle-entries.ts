/**
 * Use Case: Settle Entries (Batch) — Power 6/55
 *
 * Xử lý entries theo vòng lặp thời gian: expand → match → persist lines → bulk settle.
 *
 * Khác biệt so với Lotto 5/35:
 *   - expandAllBoards không có special number (Power 6/55 lines chỉ có main)
 *   - matchLines trả về tiers[] (có thể trúng jackpot1 hoặc jackpot2)
 *   - Tính payout cho fixed tiers (tier1/tier2/tier3) + mark jackpot1/jackpot2 wins
 *   - Line doc có bonusMatched thay vì specialMatched
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query status = "scheduled" với limit cố định (BATCH_SIZE)
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - bulkSettleEntries() atomic per batch: chỉ update nếu status = "scheduled" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "scheduled"
 *   - Time-bounded: thoát sau MAX_EXECUTION_MS nếu chưa xong
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-power655/entities";
import type { TicketLineDoc } from "@megawin/game-power655/entities";
import { expandAllBoards } from "@megawin/game-power655/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-power655/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { PowerDrawResult } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchInput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Kết quả quay số đã công bố. */
  result: PowerDrawResult;
  /** Giá trị giải thưởng cố định theo tier (VND). Key: tier1/tier2/tier3. */
  prizeAmounts: Record<string, number>;
  /** Có phải kỳ chia giải (split cycle) hay không. */
  isSplitCycle: boolean;
}

export interface SettleEntriesBatchResult {
  done: boolean;
}

/**
 * Settle entries Power 6/55 theo vòng lặp thời gian.
 * Expand boards → match lines (with bonus) → persist lines → bulk settle entries.
 */
export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly ticketRepo = new TicketRepository();
  private readonly lineRepo = new LineRepository();

  /** @inheritdoc */
  protected async execute(input: SettleEntriesBatchInput): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeAmounts } = input;
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
      bonusNumber: result.bonusNumber,
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
            matchCount: number;
            prizePerLine: number;
            totalPrize: number;
            isSplitBonus?: boolean;
          }>;
          settledAt: Date;
          payoutStatus?: PayoutStatus;
        };
        outcome: "win" | "loss";
        result: {
          winningMain: typeof result.winningMain;
          bonusNumber: typeof result.bonusNumber;
          publishedAt: Date;
        };
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
          const highestTier = perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
          const unitAmount = highestTier != null ? (prizeAmounts[highestTier] ?? 0) : 0;

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
              highestTier === PrizeTier.Jackpot1 || highestTier === PrizeTier.Jackpot2
                ? 0
                : unitAmount,
            createdAt: now,
          };
        });

        await this.lineRepo.upsertLines(lineDocs);

        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.totalPrize, 0);
        const hasWin = winAmount > 0 || hasJackpotTier(payoutTiers);

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
            bonusNumber: result.bonusNumber,
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

// ─── Helpers ───

function hasJackpotTier(tiers: Array<{ tier: string; matchCount: number }>): boolean {
  return tiers.some(
    (t) => (t.tier === PrizeTier.Jackpot1 || t.tier === PrizeTier.Jackpot2) && t.matchCount > 0,
  );
}

function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
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
