/**
 * Use Case: Settle Entries (Batch) — Power 6/55
 *
 * Xử lý entries theo vòng lặp thời gian: expand → match → persist lines → bulk settle.
 *
 * Pipeline cho mỗi entry:
 *   1. Expand boards → lines (Bao 5 = 50 lines, C(N,6) nếu Bao 7-18, 1 nếu Standard/QuickPick)
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
import type {
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
  PrizeAmounts,
  TicketLineDoc,
} from "@megawin/game-power655/entities";
import { expandAllBoards } from "@megawin/game-power655/helpers";
import { matchLines, type DrawResultForMatch } from "@megawin/game-power655/helpers";
import { EntryOutcome } from "@megawin/game-core/entities";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import type { SettleContext } from "./types";

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

  protected async execute(input: SettleContext): Promise<SettleEntriesBatchResult> {
    const { drawId, result, fixedPrizeAmounts } = input;

    // ── Bước 1: Chuẩn bị draw result cho match engine ────────────────
    // Power 6/55: cần cả winningMain (6 số) + bonusNumber (1 số từ 49 còn lại)
    const drawResult: DrawResultForMatch = {
      winningMain: result.winningMain,
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
      // Dùng named entity types EntryPayout + EntryResult từ @megawin/game-power655/entities
      // → compiler bắt lỗi ngay khi entity thêm/đổi field, không cần `as any`.
      const settleOps: Array<{
        entryId: string;
        payout: EntryPayout;
        outcome: EntryOutcome;
        result: EntryResult;
      }> = [];

      for (const entry of entries) {
        // ── Bước 4: Expand boards → lines ──────────────────────────────
        // Entry đã có snapshot boards trong entrySummary (denormalized lúc place-bet).
        // KHÔNG cần fetch ticket — entry.entrySummary.boards đủ để expand.
        // Standard/QuickPick: 1 board → 1 line
        // Bao 5: 1 board → 50 lines (55 - 5 = 50, ghép từng số còn lại)
        // Bao N (7-18): 1 board → C(N,6) lines (VD: Bao 7 → 7 lines)
        const lines = expandAllBoards(entry.entrySummary.boards);

        // ── Bước 5: Match lines vs kết quả quay ───────────────────────
        // Mỗi line match độc lập: countMainMatches (0-6) + checkBonusMatch.
        // Tier: 6/6 → JP1, 5/6+bonus → JP2, 5/6 → tier1, 4/6 → tier2, 3/6 → tier3.
        const matchResult = matchLines(lines, drawResult);

        // ── Bước 5a: Tạo line documents để persist ─────────────────────
        // Mỗi line 1 doc: main numbers + matchResult (count, bonus, tier, winAmount).
        // Jackpot lines: winAmount = 0 (FinalizeSettle tính sau khi biết pool + winners).
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const highestTier = perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
          // Giải cố định: lấy từ fixedPrizeAmounts config.
          // JP1/JP2 → 0 (FinalizeSettle tính sau); tier1/2/3 → từ config.
          const winAmount =
            highestTier === PrizeTier.Jackpot1 || highestTier === PrizeTier.Jackpot2
              ? 0
              : getFixedPrizeAmount(highestTier, fixedPrizeAmounts);

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
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              bonusMatched: perLine.bonusMatched,
              tier: highestTier,
              // JP1/JP2: winAmount = 0 tại đây. FinalizeSettle chia pool cho winners.
              winAmount,
            },
            createdAt: now,
          };
        });

        // upsertLines dùng bulkWrite + $setOnInsert → idempotent khi retry
        await this.lineRepo.upsertLines(lineDocs);

        // ── Bước 6: Tính payout cho entry ──────────────────────────────
        // Chỉ tính giải cố định (tier1/tier2/tier3).
        // JP1/JP2: hitCount > 0 nhưng amount = 0. hasWin = true nếu có JP line.
        const payoutTiers = buildPayoutTiers(matchResult.tierCounts, fixedPrizeAmounts);
        // winAmount = tổng giải cố định. JP winAmount = 0 ở đây.
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
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
            settledAt: now,
            payoutStatus: hasWin ? PayoutStatus.Pending : undefined,
          } satisfies EntryPayout,
          outcome: hasWin ? EntryOutcome.Win : EntryOutcome.Loss,
          result: {
            winningMain: result.winningMain,
            bonusNumber: result.bonusNumber,
            publishedAt: now,
          } satisfies EntryResult,
        });
      }

      // ── Bước 7: Bulk update entries trong DB ─────────────────────────
      // bulkSettleEntries(): atomic per batch, chỉ update nếu status = "scheduled".
      // Crash-safe: retry sẽ bỏ qua entries đã settled.
      if (settleOps.length > 0) {
        await this.entryRepo.bulkSettleEntries(settleOps);
      }
    }

    // Chưa xong trong MAX_EXECUTION_MS → Step Function gọi lại
    return { done: false };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Trả về giá trị giải cố định cho tier. JP1/JP2 → 0 (xử lý bởi FinalizeSettle).
 *
 * Tách hàm riêng để tránh dùng `as keyof` cast không an toàn tại call-site.
 */
function getFixedPrizeAmount(tier: PrizeTier | null, prizeAmounts: PrizeAmounts): number {
  if (tier === PrizeTier.Tier1) return prizeAmounts.tier1;
  if (tier === PrizeTier.Tier2) return prizeAmounts.tier2;
  if (tier === PrizeTier.Tier3) return prizeAmounts.tier3;
  // JP1/JP2: giải tích luỹ — FinalizeSettle tính sau khi biết pool + số winners.
  return 0;
}

/**
 * Tạo danh sách payout tiers từ kết quả match.
 *
 * Giải cố định: amount = unitAmount × hitCount
 *   - tier1 (5/6 no bonus): 40.000.000đ × lines
 *   - tier2 (4/6):           500.000đ × lines
 *   - tier3 (3/6):            50.000đ × lines
 *
 * JP1 (6/6) và JP2 (5/6 + bonus): unitAmount = 0, amount = 0.
 * FinalizeSettle sẽ tính số tiền Jackpot sau khi biết pool và số winners.
 *
 * @param tierCounts - Map<PrizeTier, hitCount> từ matchLines()
 * @param fixedPrizeAmounts - Bảng giải cố định từ config: { tier1: 40000000, tier2: 500000, tier3: 50000 }
 */
function buildPayoutTiers(
  tierCounts: Map<PrizeTier, number>,
  fixedPrizeAmounts: PrizeAmounts,
): EntryPayoutTier[] {
  const tiers: EntryPayoutTier[] = [];

  for (const [tier, matchCount] of tierCounts) {
    if (matchCount === 0) continue;

    // JP1 / JP2: unitAmount = 0 vì giá trị phụ thuộc pool + số winners.
    // FinalizeSettle sẽ tính chính xác sau.
    if (tier === PrizeTier.Jackpot1 || tier === PrizeTier.Jackpot2) {
      tiers.push({
        tier,
        hitCount: matchCount,
        unitAmount: 0,
        amount: 0,
      });
      continue;
    }

    // Giải cố định: amount = unitAmount × hitCount
    // Tại đây tier chắc chắn là tier1/tier2/tier3 (jackpot1/2 đã continue ở trên).
    const unitAmount = getFixedPrizeAmount(tier, fixedPrizeAmounts);
    tiers.push({
      tier,
      hitCount: matchCount,
      unitAmount,
      amount: unitAmount * matchCount,
    });
  }

  return tiers;
}
