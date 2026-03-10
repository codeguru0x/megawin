/**
 * Use Case: Settle Entries (Batch) — Power 6/55
 *
 * Xử lý entries theo vòng lặp thời gian: expand → match → persist lines → bulk settle.
 *
 * Pipeline cho mỗi entry:
 *   1. Expand boards → lines (C(N,6) nếu Bao, 1 nếu Standard/QuickPick)
 *   2. Match lines vs draw result (6 số chính + bonus number)
 *   3. Persist lines vào DB (upsertLines — idempotent)
 *   4. Tính payout: giải cố định (tier1/tier2/tier3), Jackpot = 0 ở bước này
 *   5. Gom settleOps → bulkSettleEntries cuối mỗi batch
 *
 * Power 6/55 khác biệt:
 *   - matchLines trả về tiers[] + bonusMatched (JP1: 6/6, JP2: 5/6 + bonus)
 *   - Jackpot 1 và Jackpot 2: winAmount = 0 tại đây, FinalizeSettle điền sau
 *     khi biết chính xác pool và số winners. Không thể tính trước vì chia đều.
 *   - Entry đã snapshot boards từ ticket gốc → KHÔNG cần join ticket document
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
import type { EntryPayout, EntryPayoutTier, TicketLineDoc } from "@megawin/game-power655/entities";
import { expandAllBoards } from "@megawin/game-power655/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-power655/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext, PowerDrawResult } from "./types";

/** Số entries xử lý mỗi batch. */
const BATCH_SIZE = 500;
/** Thời gian tối đa cho 1 lần invoke (10 phút). Step Function sẽ gọi lại nếu chưa xong. */
const MAX_EXECUTION_MS = 10 * 60 * 1000;

export interface SettleEntriesBatchResult {
  done: boolean;
}

/**
 * Settle entries Power 6/55 theo vòng lặp thời gian.
 *
 * Entry đã có snapshot boards (denormalized từ ticket lúc place-bet) →
 * expand trực tiếp từ entry.boards, KHÔNG cần fetch ticket document.
 */
export class SettleEntriesBatchUseCase extends InternalUseCase<
  SettleContext,
  SettleEntriesBatchResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();

  /** @inheritdoc */
  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result, prizeAmounts } = input;

    // ── Bước 1: Chuẩn bị draw result cho match engine ────────────────
    // Power 6/55: cần cả winningMain (6 số) + bonusNumber (1 số từ 49 còn lại)
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain as unknown as [
        string,
        string,
        string,
        string,
        string,
        string,
      ],
      bonusNumber: result.bonusNumber,
    };

    const startTime = Date.now();

    // ── Bước 2: Vòng lặp chính — settle theo batch ──────────────────
    // Mỗi vòng: query entries scheduled → expand → match → persist → settle
    // Thoát khi: hết entries HOẶC vượt MAX_EXECUTION_MS
    while (Date.now() - startTime < MAX_EXECUTION_MS) {
      const entries = await this.entryRepo.getScheduledEntries(drawId, BATCH_SIZE);

      if (entries.length === 0) {
        return { done: true };
      }

      const now = new Date();

      // ── Bước 3: Gom kết quả settle cho batch ────────────────────────
      // Dùng entity types từ @megawin/game-power655/entities — type safe,
      // đồng bộ với DB schema.
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: string;
        result: {
          winningMain: typeof result.winningMain;
          bonusNumber: typeof result.bonusNumber;
          publishedAt: Date;
        };
      }> = [];

      for (const entry of entries) {
        // ── Bước 4: Expand boards → lines ──────────────────────────────
        // Entry đã có snapshot boards từ ticket gốc (denormalized lúc place-bet).
        // KHÔNG cần fetch ticket — entry.boards đã đủ để expand.
        // Standard/QuickPick: 1 board → 1 line
        // Bao N: 1 board → C(N,6) lines (VD: Bao 7 → 7 lines)
        const lines = expandAllBoards(entry.boards);

        // ── Bước 5: Match lines vs kết quả quay ───────────────────────
        // Mỗi line match độc lập: countMainMatches (0-6) + checkBonusMatch.
        // Tier: 6/6 → JP1, 5/6+bonus → JP2, 5/6 → tier1, 4/6 → tier2, 3/6 → tier3.
        const matchResult = matchLines(lines, drawResult);

        // ── Bước 5a: Tạo line documents để persist ─────────────────────
        // Mỗi line 1 doc: main numbers, matchCount, bonusMatched, tier, prizeAmount.
        // Jackpot lines: prizeAmount = 0 (FinalizeSettle tính sau khi biết pool + winners).
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const highestTier = perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
          // Giải cố định: lấy từ prizeAmounts config. JP1/JP2: prizePerLine = 0.
          const unitAmount = highestTier != null ? (prizeAmounts[highestTier] ?? 0) : 0;

          return {
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            ticketId: entry.ticketId,
            entryId: entry.id,
            drawId: entry.drawId,
            drawDate: entry.drawDate,
            boardNo: line.boardNo,
            lineIndex: line.lineIndex,
            main: line.main,
            mainMatchCount: perLine.mainMatchCount,
            bonusMatched: perLine.bonusMatched,
            tier: highestTier,
            // JP1 / JP2: prizeAmount = 0 tại đây. FinalizeSettle chia pool cho winners.
            prizeAmount:
              highestTier === PrizeTier.Jackpot1 || highestTier === PrizeTier.Jackpot2
                ? 0
                : unitAmount,
            createdAt: now,
          };
        });

        // upsertLines dùng bulkWrite + $setOnInsert → idempotent khi retry
        await this.lineRepo.upsertLines(lineDocs);

        // ── Bước 6: Tính payout cho entry ──────────────────────────────
        // Chỉ tính giải cố định (tier1/tier2/tier3).
        // JP1/JP2: matchCount > 0 nhưng totalPrize = 0. hasWin = true nếu có JP line.
        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, prizeAmounts);
        // winAmount = tổng giải cố định. JP winAmount = 0 ở đây.
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.totalPrize, 0);
        // Entry win nếu có giải cố định HOẶC trúng JP1/JP2 (dù winAmount = 0 lúc này).
        // tierCounts chỉ chứa tier có count > 0 → .has() đủ, O(1) Map lookup.
        const hasWin =
          winAmount > 0 ||
          matchResult.tierCounts.has(PrizeTier.Jackpot1) ||
          matchResult.tierCounts.has(PrizeTier.Jackpot2);

        settleOps.push({
          entryId: entry.id,
          payout: {
            winAmount,
            payoutAmount: winAmount,
            tiers: payoutTiers,
            payoutStatus: hasWin ? PayoutStatus.Pending : (undefined as any),
            retryCount: 0,
          } satisfies EntryPayout,
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            winningMain: result.winningMain as unknown as [
              string,
              string,
              string,
              string,
              string,
              string,
            ],
            bonusNumber: result.bonusNumber,
            publishedAt: now,
          },
        });
      }

      // ── Bước 7: Bulk update entries trong DB ─────────────────────────
      // bulkSettleEntries(): atomic per batch, chỉ update nếu status = "scheduled".
      // Crash-safe: retry sẽ bỏ qua entries đã settled.
      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps as any);
      }
    }

    // Chưa xong trong MAX_EXECUTION_MS → Step Function gọi lại
    return { done: false };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Tạo danh sách payout tiers từ kết quả match.
 *
 * Giải cố định: totalPrize = prizePerLine × matchCount
 *   - tier1 (5/6 no bonus): 40.000.000đ × lines
 *   - tier2 (4/6):           500.000đ × lines
 *   - tier3 (3/6):            50.000đ × lines
 *
 * JP1 (6/6) và JP2 (5/6 + bonus): prizePerLine = 0, totalPrize = 0.
 * FinalizeSettle sẽ tính số tiền Jackpot sau khi biết pool và số winners.
 *
 * @param tierCounts - Map<tier, matchCount> từ matchLines()
 * @param prizeAmounts - Bảng giải cố định từ config: { tier1: 40000000, tier2: 500000, tier3: 50000 }
 */
function buildPayoutTiers(
  tierCounts: Map<string, number>,
  prizeAmounts: Record<string, number>,
): EntryPayoutTier[] {
  const tiers: EntryPayoutTier[] = [];

  for (const [tier, matchCount] of tierCounts) {
    if (matchCount === 0) continue;

    // JP1 / JP2: prizePerLine = 0 vì giá trị phụ thuộc pool + số winners.
    // FinalizeSettle sẽ tính chính xác sau.
    if (tier === PrizeTier.Jackpot1 || tier === PrizeTier.Jackpot2) {
      tiers.push({
        tier: tier as PrizeTier,
        matchCount,
        prizePerLine: 0,
        totalPrize: 0,
      });
      continue;
    }

    // Giải cố định: totalPrize = prizePerLine × matchCount
    const prizePerLine = prizeAmounts[tier] ?? 0;
    tiers.push({
      tier: tier as PrizeTier,
      matchCount,
      prizePerLine,
      totalPrize: prizePerLine * matchCount,
    });
  }

  return tiers;
}
