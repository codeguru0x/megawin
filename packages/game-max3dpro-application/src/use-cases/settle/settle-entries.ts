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
 *
 * betCount DESIGN:
 *   - matchPair() giữ nguyên: trả PairMatchResult per-unit (1 lần cược).
 *   - betCount snapshot từ entry.entrySummary.boards[].betCount.
 *   - Settle layer nhân betCount vào TỪNG wonTier.winAmount (vì 1 pair có thể trúng nhiều giải).
 *   - lineDoc.winAmount = wonTier.winAmount × betCount (đã nhân betCount).
 *   - buildPayoutTiers() nhận adjusted pairResults (winAmount đã nhân betCount).
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PayoutStatus } from "@megawin/game-max3dpro/entities";
import { EntryOutcome } from "@megawin/game-core/entities";
import type {
  TicketLineDoc,
  EntryBoardSnapshot,
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
  Triplet,
  PrizeTier,
} from "@megawin/game-max3dpro/entities";
import type { Max3dproDrawResult } from "@megawin/game-max3dpro/entities";
import { matchPair, type PairMatchResult } from "@megawin/game-max3dpro/rules/prize-tiers";
import { expandSelectionToPairs } from "@megawin/game-max3dpro/rules/play-types";
import type { PlayMode } from "@megawin/game-max3dpro/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
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
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result: drawResult, prizeConfig } = input;

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
        const boards: EntryBoardSnapshot[] = entry.entrySummary.boards;
        const allLineDocs: Array<Omit<TicketLineDoc, "_id">> = [];
        let entryWinAmount = 0;
        let lineIndex = 0;

        // Adjusted pairResults để buildPayoutTiers gom đúng amount (đã nhân betCount).
        const adjustedPairResults: PairMatchResult[] = [];

        for (const board of boards) {
          // betCount = số lần cược nhân bội của board này (≥ 1).
          // matchPair() trả kết quả per-unit — nhân betCount ở settle layer để tách biệt concerns.
          const betCount = board.betCount ?? 1;

          const pairs = expandSelectionToPairs(board.playMode as PlayMode, {
            triplets: board.triplets,
            frontDigits: board.frontDigits,
            backDigits: board.backDigits,
          });

          for (const pair of pairs) {
            const pairResult = matchPair(pair.first, pair.second, drawResult, prizeConfig.standard);

            // entryWinAmount tích luỹ đã nhân betCount.
            entryWinAmount += pairResult.winAmount * betCount;

            // Adjusted pairResult: winAmount per wonTier đã nhân betCount.
            // buildPayoutTiers sẽ gom adjusted results → EntryPayoutTier[].amount đúng.
            adjustedPairResults.push({
              wonTiers: pairResult.wonTiers.map((wt) => ({
                tier: wt.tier,
                winAmount: wt.winAmount * betCount,
              })),
              winAmount: pairResult.winAmount * betCount,
              matchedTriplets: pairResult.matchedTriplets,
            });

            // Mỗi giải trúng tạo 1 lineDoc riêng → buildPayoutTiers đếm đúng hitCount.
            // lineDoc.winAmount đã nhân betCount — audit trail: winAmount = prizeConfig[tier] × betCount.
            if (pairResult.wonTiers.length === 0) {
              allLineDocs.push({
                tenantId: entry.tenantId,
                accountId: entry.accountId,
                username: entry.username,
                ticketId: entry.ticketId,
                entryId: entry.id,
                drawId: entry.drawId,
                financialDate: entry.financialDate,
                boardNo: board.boardNo,
                lineIndex: lineIndex,
                playMode: board.playMode,
                playType: board.playType,
                triplets: [pair.first, pair.second],
                betCount,
                matchResult: {
                  tier: null,
                  winAmount: 0,
                },
                createdAt: now,
              });
              lineIndex++;
            } else {
              for (const wt of pairResult.wonTiers) {
                allLineDocs.push({
                  tenantId: entry.tenantId,
                  accountId: entry.accountId,
                  username: entry.username,
                  ticketId: entry.ticketId,
                  entryId: entry.id,
                  drawId: entry.drawId,
                  financialDate: entry.financialDate,
                  boardNo: board.boardNo,
                  lineIndex: lineIndex,
                  playMode: board.playMode,
                  playType: board.playType,
                  triplets: [pair.first, pair.second],
                  betCount,
                  matchResult: {
                    tier: wt.tier,
                    // winAmount đã nhân betCount → lineDoc tự documenting: giải × betCount lần cược.
                    winAmount: wt.winAmount * betCount,
                  },
                  createdAt: now,
                });
                lineIndex++;
              }
            }
          }
        }

        if (allLineDocs.length > 0) {
          await this.lineRepo.upsertLines(allLineDocs);
        }

        // buildPayoutTiers nhận adjustedPairResults (winAmount đã nhân betCount).
        const payoutTiers = buildPayoutTiers(adjustedPairResults);
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
            special: drawResult.special,
            first: drawResult.first,
            second: drawResult.second,
            third: drawResult.third,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }

      // If the number of entries is less than BATCH_SIZE, return done: true
      if (entries.length < BATCH_SIZE) {
        return { done: true };
      }
    }

    return { done: false };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function buildPayoutTiers(pairResults: PairMatchResult[]): EntryPayoutTier[] {
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const pr of pairResults) {
    // Mỗi pairResult có thể trúng nhiều giải (wonTiers) — gộp giải.
    for (const wt of pr.wonTiers) {
      const existing = tierMap.get(wt.tier);
      if (existing) {
        existing.hitCount += 1;
        existing.totalAmount += wt.winAmount;
      } else {
        tierMap.set(wt.tier, { hitCount: 1, totalAmount: wt.winAmount });
      }
    }
  }

  const tiers: EntryPayoutTier[] = [];

  for (const [tier, info] of tierMap) {
    // unitAmount = totalAmount / hitCount — chỉ mang tính "trung bình hiển thị".
    // Khi các boards có betCount khác nhau (VD: boardA betCount=2, boardB betCount=3),
    // 2 pairs cùng trúng 1 hạng giải sẽ có winAmount khác nhau →
    // unitAmount = Math.round(trung bình) có thể lệch 1 VND so với tổng.
    // KHÔNG ảnh hưởng payout.winAmount (tính riêng từ entryWinAmount).
    // amount = info.totalAmount (chính xác tuyệt đối) — dùng để thanh toán.
    tiers.push({
      tier: tier as PrizeTier,
      hitCount: info.hitCount,
      unitAmount: info.hitCount > 0 ? Math.round(info.totalAmount / info.hitCount) : 0,
      amount: info.totalAmount,
    });
  }

  return tiers;
}
