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
 *   - Settle layer gán betCount vào PairMatchResultWithBetCount khi push vào mảng.
 *   - buildPayoutTiers() (từ prize-tiers) nhân betCount vào wonTier.winAmount khi tổng hợp.
 *   - lineDoc.winAmount = wonTier.winAmount × betCount (đã nhân betCount — audit trail).
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { EntryOutcome } from "@megawin/game-core/entities";
import type { EntryBoardSnapshot, EntryPayout, EntryResult, TicketLineDoc } from "@megawin/game-max3dpro/entities";
import { expandSelectionToPairs } from "@megawin/game-max3dpro/rules/play-types";
import {
  buildPayoutTiers,
  flattenDrawResult,
  matchPair,
  type PairMatchResultWithBetCount,
} from "@megawin/game-max3dpro/rules/prize-tiers";
import { generateId } from "@megawin/shared/utils";

import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";

const BATCH_SIZE = 500;
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchResult {
  done: boolean;
}

export class SettleEntriesBatchUseCase extends UseCase<SettleContext, SettleEntriesBatchResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result: drawResult, prizeConfig } = input;

    // Flatten 1 lần — tránh tạo Map + arrays mỗi lần gọi matchPair().
    // Settle loop chạy hàng trăm nghìn pairs → tiết kiệm allocation đáng kể.
    const flatDrawResult = flattenDrawResult(drawResult);

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
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = [];

        // pairResults mang betCount per pair (gán ở dưới).
        // buildPayoutTiers (từ prize-tiers) tự nhân betCount.
        const pairResults: PairMatchResultWithBetCount[] = [];

        let entryWinAmount = 0;
        let lineIndex = 0;

        for (const board of boards) {
          // Tạo danh sách các cặp triplets từ board selection.
          const pairs = expandSelectionToPairs(board.playMode, {
            triplets: board.triplets,
            frontDigits: board.frontDigits,
            backDigits: board.backDigits,
          });

          // betCount = số lần tham gia dự thưởng per board — player tự chọn.
          // matchPair() trả kết quả per-unit (1 lần cược).
          // Gán betCount vào PairMatchResultWithBetCount để buildPayoutTiers tự nhân khi tổng hợp tiers.
          // Dùng ?? 1 để backward compat với entries cũ chưa có betCount field.
          const betCount = board.betCount;

          for (const pair of pairs) {
            // So khớp cặp triplets với kết quả quay.
            const pairResult = matchPair(pair.first, pair.second, drawResult, prizeConfig.standard, flatDrawResult);

            // entryWinAmount tích luỹ đã nhân betCount — tổng thực tế player nhận.
            entryWinAmount += pairResult.winAmount * betCount;

            pairResults.push({ ...pairResult, betCount });

            // 1 lineDoc per pair (1 bet selection = 1 line).
            // Gộp giải: pair trúng nhiều tier → tiers[] chứa tất cả, winAmount = Σ(tiers[].winAmount).
            lineDocs.push({
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
                // Mỗi wonTier nhân betCount → winAmount thực tế per tier.
                tiers: pairResult.wonTiers.map((wt) => ({
                  tier: wt.tier,
                  winAmount: wt.winAmount * betCount,
                })),
                // winAmount root = tổng thực tế = pairResult.winAmount × betCount.
                winAmount: pairResult.winAmount * betCount,
              },
              createdAt: now,
            });
            lineIndex++;
          }
        }

        if (lineDocs.length > 0) {
          await this.lineRepo.upsertLines(lineDocs);
        }

        // pairResults đã mang betCount per pair (gán ở trên).
        // buildPayoutTiers tự nhân betCount → không cần tạo adjustedPairResults trung gian.
        const payoutTiers = buildPayoutTiers(pairResults);
        const hasWin = entryWinAmount > 0;

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount: entryWinAmount,
            payoutAmount: entryWinAmount,
            tiers: payoutTiers,
            settledAt: now,
            // UUIDv7 idempotency key — chỉ sinh khi entry thắng (cần dispatch payout cho tenant).
            // Entry thua không phát sinh giao dịch → không cần tx.
            payoutTx: hasWin ? generateId() : undefined,
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
