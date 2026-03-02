/**
 * Use Case: Settle Entries (Batch) — Mega 6/45
 *
 * Xử lý 1 batch entries: expand → match → persist lines → settle entry.
 * Mega 6/45 lines chỉ có main (không có special).
 *
 * CRASH-SAFE: Luôn query page 1 với filter status = "drawn".
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-mega645/entities";
import type { TicketLineDoc } from "@megawin/game-mega645/entities";
import { expandAllBoards } from "@megawin/game-mega645/helpers";
import {
  matchLines,
  type DrawResultForMatch,
} from "@megawin/game-mega645/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";

export interface SettleEntriesBatchInput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Kết quả quay thưởng. */
  result: {
    /** 6 số chính trúng thưởng (1-45). */
    winningMain: number[];
  };
  /** Bảng tiền thưởng theo hạng: key = tier, value = VND. */
  prizeAmounts: Record<string, number>;
  /** Kỳ này có split jackpot không — ảnh hưởng cách tính jackpot winner. */
  isSplitCycle: boolean;
  /** Số entry xử lý mỗi batch (page size). */
  batchSize: number;
}

export interface SettleAccumulator {
  /** Tổng số entry đã settle thành công trong batch. */
  totalSettled: number;
  /** Tổng tiền payout đã ghi nhận (VND) — giải cố định, chưa tính jackpot bonus. */
  totalPayoutAmount: number;
  /** Tổng tiền thắng (VND) — bao gồm tất cả hạng giải cố định. */
  totalWinAmount: number;
  /** Đếm số người trúng từng hạng: key = tier (e.g. "tier2"), value = số lượng. */
  tierWinnerCounts: Record<string, number>;
  /** Tổng tiền giải cố định (VND) — tier2 + tier3 + tier4, không bao gồm jackpot. */
  totalFixedPrizes: number;
}

export interface SettleEntriesBatchResult {
  /** true nếu đã xử lý hết tất cả entry (batch cuối cùng). */
  done: boolean;
  /** Bộ tích luỹ kết quả cho batch này. */
  accumulator: SettleAccumulator;
  /** Số entry settle thành công trong batch hiện tại. */
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
    const { drawId, result, prizeAmounts, batchSize } = input;
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as any,
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

      const lines = expandAllBoards(ticket.boards);
      const matchResult = matchLines(lines, drawResult);

      const now = new Date();
      const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map(
        (line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount =
            perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;

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
        }
      );

      await this.lineRepo.upsertLines(lineDocs);

      const payoutTiers = buildPayoutTiers(
        matchResult.tierCounts,
        prizeAmounts
      );
      const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
      const hasWin = winAmount > 0;

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

function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>
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
