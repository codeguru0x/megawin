/**
 * Use Case: Settle Entries Batch (Bingo 18)
 *
 * Bước 2 trong settle pipeline: match từng board + side bet → tính payout → bulk write.
 *
 * CRASH-SAFE (idempotent batch loop):
 *   - Luôn query status = "scheduled" → entries đã settle sẽ không xuất hiện lại
 *   - bulkSettleEntries() dùng filter { status: "scheduled" } → atomic, safe khi retry
 *   - done = true khi không còn entries "scheduled" → Step Function kết thúc loop
 *   - MAX_EXECUTION_MS: tự dừng trước khi Lambda timeout, Step Function gọi lại
 *
 * Matching logic (5 hàm, tương ứng 5 cách chơi):
 *   Boards (cơ bản):
 *   - SingleNum:   matchSingleNum  → match0/1/2/3 lần → giải 0/12k/20k/30k
 *   - DoubleMatch: matchDoubleMatch → match ≥2 lần → 75k (1 mức giải)
 *   - TripleMatch: matchTripleMatch → specific 1.2tr / any 200k
 *   Side Bets (bổ sung):
 *   - SumTotal:     matchSumTotal    → khớp tổng chính xác → tra bảng 3-18
 *   - BigSmallDraw: matchBigSmallDraw → small(3-9)/draw(10-11)/big(12-18)
 *
 * KHÔNG có payout caps. KHÔNG có Jackpot.
 * KHÔNG update ticket trong step này — SyncTicketSummaries recompute từ entries.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import {
  Bingo18PlayType,
  type Bingo18BigSmallBet,
  type Bingo18TripleKind,
  PayoutStatus,
} from "@megawin/game-bingo18/entities";
import type {
  EntryPayout,
  EntryResult,
  EntryBoardPayout,
  EntrySideBetPayout,
} from "@megawin/game-bingo18/entities";
import {
  matchSingleNum,
  matchDoubleMatch,
  matchTripleMatch,
  matchSumTotal,
  matchBigSmallDraw,
  type DrawResultForMatch,
} from "@megawin/game-bingo18/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { sumBy } from "@megawin/shared/utils";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext } from "./types";

/** Số entries xử lý mỗi batch. Cân bằng giữa throughput và memory. */
const BATCH_SIZE = 500;

/** Thời gian tối đa chạy trong 1 Lambda invocation (ms). Dừng trước khi timeout. */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

/**
 * Kết quả trả về sau mỗi lần gọi SettleEntriesBatch.
 * Step Function dùng `done` để quyết định tiếp tục loop hay sang bước tiếp theo.
 */
export interface SettleEntriesBatchResult {
  /** true khi không còn entries status "scheduled" → kết thúc loop. */
  done: boolean;
}

/**
 * Settle từng batch entries Bingo 18: match cược → tính payout → bulk write.
 *
 * CRASH-SAFE: batch query luôn lấy status="scheduled" → retry an toàn.
 * Time-limited: tự trả `done: false` khi gần hết MAX_EXECUTION_MS.
 * 1 DB read (getScheduledEntries) + 1 DB write (bulkSettleEntries) mỗi vòng lặp.
 */
export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleContext,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result, config } = input;

    // Đóng gói kết quả quay vào DrawResultForMatch — dùng chung cho tất cả entries trong batch.
    const drawResult: DrawResultForMatch = {
      numbers: result.numbers,
      sum: result.sum,
    };

    const startTime = Date.now();

    // ── Batch loop ────────────────────────────────────────────────────────────
    // Mỗi vòng: query BATCH_SIZE entries "scheduled" → match → bulk write.
    // Khi hết entries → done = true. Khi gần timeout → done = false (SFN gọi lại).
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        // Không còn entries "scheduled" → settle hoàn tất cho kỳ này.
        return { done: true };
      }

      const now = new Date();
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: string;
        result: EntryResult;
      }> = [];

      // ── Tính payout cho từng entry ─────────────────────────────────────────
      for (const entry of entries) {
        // ── Bước 1: Match từng board cơ bản ────────────────────────────────
        // Bingo 18 có 3 loại board, mỗi loại dùng hàm match và bảng giải riêng.
        const boardPayouts: EntryBoardPayout[] = [];

        for (const board of entry.entrySummary.boards ?? []) {
          switch (board.playType) {
            case Bingo18PlayType.SingleNum: {
              // Đếm số lần xuất hiện → tra bảng match1/match2/match3.
              // board.number! an toàn: validate khi place-bet, singleNum luôn có number.
              const matchResult = matchSingleNum(board.number!, drawResult, config.singleNumPrizes);
              // winAmount = unitWinAmount × betCount — nhân multiplier sau khi có kết quả per-unit.
              const unitWinAmount = matchResult.winAmount;

              boardPayouts.push({
                boardNo: board.boardNo,
                playType: board.playType,
                matchCount: matchResult.matchCount,
                betCount: board.betCount,
                unitWinAmount,
                winAmount: unitWinAmount * board.betCount,
              });

              break;
            }
            case Bingo18PlayType.DoubleMatch: {
              // Thắng khi số xuất hiện ≥ 2 lần — 1 mức giải duy nhất (75.000đ).
              // board.number! an toàn: doubleMatch luôn có number.
              const matchResult = matchDoubleMatch(
                board.number!,
                drawResult,
                config.doubleMatchPrizes,
              );
              // winAmount = unitWinAmount × betCount — nhân multiplier sau khi có kết quả per-unit.
              const unitWinAmount = matchResult.winAmount;

              boardPayouts.push({
                boardNo: board.boardNo,
                playType: board.playType,
                matchCount: matchResult.matchCount,
                betCount: board.betCount,
                unitWinAmount,
                winAmount: unitWinAmount * board.betCount,
              });

              break;
            }
            case Bingo18PlayType.TripleMatch: {
              // Cả 3 số quay giống nhau. 2 loại: specific (1.2tr) và any (200k).
              // tripleKind lưu vào payout để aggregation settleSummary phân biệt 2 mức giải.
              const matchResult = matchTripleMatch(
                board.tripleKind as Bingo18TripleKind,
                board.number,
                drawResult,
                config.tripleMatchPrizes,
              );
              // winAmount = unitWinAmount × betCount — nhân multiplier sau khi có kết quả per-unit.
              const unitWinAmount = matchResult.winAmount;

              boardPayouts.push({
                boardNo: board.boardNo,
                playType: board.playType,
                tripleKind: board.tripleKind as Bingo18TripleKind,
                // matchCount: 3 khi thắng (cả 3 số trùng), 0 khi thua.
                matchCount: matchResult.isWin ? 3 : 0,
                betCount: board.betCount,
                unitWinAmount,
                winAmount: unitWinAmount * board.betCount,
              });

              break;
            }
          }
        }

        // ── Bước 2: Match từng side bet ────────────────────────────────────
        // Bingo 18 có 2 loại side bet: sumTotal và bigSmallDraw.
        const sideBetPayouts: EntrySideBetPayout[] = [];

        for (const sb of entry.entrySummary.sideBets ?? []) {
          switch (sb.playType) {
            case Bingo18PlayType.SumTotal: {
              // Khớp chính xác tổng 3 số. Giải đối xứng quanh 10.5 (3=18, 4=17, ...).
              // sb.sum! an toàn: sumTotal luôn có sum (validate khi place-bet).
              const matchResult = matchSumTotal(sb.sum!, drawResult, config.sumTotalPrizes);
              // winAmount = unitWinAmount × betCount — nhân multiplier sau khi có kết quả per-unit.
              const unitWinAmount = matchResult.winAmount;
              sideBetPayouts.push({
                playType: sb.playType,
                sum: sb.sum,
                outcome: matchResult.outcome,
                isWin: matchResult.isWin,
                betCount: sb.betCount,
                unitWinAmount,
                winAmount: unitWinAmount * sb.betCount,
              });
              break;
            }

            case Bingo18PlayType.BigSmallDraw: {
              // Phân loại tổng: small(3-9) / draw(10-11) / big(12-18).
              // sb.bet! an toàn: bigSmallDraw luôn có bet (validate khi place-bet).
              const matchResult = matchBigSmallDraw(
                sb.bet as Bingo18BigSmallBet,
                drawResult,
                config.bigSmallDrawPrizes,
              );
              // winAmount = unitWinAmount × betCount — nhân multiplier sau khi có kết quả per-unit.
              const unitWinAmount = matchResult.winAmount;

              sideBetPayouts.push({
                playType: sb.playType,
                bet: sb.bet,
                outcome: matchResult.outcome,
                isWin: matchResult.isWin,
                betCount: sb.betCount,
                unitWinAmount,
                winAmount: unitWinAmount * sb.betCount,
              });
              break;
            }
          }
        }

        // ── Bước 3: Tổng hợp payout entry ──────────────────────────────────
        // winAmount = Σ(boardPayouts) + Σ(sideBetPayouts).
        // Bingo 18 KHÔNG có payout caps → payoutAmount = winAmount trực tiếp.
        const winAmount =
          sumBy(boardPayouts, (b) => b.winAmount) + sumBy(sideBetPayouts, (s) => s.winAmount);

        const hasWin = winAmount > 0;

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            // Bingo 18 không có payout cap → payoutAmount = winAmount (trả đủ 100%).
            payoutAmount: winAmount,
            boardPayouts,
            sideBetPayouts,
            settledAt: now,
            // payoutStatus chỉ set khi có tiền thưởng → trigger dispatch payout workflow.
            // Entry thua (winAmount = 0) không cần dispatch → bỏ qua payoutStatus.
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          } satisfies EntryPayout,
          // outcome "win" / "loss" — Bingo 18 không có "partial_win" (không có payout cap).
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          // Copy kết quả kỳ quay vào entry — denormalized để truy vấn không cần join draw.
          result: {
            numbers: result.numbers,
            sum: result.sum,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      // ── Bước 4: Bulk write ─────────────────────────────────────────────────
      // Mỗi updateOne có filter { status: "scheduled" } → idempotent: entry đã settled
      // sẽ không bị overwrite nếu step này chạy lại do crash.
      await this.entryRepo.bulkSettleEntries(settleOps);
    }

    // Hết thời gian cho phép — trả done: false để Step Function gọi lại lần nữa.
    return { done: false };
  }
}
