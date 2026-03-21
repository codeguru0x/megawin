/**
 * Use Case: Patch Jackpot Prize (Power 6/55) — chia theo tỷ lệ betCount
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CHỈ CHẠY KHI CÓ JP1 VÀ/HOẶC JP2 WINNER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Step Function route vào đây khi hasJackpot1Winner || hasJackpot2Winner.
 * JP1 và JP2 được xử lý độc lập — có thể cùng kỳ cả 2 đều có winner.
 *
 * ────────────────────────────────────────────────
 * LOGIC betCount (theo luật Vietlott):
 * ────────────────────────────────────────────────
 * "Giải Jackpot được chia đều theo tỷ lệ giá trị tham gia dự thưởng"
 * → Giá trị tham gia = betCount (số lần tham gia dự thưởng per line).
 *
 * Ví dụ JP1:
 *   Entry A trúng 1 JP1 line, betCount = 3 → 3 đơn vị
 *   Entry B trúng 1 JP1 line, betCount = 1 → 1 đơn vị
 *   totalBetUnits = 4
 *   jackpotPerUnit = floor(totalJp1Prize / 4)
 *   Entry A nhận: jackpotPerUnit × 3
 *   Entry B nhận: jackpotPerUnit × 1
 *
 * Khi tất cả betCount = 1 (backward compat): totalBetUnits = số lines
 * → kết quả giống với chia đều per entry/line.
 *
 * ────────────────────────────────────────────────
 * PIPELINE per jackpot type:
 * ────────────────────────────────────────────────
 *
 *   1. Lấy lines trúng jackpotTier → betCount per line
 *   2. totalBetUnits = Σ(line.betCount)
 *   3. jackpotPerUnit = floor(totalJp1Prize / totalBetUnits)
 *   4. Nhóm lines theo entryId → entryBetUnits = Σ(betCount của lines trong entry)
 *   5. perEntryAmounts: prizeAmount = jackpotPerUnit × entryBetUnits
 *   6. Patch song song (idempotent):
 *      a. entry.payout.tiers[jackpotN] → unitAmount, amount, winAmount
 *      b. line.matchResult.winAmount   → jackpotPerUnit × line.betCount
 *   7. incrementTotalPayout nếu có patch
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - patchJackpotPrizePerEntry:  filter amount = 0 → skip nếu đã patch
 *   - patchJackpotLinesPerUnit:   filter winAmount = 0 → skip nếu đã patch
 *   - incrementTotalPayout:       guard bởi patchedEntries > 0
 *
 * Input: SettleContextWithFinancials
 * Output: { drawId, jp1EntriesPatched, jp2EntriesPatched, winners }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { JackpotWinnerInfo } from "@megawin/game-power655/entities";
import { JackpotType, PrizeTier } from "@megawin/game-power655/entities";
import type { SettleContextWithFinancials } from "./types";

export interface PatchJackpotPrizeResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Số entries đã patch JP1 prize. */
  jp1EntriesPatched: number;
  /** Số entries đã patch JP2 prize. */
  jp2EntriesPatched: number;
  /** Danh sách người trúng JP1 + JP2 — truyền sang FinalizeSettle để ghi cycle record. */
  winners: JackpotWinnerInfo[];
}

/**
 * Patch tiền Jackpot (JP1 + JP2) vào entries + lines theo tỷ lệ betCount.
 *
 * Đúng luật Vietlott: "Giải Jackpot chia đều theo tỷ lệ giá trị tham gia dự thưởng"
 * → jackpotPerUnit × betCount (không phải chia đều per entry/line).
 */
export class PatchJackpotPrizeUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  PatchJackpotPrizeResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<PatchJackpotPrizeResult> {
    const { drawId, jp1CurrentAmount, jp2CurrentAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner, jackpot1Contribution, jackpot2Contribution } =
      financials;

    let jp1EntriesPatched = 0;
    let jp2EntriesPatched = 0;
    let totalIncrementAmount = 0;
    const winners: JackpotWinnerInfo[] = [];

    // ── JP1: patch theo tỷ lệ betCount ─────────────────────────────────────
    if (hasJackpot1Winner) {
      const result = await this.patchJackpotTier(
        drawId,
        PrizeTier.Jackpot1,
        jp1CurrentAmount + jackpot1Contribution,
      );
      jp1EntriesPatched = result.patchedCount;

      if (result.patchedCount > 0) {
        totalIncrementAmount += result.totalPrizeDistributed;
      }

      // Build winners list để truyền sang FinalizeSettle
      for (const [entryId, info] of result.perEntryAmounts) {
        const entry = await this.entryRepo.getEntryById(entryId);
        if (entry) {
          winners.push({
            accountId: entry.accountId,
            username: entry.username,
            tenantId: entry.tenantId,
            prizeAmount: info.prizeAmount,
            entryId,
            drawId,
            jackpotType: JackpotType.Jackpot1,
          });
        }
      }
    }

    // ── JP2: patch theo tỷ lệ betCount ─────────────────────────────────────
    if (hasJackpot2Winner) {
      const result = await this.patchJackpotTier(
        drawId,
        PrizeTier.Jackpot2,
        jp2CurrentAmount + jackpot2Contribution,
      );
      jp2EntriesPatched = result.patchedCount;

      if (result.patchedCount > 0) {
        totalIncrementAmount += result.totalPrizeDistributed;
      }

      // Build winners list để truyền sang FinalizeSettle
      for (const [entryId, info] of result.perEntryAmounts) {
        const entry = await this.entryRepo.getEntryById(entryId);
        if (entry) {
          winners.push({
            accountId: entry.accountId,
            username: entry.username,
            tenantId: entry.tenantId,
            prizeAmount: info.prizeAmount,
            entryId,
            drawId,
            jackpotType: JackpotType.Jackpot2,
          });
        }
      }
    }

    // ── Cập nhật draw.stats.totalPayout + settleSummary Jackpot prizeAmount ───
    // incrementTotalPayout: $inc KHÔNG idempotent → guard bởi totalIncrementAmount > 0.
    // patchSettleSummaryJackpot: $set → idempotent (set giá trị, không cộng).
    const jackpotPatches: Array<{ tier: PrizeTier; prizeAmount: number }> = [];

    if (jp1EntriesPatched > 0 && hasJackpot1Winner) {
      const totalJp1 = jp1CurrentAmount + jackpot1Contribution;
      jackpotPatches.push({
        tier: PrizeTier.Jackpot1,
        // prizeAmount trên draw = tổng pool thực tế đã chia (floor × totalBetUnits ≤ totalPool)
        prizeAmount: totalJp1,
      });
    }

    if (jp2EntriesPatched > 0 && hasJackpot2Winner) {
      const totalJp2 = jp2CurrentAmount + jackpot2Contribution;
      jackpotPatches.push({
        tier: PrizeTier.Jackpot2,
        prizeAmount: totalJp2,
      });
    }

    await Promise.all([
      totalIncrementAmount > 0
        ? this.drawRepo.incrementTotalPayout(drawId, totalIncrementAmount)
        : Promise.resolve(),
      jackpotPatches.length > 0
        ? this.drawRepo.patchSettleSummaryJackpot(drawId, jackpotPatches)
        : Promise.resolve(),
    ]);

    return { drawId, jp1EntriesPatched, jp2EntriesPatched, winners };
  }

  /**
   * Tính toán và patch 1 loại Jackpot (JP1 hoặc JP2) theo tỷ lệ betCount.
   *
   * Quy trình:
   *   1. Lấy lines trúng jackpotTier kèm betCount từ DB
   *   2. totalBetUnits = Σ(line.betCount) — tổng đơn vị tham gia dự thưởng
   *   3. jackpotPerUnit = floor(totalPool / totalBetUnits)
   *   4. Group lines theo entryId → entryBetUnits, prizeAmount
   *   5. Patch entries + lines song song (idempotent)
   *
   * @param drawId - ID kỳ quay
   * @param jackpotTier - "jackpot1" hoặc "jackpot2"
   * @param totalPool - Tổng giải Jackpot = openingAmount + contribution
   */
  private async patchJackpotTier(
    drawId: string,
    jackpotTier: PrizeTier,
    totalPool: number,
  ): Promise<{
    patchedCount: number;
    totalPrizeDistributed: number;
    perEntryAmounts: Map<string, { prizeAmount: number; jackpotPerUnit: number }>;
  }> {
    const perEntryAmounts = new Map<string, { prizeAmount: number; jackpotPerUnit: number }>();

    if (totalPool <= 0) {
      return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
    }

    // ── Bước 1: Lấy lines trúng JP + betCount ────────────────────────
    // Chỉ lấy lines có winAmount = 0 (chưa patch) để idempotent.
    const winningLines = await this.lineRepo.getJackpotWinningLines(drawId, jackpotTier);

    if (winningLines.length === 0) {
      return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
    }

    // ── Bước 2: Tính totalBetUnits ────────────────────────────────────
    // Tổng đơn vị tham gia dự thưởng = Σ(betCount per JP line).
    // Backward compat: line.betCount ?? 1 (lines cũ chưa có betCount).
    const totalBetUnits = winningLines.reduce((sum, l) => sum + (l.betCount ?? 1), 0);

    // ── Bước 3: Tính jackpotPerUnit ───────────────────────────────────
    // jackpotPerUnit = floor(totalPool / totalBetUnits).
    // floor để tránh fraction — phần lẻ giữ lại quỹ (theo luật Vietlott).
    const jackpotPerUnit = Math.floor(totalPool / totalBetUnits);

    if (jackpotPerUnit <= 0) {
      return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
    }

    // ── Bước 4: Group lines theo entryId ─────────────────────────────
    // entryBetUnits = Σ(betCount của các JP lines thuộc entry này).
    // Một entry có thể có nhiều JP lines (từ Bao boards).
    const entryBetUnitsMap = new Map<string, number>();
    for (const line of winningLines) {
      const prev = entryBetUnitsMap.get(line.entryId) ?? 0;
      entryBetUnitsMap.set(line.entryId, prev + (line.betCount ?? 1));
    }

    // Tính prizeAmount per entry: jackpotPerUnit × entryBetUnits
    let totalPrizeDistributed = 0;
    for (const [entryId, entryBetUnits] of entryBetUnitsMap) {
      const prizeAmount = jackpotPerUnit * entryBetUnits;
      perEntryAmounts.set(entryId, { prizeAmount, jackpotPerUnit });
      totalPrizeDistributed += prizeAmount;
    }

    // ── Bước 5: Patch entries + lines song song (idempotent) ──────────
    // patchJackpotPrizePerEntry: patch entry.payout.tiers[jackpotN]
    // patchJackpotLinesPerUnit: patch line.matchResult.winAmount = jackpotPerUnit × betCount
    const [patchedCount] = await Promise.all([
      this.entryRepo.patchJackpotPrizePerEntry(drawId, jackpotTier, perEntryAmounts),
      this.lineRepo.patchJackpotLinesPerUnit(drawId, jackpotTier, jackpotPerUnit),
    ]);

    return { patchedCount, totalPrizeDistributed, perEntryAmounts };
  }
}
