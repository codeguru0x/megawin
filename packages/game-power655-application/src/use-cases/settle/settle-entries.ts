/**
 * Use Case: Settle Entries (Batch) — Power 6/55
 *
 * Xử lý entries theo vòng lặp thời gian: expand → match → persist lines → bulk settle.
 *
 * Pipeline cho mỗi entry:
 *   1. Expand boards → lines (Bao 5 = 50 lines, C(N,6) nếu Bao 7-18, 1 nếu Standard)
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
 * betCount multiplier:
 *   - Mỗi board có betCount = số lần tham gia dự thưởng (≥ 1).
 *   - line.winAmount = unitWinAmount × betCount (đúng luật Vietlott).
 *   - line.betCount snapshot để PatchJackpotPrize tính chia Jackpot theo tỷ lệ.
 *   - buildPayoutTiersFromLines() aggregate từ lineDocs thay vì tierCounts đơn giản.
 *
 * CRASH-SAFE DESIGN:
 *   - Luôn query status = "scheduled" với limit cố định (BATCH_SIZE)
 *   - Entries đã settled tự filter ra → không cần track page offset
 *   - bulkSettleEntries() atomic per batch: chỉ update nếu status = "scheduled" → no duplicate
 *   - upsertLines() dùng bulkWrite + $setOnInsert → idempotent khi retry
 *   - done = true khi không còn entries nào status = "scheduled"
 *   - Time-bounded: thoát sau MAX_EXECUTION_MS nếu chưa xong
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { EntryOutcome } from "@megawin/game-core/entities";
import type {
  EntryPayout,
  EntryPayoutTier,
  EntryResult,
  PrizeAmounts,
  TicketLineDoc,
} from "@megawin/game-power655/entities";
import { PrizeTier } from "@megawin/game-power655/entities";
import { type DrawResultForMatch, expandAllBoards, matchLines } from "@megawin/game-power655/helpers";
import { generateId } from "@megawin/shared/utils";

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
 *
 * betCount: mỗi board có betCount multiplier → winAmount = unitAmount × betCount.
 * JP1/JP2: winAmount = 0 tại đây, PatchJackpotPrize tính sau khi biết pool + winners.
 */
export class SettleEntriesBatchUseCase extends UseCase<SettleContext, SettleEntriesBatchResult> {
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
        // Standard: 1 board → 1 line
        // Bao 5: 1 board → 50 lines (55 - 5 = 50, ghép từng số còn lại)
        // Bao N (7-18): 1 board → C(N,6) lines (VD: Bao 7 → 7 lines)
        const lines = expandAllBoards(entry.entrySummary.boards);

        // ── Bước 5: Match lines vs kết quả quay ───────────────────────
        // Mỗi line match độc lập: countMainMatches (0-6) + checkBonusMatch.
        // Tier: 6/6 → JP1, 5/6+bonus → JP2, 5/6 → tier1, 4/6 → tier2, 3/6 → tier3.
        const matchResult = matchLines(lines, drawResult);

        // ── Bước 5a: Build betCount map từ entry snapshot ──────────────
        // Dùng để nhân betCount vào winAmount cho mỗi line.
        const betCountByBoard = new Map<string, number>();
        for (const b of entry.entrySummary.boards) {
          betCountByBoard.set(b.boardNo, b.betCount);
        }

        // ── Bước 5b: Tạo line documents để persist ─────────────────────
        // Mỗi line 1 doc: main numbers + matchResult (count, bonus, tier, winAmount).
        //
        // QUAN TRỌNG — winAmount theo luật Vietlott:
        //   "Giá trị lĩnh thưởng = số lần tham gia dự thưởng × giá trị giải tương ứng 1 lần"
        //   → winAmount = unitWinAmount × betCount
        //
        // Jackpot (JP1/JP2): winAmount = 0 tạm thời.
        //   PatchJackpotPrize tính chính xác sau khi biết pool + tổng betCount winners.
        //   Chia theo tỷ lệ giá trị tham gia: jackpotPerUnit × betCount (không phải chia đều).
        const lineDocs: Array<Omit<TicketLineDoc, "_id">> = lines.map((line, i) => {
          const perLine = matchResult.perLineResults[i]!;
          const highestTier = perLine.tiers.length > 0 ? perLine.tiers[0]! : null;
          // Giải cố định: lấy từ fixedPrizeAmounts config (unitWinAmount).
          // JP1/JP2 → 0 (PatchJackpotPrize tính sau); tier1/2/3 → từ config.
          const unitAmount = getFixedPrizeAmount(highestTier, fixedPrizeAmounts);
          const betCount = betCountByBoard.get(line.boardNo)!;

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
            betCount,
            matchResult: {
              mainMatchCount: perLine.mainMatchCount,
              bonusMatched: perLine.bonusMatched,
              tier: highestTier,
              // JP1/JP2: winAmount = 0 tại đây. PatchJackpotPrize chia pool cho winners.
              // Giải cố định: winAmount = unitAmount × betCount (theo luật Vietlott).
              winAmount:
                highestTier === PrizeTier.Jackpot1 || highestTier === PrizeTier.Jackpot2 ? 0 : unitAmount * betCount,
            },
            createdAt: now,
          };
        });

        // upsertLines dùng bulkWrite + $setOnInsert → idempotent khi retry
        await this.lineRepo.upsertLines(lineDocs);

        // ── Bước 6: Tính payout cho entry ──────────────────────────────
        // Dùng buildPayoutTiersFromLines thay vì buildPayoutTiers(tierCounts) đơn giản.
        // Lý do: multi-board ticket có boards với betCount khác nhau → không thể dùng
        // flat tierCounts × 1 betCount. Cần aggregate từ lineDocs đã nhân betCount riêng.
        //
        // JP1/JP2: hitCount > 0 nhưng amount = 0. hasWin = true nếu có JP line.
        const payoutTiers = buildPayoutTiersFromLines(lineDocs, fixedPrizeAmounts);
        // winAmount = tổng giải cố định. JP winAmount = 0 ở đây.
        const winAmount = payoutTiers.reduce((sum, t) => sum + t.amount, 0);
        // Entry win nếu có giải cố định HOẶC trúng JP1/JP2 (dù winAmount = 0 lúc này).
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
            // UUIDv7 idempotency key — chỉ sinh khi entry thắng (cần dispatch payout cho tenant).
            // Worker-tenant-dispatch dùng giá trị này làm `TenantDispatchOrderDoc.tx`.
            // Entry thua không phát sinh giao dịch → không cần tx.
            payoutTx: hasWin ? generateId() : undefined,
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
 * Trả về giá trị giải cố định per unit cho tier. JP1/JP2 → 0 (xử lý bởi PatchJackpotPrize).
 *
 * Tách hàm riêng để tránh dùng `as keyof` cast không an toàn tại call-site.
 */
function getFixedPrizeAmount(tier: PrizeTier | null, prizeAmounts: PrizeAmounts): number {
  if (tier === PrizeTier.Tier1) return prizeAmounts.tier1;
  if (tier === PrizeTier.Tier2) return prizeAmounts.tier2;
  if (tier === PrizeTier.Tier3) return prizeAmounts.tier3;
  // JP1/JP2: giải tích luỹ — PatchJackpotPrize tính sau khi biết pool + số winners.
  return 0;
}

/**
 * Build payout tiers từ line docs đã có winAmount (đã nhân betCount).
 *
 * Multi-board ticket: board A betCount=1, board B betCount=3
 * → mỗi line có betCount khác nhau, không thể dùng flat tierCounts.
 * Aggregate: group by tier → sum winAmount → derive hitCount.
 *
 * JP1/JP2: amount = 0 tại đây, PatchJackpotPrize patch sau khi biết pool + winners.
 * Giải cố định: amount = totalAmount đã là Σ(unitAmount × betCount) từng line.
 *
 * @param lineDocs - Line docs đã có matchResult.winAmount = unitWinAmount × betCount
 * @param fixedPrizeAmounts - Bảng giải cố định từ config (dùng lấy unitAmount per tier)
 */
function buildPayoutTiersFromLines(
  lineDocs: Array<Omit<TicketLineDoc, "_id">>,
  fixedPrizeAmounts: PrizeAmounts,
): EntryPayoutTier[] {
  // Group by tier: đếm hitCount + tổng winAmount (đã nhân betCount)
  const tierMap = new Map<string, { hitCount: number; totalAmount: number }>();

  for (const line of lineDocs) {
    const { tier, winAmount } = line.matchResult;
    if (tier == null) continue;

    const existing = tierMap.get(tier) ?? { hitCount: 0, totalAmount: 0 };
    existing.hitCount += 1;
    existing.totalAmount += winAmount;
    tierMap.set(tier, existing);
  }

  const tiers: EntryPayoutTier[] = [];
  for (const [tier, data] of tierMap) {
    if (tier === PrizeTier.Jackpot1 || tier === PrizeTier.Jackpot2) {
      // JP1/JP2: amount = 0 tạm thời; PatchJackpotPrize chia pool theo tỷ lệ betCount.
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount: 0,
        amount: 0,
      });
    } else {
      // Giải cố định: unitAmount từ config, amount = Σ(unitAmount × betCount) từ lineDocs.
      const unitAmount = getFixedPrizeAmount(tier as PrizeTier, fixedPrizeAmounts);
      tiers.push({
        tier: tier as PrizeTier,
        hitCount: data.hitCount,
        unitAmount,
        // data.totalAmount đã là Σ(unitAmount × betCount) nhờ winAmount được nhân ở lineDocs.
        amount: data.totalAmount,
      });
    }
  }

  return tiers;
}
