/**
 * Use Case: Settle Entries (Batch) — Max 3D Pro
 *
 * Xử lý entries theo batch trong vòng lặp time-bounded:
 *   load boards → expand pairs → match against draw result → persist lines → bulk settle entries.
 *
 * SETTLE FLOW (per batch):
 *   1. Query BATCH_SIZE entries with status = "scheduled"
 *   2. For each entry: expand pairs → match → build line docs → upsertLines
 *   3. Collect all settle ops → bulkSettleEntries() once per batch
 *   4. Loop until done or MAX_EXECUTION_MS exceeded
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query page 1 với filter status = "scheduled"
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - bulkSettleEntries() atomic: chỉ update nếu status = "scheduled" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "scheduled"
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PayoutStatus } from "@megawin/game-max3dpro/entities";
import type {
  TicketLineDoc,
  EntryBoardSnapshot,
  Triplet,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import {
  matchPair,
  type PairMatchResult,
} from "@megawin/game-max3dpro/rules/prize-tiers";
import { expandSelectionToPairs } from "@megawin/game-max3dpro/rules/play-types";
import type { PlayMode } from "@megawin/game-max3dpro/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { TicketRepository } from "../../infras/repos/ticket-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { Max3dProDrawResult as Max3dProDrawResultInput, Max3dProPrizeConfig } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchInput {
  drawId: string;
  result: Max3dProDrawResultInput;
  prizeConfig: Max3dProPrizeConfig;
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

  protected async execute(
    input: SettleEntriesBatchInput
  ): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeConfig } = input;
    const drawResult: Max3dproDrawResult = {
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

    const ticketCache = new Map<string, any>();
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(
        drawId,
        BATCH_SIZE
      );

      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();
      const settleOps: Array<{
        entryId: string;
        payout: {
          winAmount: number;
          payoutAmount: number;
          tiers: Array<{ tier: string; hitCount: number; unitAmount: number; amount: number }>;
          settledAt: Date;
          payoutStatus?: string;
        };
        outcome: string;
        result: {
          special: [string, string];
          first: [string, string, string, string];
          second: [string, string, string, string, string, string];
          third: [string, string, string, string, string, string, string, string];
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
          console.error(
            `Ticket ${ticketId} not found for entry ${entry.id}, skipping.`
          );
          continue;
        }

        const boards: EntryBoardSnapshot[] = entry.entrySummary.boards;
        const allLineDocs: Array<Omit<TicketLineDoc, "_id">> = [];
        let entryWinAmount = 0;
        let globalLineIndex = 0;

        const allPairResults: PairMatchResult[] = [];

        for (const board of boards) {
          if (board.isVoid) continue;

          const pairs = expandSelectionToPairs(
            board.playMode as PlayMode,
            {
              triplets: board.triplets,
              frontDigits: board.frontDigits,
              backDigits: board.backDigits,
            }
          );

          for (const pair of pairs) {
            const pairResult = matchPair(
              pair.first,
              pair.second,
              drawResult,
              prizeConfig.standard
            );

            allPairResults.push(pairResult);
            entryWinAmount += pairResult.winAmount;

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
              triplets: [pair.first, pair.second],
              matchResult: {
                tier: pairResult.tier,
                winAmount: pairResult.winAmount,
              },
              createdAt: now,
            });
            globalLineIndex++;
          }
        }

        if (allLineDocs.length > 0) {
          await this.lineRepo.upsertLines(allLineDocs);
        }

        const payoutTiers = buildPayoutTiers(allPairResults);
        const hasWin = entryWinAmount > 0;

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount: entryWinAmount,
            payoutAmount: entryWinAmount,
            tiers: payoutTiers,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          },
          outcome: hasWin ? "win" : "loss",
          result: {
            special: result.special as [string, string],
            first: result.first as [string, string, string, string],
            second: result.second as [string, string, string, string, string, string],
            third: result.third as [string, string, string, string, string, string, string, string],
            publishedAt: now,
          },
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

function buildPayoutTiers(pairResults: PairMatchResult[]): Array<{
  tier: string;
  hitCount: number;
  unitAmount: number;
  amount: number;
}> {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const pr of pairResults) {
    if (pr.tier && pr.winAmount > 0) {
      const existing = tierMap.get(pr.tier);
      if (existing) {
        existing.hitCount += 1;
        existing.totalAmount += pr.winAmount;
      } else {
        tierMap.set(pr.tier, { hitCount: 1, totalAmount: pr.winAmount });
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
