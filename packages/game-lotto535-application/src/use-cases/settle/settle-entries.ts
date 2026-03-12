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
 *      - Standard/QuickPick: 1 line = [5 main, 1 special]
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

        // ── Step 1-2: Expand boards → lines, match với kết quả quay ──
        const lines = expandAllBoards(boards);
        const matchResult = matchLines(lines, drawResult);

        // ── Step 3: Build line docs với matchResult + ownership info từ entry ──
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const unitAmount = perLine.tier != null ? (prizeAmounts[perLine.tier] ?? 0) : 0;

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
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              specialMatched: perLine.specialMatched,
              tier: perLine.tier,
              // Jackpot: winAmount = 0 tạm thời, sẽ được patch ở PatchJackpotPrize (step 4a)
              winAmount: perLine.tier === PrizeTier.Jackpot ? 0 : unitAmount,
            },
            createdAt: now,
          };
        });

        // ── Step 4: Persist LINES trước (idempotent — upsert by unique index) ──
        // Lines phải persist TRƯỚC entries để đảm bảo nếu crash sau bước này,
        // lines đã có trong DB, entries vẫn ở "scheduled" → retry safe.
        await this.lineRepo.upsertLines(lineDocs);

        // ── Step 5: Build payout tiers, tính tổng tiền thắng ──
        // Jackpot: amount = 0, chỉ ghi nhận hitCount (patch tiền ở PatchJackpotPrize — step 4a)
        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
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
  }));
}

/**
 * Chuyển tierCounts (Map<PrizeTier, hitCount>) → mảng payout tier objects.
 *
 * - Skip tier có hitCount = 0
 * - Jackpot: ghi nhận hitCount nhưng amount = 0
 *   (tiền JP patch ở PatchJackpotPrize — step 4a)
 * - Giải cố định: amount = unitAmount × hitCount
 */
function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
): EntryPayoutTier[] {
  const tiers: EntryPayoutTier[] = [];

  for (const [tier, hitCount] of tierCounts) {
    if (hitCount === 0) continue;

    // Jackpot: ghi nhận hitCount, amount = 0 (patch ở PatchJackpotPrize — step 4a)
    if (tier === PrizeTier.Jackpot) {
      tiers.push({
        tier: tier as PrizeTier,
        hitCount,
        unitAmount: 0,
        amount: 0,
        isSplitBonus: false,
      });
      continue;
    }

    // Giải cố định: lấy unitAmount từ prizeAmounts config
    const unitAmount = prizeAmounts[tier] ?? 0;
    tiers.push({ tier: tier as PrizeTier, hitCount, unitAmount, amount: unitAmount * hitCount });
  }

  return tiers;
}
