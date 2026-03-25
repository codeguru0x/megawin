/**
 * Use Case: Settle Entries (Batch) — Lotto 5/35
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 2 TRONG SETTLE FLOW (LOOP — gọi nhiều lần cho đến done=true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Xử lý nhiều batch entries trong 1 Lambda invocation:
 *   expand boards → match lines vs kết quả quay → persist lines → bulk settle entries.
 * Dừng sớm khi sắp hết thời gian Lambda (10 phút).
 *
 * ────────────────────────────────────────────────
 * SETTLE FLOW CHI TIẾT (bottom-up, per entry):
 * ────────────────────────────────────────────────
 *   1. expandAllBoards(entry.entrySummary.boards) → lines[]
 *      - Standard: 1 line = [5 main, 1 special]
 *      - MainCover4: chọn 4 số + 31 số còn lại → 31 lines
 *      - MainCover(6-15): C(N,5) tổ hợp chập 5 → nhiều lines
 *      - SpecialCover: 5 main × K special → K lines
 *
 *   2. matchLines(lines, drawResult) → { tierCounts, perLineResults[] }
 *      - Mỗi line: đếm main trùng (dùng Set), check special matched
 *      - determineTier(mainMatchCount, specialMatched):
 *        ┌──────────┬───────────────────────────────────────────────────┐
 *        │ Tier     │ Điều kiện                                        │
 *        ├──────────┼───────────────────────────────────────────────────┤
 *        │ jackpot  │ 5 main + special                                 │
 *        │ tier1    │ 5 main (không special)                           │
 *        │ tier2    │ 4 main + special                                 │
 *        │ tier3    │ 4 main (không special)                           │
 *        │ tier4    │ 3 main + special                                 │
 *        │ tier5    │ 3 main (không special)                           │
 *        │consolation│ special + ≤2 main (chỉ trúng số đặc biệt)     │
 *        │ (null)   │ không trúng gì                                   │
 *        └──────────┴───────────────────────────────────────────────────┘
 *
 *   3. Build line docs: gắn matchResult + ownership (từ entry.id)
 *
 *   4. lineRepo.upsertLines(lineDocs)
 *      Persist LINES trước (idempotent — unique index trên entryId+lineIndex)
 *
 *   5. buildPayoutTiers(tierCounts, prizeAmounts) → winAmount
 *      - Tính tiền thắng cho từng tier: unitAmount × hitCount
 *      - Jackpot tier: ghi hitCount nhưng amount = 0
 *        (tiền Jackpot sẽ được patch ở PatchJackpotPrize — step 4a)
 *
 *   6. Collect settle op → settleOps array
 *      - outcome: "win" hoặc "loss" (trúng jackpot → "win" dù amount tạm = 0)
 *      - payoutStatus: "pending" nếu thắng
 *
 *   7. entryRepo.bulkSettleEntries(settleOps)
 *      Persist ENTRIES (batch) — chỉ update nếu status = "scheduled" (atomic guard)
 *
 * KHÔNG update ticket ở step này — SyncTicketSummaries step riêng sẽ
 * recompute progress/totalWin từ entries.
 *
 * ────────────────────────────────────────────────
 * CRASH-SAFE:
 * ────────────────────────────────────────────────
 *   - Luôn query status = "scheduled" → entries đã settle thì tự skip
 *   - bulkWrite atomic per entry: chỉ update nếu status vẫn là "scheduled"
 *   - Lines upsert idempotent (unique index)
 *   - done = true khi không còn entries status="scheduled" trong kỳ
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { PrizeTier, PayoutStatus } from "@megawin/game-lotto535/entities";
import type {
  TicketLineDoc,
  EntryBoardSnapshot,
  EntryPayout,
  EntryResult,
  EntryPayoutTier,
  Board,
} from "@megawin/game-lotto535/entities";
import { expandAllBoards } from "@megawin/game-lotto535/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-lotto535/helpers";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";
import { EntryOutcome } from "@megawin/game-core/entities";

/** Số entries xử lý mỗi batch DB query. */
const BATCH_SIZE = 500;
/** Giới hạn thời gian chạy trong 1 Lambda invocation (10 phút). */
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
    const { drawId, result, prizeAmounts } = input;

    // DrawResultForMatch tương thích string[] trực tiếp — không cần cast.
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain,
      winningSpecial: result.winningSpecial,
    };

    const startTime = Date.now();

    // ── MAIN LOOP: xử lý batch-by-batch cho đến khi hết hoặc timeout ──
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      // Lấy batch entries có status = "scheduled" (chưa settle)
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      // Không còn entries → settle hoàn tất cho kỳ này
      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: EntryOutcome;
        result: EntryResult;
      }> = [];

      // ── Duyệt từng entry trong batch ──
      for (const entry of entries) {
        // Entry đã chứa đầy đủ boards snapshot → không cần load ticket
        const boards = toBoardsForExpand(entry.entrySummary.boards);

        // Build betCountByBoard map: boardNo → betCount (từ snapshot)
        // Dùng để nhân vào winAmount của từng line doc khi settle.
        const betCountByBoard = new Map<string, number>();
        for (const b of entry.entrySummary.boards) {
          betCountByBoard.set(b.boardNo, b.betCount);
        }

        // ── Step 1-2: Expand boards → lines, match với kết quả quay ──
        const lines = expandAllBoards(boards);
        const matchResult = matchLines(lines, drawResult);

        // ── Step 3: Build line docs với matchResult + ownership info từ entry ──
        // winAmount nhân betCount: 1 lần tham gia dự thưởng = unitAmount, betCount lần = unitAmount × betCount.
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount = perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;
          const betCount = betCountByBoard.get(line.boardNo) ?? 1;

          return {
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            username: entry.username,
            ticketId: entry.ticketId,
            entryId: entry.id,
            drawId: entry.drawId,
            financialDate: entry.financialDate,
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            main: line.main,
            special: line.special,
            betCount,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              specialMatched: perLine.specialMatched,
              tier: perLine.tier,
              // Jackpot: winAmount = 0 tạm thời, sẽ được patch ở PatchJackpotPrize (step 4a)
              // Giải cố định: winAmount = unitAmount × betCount (luật Vietlott: nhân số lần tham gia dự thưởng)
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount * betCount,
            },
            createdAt: now,
          };
        });

        // ── Step 4: Persist LINES trước (idempotent — upsert by unique index) ──
        // Lines phải persist TRƯỚC entries để đảm bảo nếu crash sau bước này,
        // lines đã có trong DB, entries vẫn ở "scheduled" → retry safe.
        await this.lineRepo.upsertLines(lineDocs);

        // ── Step 5: Build payout tiers từ lineDocs đã nhân betCount ──
        // Multi-board ticket có boards betCount khác nhau → không thể dùng flat tierCounts.
        // Aggregate từ lineDocs để có tổng amount đúng (đã nhân betCount per line).
        const payoutTiers = buildPayoutTiersFromLines(lineDocs, prizeAmounts);
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
        const hasJackpotHit = matchResult.tierCounts.has(PrizeTier.Jackpot);
        const hasWin = winAmount > 0 || hasJackpotHit;

        // ── Step 6: Collect settle operation ──
        // outcome = "win" khi winAmount > 0 (giải cố định) HOẶC trúng Jackpot (amount tạm = 0)
        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            tiers: payoutTiers,
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          } satisfies EntryPayout,
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            winningMain: result.winningMain,
            winningSpecial: result.winningSpecial,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      // ── Step 7: Bulk settle cả batch (atomic per entry) ──
      // bulkWrite chỉ update entry nếu status vẫn = "scheduled"
      // → nếu entry đã settle (do retry) thì tự skip, không ghi đè
      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }
    }

    // Lambda sắp timeout → trả done=false, Step Function sẽ gọi lại
    return { done: false };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Convert EntryBoardSnapshot[] (flat) → Board[] (nested selection)
 * cho expandAllBoards().
 */
function toBoardsForExpand(snapshots: EntryBoardSnapshot[]): Board[] {
  return snapshots.map((s) => ({
    boardNo: s.boardNo,
    playType: s.playType,
    selection: {
      mainNumbers: s.mainNumbers,
      specialNumbers: s.specialNumbers,
    },
    derived: { expandedLines: s.expandedLines },
    betCount: s.betCount,
  }));
}

/**
 * Build payout tiers từ line docs đã có winAmount (đã nhân betCount).
 *
 * Multi-board ticket: board A betCount=1, board B betCount=3 → mỗi line có betCount khác nhau,
 * không thể dùng flat tierCounts × betCount.
 * Aggregate: group by tier → sum winAmount → derive hitCount + unitAmount.
 *
 * LƯU Ý: hitCount = số LINES trúng (không nhân betCount).
 *         amount = tổng thưởng đã nhân betCount (từ lineDocs).
 */
function buildPayoutTiersFromLines(
  lineDocs: Array<Omit<TicketLineDoc, "_id">>,
  prizeAmounts: Record<string, number>,
): EntryPayoutTier[] {
  const tierMap = new Map<
    string,
    { hitCount: number; betUnitCount: number; totalAmount: number }
  >();

  for (const line of lineDocs) {
    const { tier, winAmount } = line.matchResult;
    if (tier == null) continue;

    const existing = tierMap.get(tier) ?? { hitCount: 0, betUnitCount: 0, totalAmount: 0 };
    existing.hitCount += 1;
    existing.betUnitCount += line.betCount;
    existing.totalAmount += winAmount;
    tierMap.set(tier, existing);
  }

  const tiers: EntryPayoutTier[] = [];
  for (const [tier, data] of tierMap) {
    if (tier === PrizeTier.Jackpot) {
      // Jackpot: amount = 0, patch sau ở PatchJackpotPrize (step 4a)
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        betUnitCount: data.betUnitCount,
        unitAmount: 0,
        amount: 0,
        isSplitBonus: false,
      });
    } else {
      const unitAmount = prizeAmounts[tier] ?? 0;
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        betUnitCount: data.betUnitCount,
        unitAmount,
        // amount đã nhân betCount từ lineDocs (tổng winAmount của tier này)
        amount: data.totalAmount,
      });
    }
  }

  return tiers;
}
