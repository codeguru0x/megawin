/**
 * Use Case: Settle Entries Batch (Keno)
 *
 * Step 2 trong Settle Step Function.
 * Xử lý nhiều batch entries trong 1 Lambda: match boards + side bets → bulk settle.
 * Dừng sớm khi sắp hết thời gian Lambda (MAX_EXECUTION_MS).
 *
 * FLOW:
 *   1. Lấy batch entries status = "scheduled"
 *   2. Mỗi entry: match từng board cơ bản + từng side bet với kết quả quay
 *   3. Tính winAmount = Σ(boardPayouts) + Σ(sideBetPayouts)
 *   4. Gắn flag hasCappablePrize nếu có board trúng top prize bậc 8/9/10
 *      (phục vụ step ApplyPayoutCaps query nhanh — xem chi tiết bên dưới)
 *   5. Bulk write: scheduled → settled + ghi payout + result
 *
 * LƯU Ý VỀ PAYOUT CAPS (giới hạn trả thưởng bậc 8/9/10):
 *   Step này chưa áp dụng cap — chỉ ghi giải thưởng cố định từ bảng giải.
 *   Lý do: cap cần biết TỔNG số bộ trúng top prize trong toàn draw,
 *   nhưng step này xử lý theo batch → không biết tổng cho đến khi xong.
 *   Step ApplyPayoutCaps (chạy sau) sẽ đếm tổng bộ trúng,
 *   nếu vượt ngưỡng cấu hình → tính lại giải = maxPerDraw / winnerCount.
 *
 *   Flag hasCappablePrize = true được gắn lúc settle để ApplyPayoutCaps
 *   có thể query bằng index thay vì $unwind toàn bộ entries.
 *
 * CRASH-SAFE:
 *   - Luôn query status = "scheduled" → đã settle thì tự skip
 *   - bulkWrite atomic per entry: chỉ update nếu status = "scheduled"
 *   - done = true khi không còn entries "scheduled"
 *
 * KHÔNG update ticket — SyncTicketSummaries step riêng sẽ recompute từ entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  type KenoBigSmallBet,
  type KenoEvenOddBet,
  KenoPlayType,
  PayoutStatus,
  CAPPABLE_PICK_COUNTS,
} from "@megawin/game-keno/entities";
import { matchBasicBoard, matchBigSmallBet, matchEvenOddBet } from "@megawin/game-keno/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { KenoDrawResult, KenoSettleConfig } from "./types";

/** Số entries xử lý mỗi lần query DB. */
const BATCH_SIZE = 500;

/** Thời gian tối đa cho 1 lần invoke Lambda (10 phút, chừa buffer cho Lambda 15 phút). */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

/**
 * Input cho SettleEntriesBatch.
 * Nhận từ step function qua $settleCtx (output của PrepareSettle).
 */
export interface SettleEntriesBatchInput {
  /** ID kỳ quay đang settle. */
  drawId: string;
  /** Kết quả quay: 20 số trúng + thống kê lớn/nhỏ/chẵn/lẻ. */
  result: KenoDrawResult;
  /**
   * Config giải thưởng từ GlobalConfig:
   * - basicPrizes: bảng giải cách chơi cơ bản (pick1–pick10)
   * - bigSmallPrizes: bảng giải side bet Lớn/Nhỏ
   * - evenOddPrizes: bảng giải side bet Chẵn/Lẻ
   *
   * Lưu ý: payoutCaps KHÔNG nằm ở đây — được xử lý ở step ApplyPayoutCaps riêng.
   */
  config: Pick<KenoSettleConfig, "basicPrizes" | "bigSmallPrizes" | "evenOddPrizes">;
}

/**
 * Output cho SettleEntriesBatch.
 * Step function dùng done để quyết định loop hay chuyển step tiếp.
 */
export interface SettleEntriesBatchResult {
  /** true = không còn entries "scheduled" → chuyển sang ApplyPayoutCaps. */
  done: boolean;
}

export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleEntriesBatchInput,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: SettleEntriesBatchInput): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config } = input;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();
      const settleOps: Array<{
        entryId: string;
        /** true khi entry có board trúng top prize bậc 8/9/10 (dùng cho ApplyPayoutCaps). */
        hasCappablePrize: boolean;
        payout: {
          winAmount: number;
          payoutAmount: number;
          boardPayouts: Array<{
            boardNo: string;
            playType: string;
            matchCount: number;
            pickCount: number;
            winAmount: number;
          }>;
          sideBetPayouts: Array<{
            playType: string;
            bet: string;
            outcome: string;
            isWin: boolean;
            winAmount: number;
          }>;
          settledAt: Date;
          payoutStatus?: string;
        };
        outcome: string;
        result: {
          winningNumbers: number[];
          publishedAt: Date;
          bigCount: number;
          smallCount: number;
          evenCount: number;
          oddCount: number;
        };
      }> = [];

      for (const entry of entries) {
        // ── Match từng board cách chơi cơ bản ──
        const boardPayouts: Array<{
          boardNo: string;
          playType: string;
          matchCount: number;
          pickCount: number;
          winAmount: number;
        }> = [];

        /**
         * Flag đánh dấu entry có ít nhất 1 board trúng top prize ở bậc 8/9/10.
         *
         * Điều kiện: pickCount ∈ {8,9,10} VÀ matchCount === pickCount (trùng tất cả).
         * Ví dụ: pick8 chọn 8 số, trùng 8/8 → hasCappablePrize = true.
         *
         * Mục đích: ApplyPayoutCaps step sau đó chỉ cần query
         * { hasCappablePrize: true } thay vì $unwind + $expr trên toàn bộ entries.
         *
         * Giải thưởng cố định (200tr/800tr/2tỷ) được ghi bình thường ở bước này.
         * ApplyPayoutCaps sẽ kiểm tra tổng bộ trúng: nếu vượt ngưỡng → chia đều.
         */
        let hasCappablePrize = false;

        const boards = entry.entrySummary?.boards ?? [];

        for (const board of boards) {
          // Tra bảng giải thưởng theo loại chơi (pick1–pick10)
          const playTypePrizes = config.basicPrizes[board.playType];
          const pickCount = board.numbers.length;
          const prizeTable = playTypePrizes ? { [pickCount]: playTypePrizes } : undefined;

          // So sánh số người chơi với 20 số quay → matchCount + winAmount
          const matchResult = matchBasicBoard(board.numbers, result, prizeTable);
          boardPayouts.push({
            boardNo: board.boardNo,
            playType: board.playType,
            matchCount: matchResult.matchCount,
            pickCount: matchResult.pickCount,
            winAmount: matchResult.winAmount,
          });

          // Gắn flag nếu board trúng top prize ở bậc cần cap (8/9/10)
          if (
            CAPPABLE_PICK_COUNTS.has(matchResult.pickCount) &&
            matchResult.matchCount === matchResult.pickCount
          ) {
            hasCappablePrize = true;
          }
        }

        // ── Match từng side bet (Lớn/Nhỏ, Chẵn/Lẻ) ──
        const sideBetPayouts: Array<{
          playType: string;
          bet: string;
          outcome: string;
          isWin: boolean;
          winAmount: number;
        }> = [];

        const sideBets = entry.entrySummary?.sideBets ?? [];

        for (const sb of sideBets) {
          if (sb.playType === KenoPlayType.BigSmall) {
            const matchResult = matchBigSmallBet(
              sb.bet as KenoBigSmallBet,
              result,
              config.bigSmallPrizes,
            );
            sideBetPayouts.push({
              playType: sb.playType,
              bet: sb.bet,
              outcome: matchResult.outcome,
              isWin: matchResult.isWin,
              winAmount: matchResult.winAmount,
            });
          } else if (sb.playType === KenoPlayType.EvenOdd) {
            const matchResult = matchEvenOddBet(
              sb.bet as KenoEvenOddBet,
              result,
              config.evenOddPrizes,
            );
            sideBetPayouts.push({
              playType: sb.playType,
              bet: sb.bet,
              outcome: matchResult.outcome,
              isWin: matchResult.isWin,
              winAmount: matchResult.winAmount,
            });
          }
        }

        // ── Tổng hợp tiền thắng cho entry ──
        // Lưu ý: winAmount ở đây là giải CỐ ĐỊNH theo bảng giải.
        // Nếu bậc 8/9/10 có quá nhiều bộ trúng, ApplyPayoutCaps step
        // sẽ tính lại winAmount = maxPerDraw / winnerCount.
        const winAmount =
          boardPayouts.reduce((sum, b) => sum + b.winAmount, 0) +
          sideBetPayouts.reduce((sum, s) => sum + s.winAmount, 0);
        const hasWin = winAmount > 0;

        settleOps.push({
          entryId: entry.id,
          hasCappablePrize,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            boardPayouts,
            sideBetPayouts,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          },
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            winningNumbers: result.winningNumbers,
            publishedAt: now,
            bigCount: result.bigCount,
            smallCount: result.smallCount,
            evenCount: result.evenCount,
            oddCount: result.oddCount,
          },
        });
      }

      await this.entryRepo.bulkSettleEntries(settleOps);
    }

    return { done: false };
  }
}
