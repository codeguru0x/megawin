/**
 * Use Case: Settle Entries (Batch) — Lotto 5/35
 *
 * Xử lý 1 batch entries: expand → match → persist lines → settle entry.
 *
 * SETTLE FLOW (bottom-up, per entry):
 *   1. expandAllBoards(ticket.boards) → lines[]
 *   2. matchLines(lines, drawResult) → { tierCounts, perLineResults[] }
 *   3. Build line docs (gắn matchResult + ownership info)
 *   4. lineRepo.upsertLines(lineDocs)          ← persist LINES trước (idempotent)
 *   5. buildPayoutTiers(tierCounts) → winAmount
 *   6. entryRepo.settleEntry(payout)           ← persist ENTRY
 *
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "drawn"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - Nếu crash giữa batch: chạy lại sẽ pick up entries còn lại
 *   - settleEntry() atomic: chỉ update nếu status = "drawn" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "drawn"
 *
 * Accumulator chỉ dùng cho monitoring/logging, KHÔNG dùng để tính financials.
 * CalculateFinancials tính lại từ DB (crash-safe).
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-lotto535/entities";
import type { TicketLineDoc } from "@megawin/game-lotto535/entities";
import { expandAllBoards } from "@megawin/game-lotto535/helpers";
import {
  matchLines,
  type DrawResultForMatch,
} from "@megawin/game-lotto535/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";

export interface SettleEntriesBatchInput {
  /** Mã kỳ quay cần settle. */
  drawId: string;
  /** Kết quả quay đã công bố. */
  result: {
    /** 5 số chính trúng thưởng. */
    winningMain: number[];
    /** Số đặc biệt trúng thưởng (1-12). */
    winningSpecial: number;
  };
  /** Bảng giải thưởng: key = tier name, value = số tiền (VND). */
  prizeAmounts: Record<string, number>;
  /** Kỳ này có phải kỳ chia Jackpot hay không. */
  isSplitCycle: boolean;
  /** Số entries xử lý mỗi batch. */
  batchSize: number;
}

export interface SettleAccumulator {
  /** Tổng entries đã settle trong batch này. */
  totalSettled: number;
  /** Tổng tiền trả thưởng (VND) — dùng cho monitoring, KHÔNG dùng tính financials. */
  totalPayoutAmount: number;
  /** Tổng tiền thắng (VND) — dùng cho monitoring. */
  totalWinAmount: number;
  /** Đếm số người trúng theo tier: key = tier name, value = số lượng. */
  tierWinnerCounts: Record<string, number>;
  /** Tổng giải cố định đã trả (VND) — không bao gồm Jackpot. */
  totalFixedPrizes: number;
}

export interface SettleEntriesBatchResult {
  /** true nếu đã settle hết tất cả entries (entries.length < batchSize). */
  done: boolean;
  /** Accumulator tổng hợp batch này (chỉ dùng monitoring/logging). */
  accumulator: SettleAccumulator;
  /** Số entries đã settle thành công trong batch này. */
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
      winningSpecial: result.winningSpecial,
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

      // ── Step 1-2: Expand boards → lines, match trong 1 pass ──
      const lines = expandAllBoards(ticket.boards);
      const matchResult = matchLines(lines, drawResult);

      // ── Step 3: Build line docs với matchResult + ownership ──
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
            special: line.special,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              specialMatched: perLine.specialMatched,
              tier: perLine.tier,
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount,
            },
            createdAt: now,
          };
        }
      );

      // ── Step 4: Persist LINES trước (idempotent) ──
      await this.lineRepo.upsertLines(lineDocs);

      // ── Step 5: Build payout tiers, tính winAmount ──
      const payoutTiers = buildPayoutTiers(
        matchResult.tierCounts,
        prizeAmounts
      );
      const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
      const hasWin = winAmount > 0;

      // ── Step 6: Persist ENTRY ──
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

      // ── Accumulator (monitoring only) ──
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
