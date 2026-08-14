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
 *   1. Lấy TẤT CẢ lines trúng jackpotTier (kể cả đã patch) → betCount per line
 *   2. totalBetUnits = Σ(line.betCount) trên MỌI line JP → deterministic qua retry
 *   3. jackpotPerUnit = floor(totalJp1Prize / totalBetUnits)
 *   4. Nhóm lines theo entryId → entryBetUnits = Σ(betCount của lines trong entry)
 *   5. perEntryAmounts: prizeAmount = jackpotPerUnit × entryBetUnits
 *   6. Patch song song (idempotent):
 *      a. entry.payout.tiers[jackpotN] → unitAmount, amount, winAmount (filter amount=0)
 *      b. line.matchResult.winAmount   → jackpotPerUnit × line.betCount (filter winAmount=0)
 *   7. Re-aggregate totalPayout từ entries rồi $set (idempotent)
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT + RETRY-SAFE:
 * ────────────────────────────────────────────────
 *   - Mẫu số + winners ĐỌC TỪ TẤT CẢ line JP (getAllJackpotLines, KHÔNG filter
 *     winAmount) → mọi lần SFN retry sau crash giữa chừng đều ra cùng jackpotPerUnit
 *     + cùng perEntryAmounts. Filter chưa-patch CHỈ áp ở bước GHI:
 *   - patchJackpotPrizePerEntry:  filter amount = 0 → skip nếu đã patch
 *   - patchJackpotLinesPerUnit:   filter winAmount = 0 → skip nếu đã patch
 *   - setTotalPayout:             re-aggregate từ entries rồi $set → luôn đúng
 *   - settleSummary gate theo perEntryAmounts.size (deterministic), KHÔNG theo
 *     modifiedCount → crash sau khi entries đã patch vẫn ghi lại settleSummary.
 *
 * Input: SettleContextWithFinancials
 * Output: { drawId, jp1EntriesPatched, jp2EntriesPatched, winners }
 */

import { UseCase } from "@megawin/app-core/use-cases";
import type { JackpotWinnerInfo } from "@megawin/game-power655/entities";
import { JackpotType, PrizeTier } from "@megawin/game-power655/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
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
export class PatchJackpotPrizeUseCase extends UseCase<SettleContextWithFinancials, PatchJackpotPrizeResult> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<PatchJackpotPrizeResult> {
    const { drawId, jp1CurrentAmount, jp2CurrentAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner, jackpot1Contribution, jackpot2Contribution } = financials;

    let jp1EntriesPatched = 0;
    let jp2EntriesPatched = 0;
    // Số entry winner theo tier — DERIVE từ perEntryAmounts (mẫu số deterministic),
    // KHÔNG từ modifiedCount. Dùng để gate settleSummary: crash sau khi entries đã
    // patch (modifiedCount=0 ở retry) vẫn phải ghi lại settleSummary.
    let jp1WinnerCount = 0;
    let jp2WinnerCount = 0;
    const winners: JackpotWinnerInfo[] = [];

    // ── JP1: patch theo tỷ lệ betCount ─────────────────────────────────────
    if (hasJackpot1Winner) {
      const result = await this.patchJackpotTier(drawId, PrizeTier.Jackpot1, jp1CurrentAmount + jackpot1Contribution);
      jp1EntriesPatched = result.patchedCount;
      jp1WinnerCount = result.perEntryAmounts.size;

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
      const result = await this.patchJackpotTier(drawId, PrizeTier.Jackpot2, jp2CurrentAmount + jackpot2Contribution);
      jp2EntriesPatched = result.patchedCount;
      jp2WinnerCount = result.perEntryAmounts.size;

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
    // Re-aggregate totalPayout từ entries (source of truth) rồi $set → idempotent.
    // patchSettleSummaryJackpot: $set → idempotent (set giá trị, không cộng).
    const jackpotPatches: Array<{ tier: PrizeTier; prizeAmount: number }> = [];

    // Gate theo winnerCount (perEntryAmounts.size — deterministic), KHÔNG theo
    // modifiedCount: nếu crash xảy ra SAU khi entries đã patch nhưng TRƯỚC bước
    // này, retry có modifiedCount=0 nhưng winnerCount>0 → vẫn ghi settleSummary.
    if (hasJackpot1Winner && jp1WinnerCount > 0) {
      const totalJp1 = jp1CurrentAmount + jackpot1Contribution;
      jackpotPatches.push({
        tier: PrizeTier.Jackpot1,
        // prizeAmount trên draw = tổng pool thực tế đã chia (floor × totalBetUnits ≤ totalPool)
        prizeAmount: totalJp1,
      });
    }

    if (hasJackpot2Winner && jp2WinnerCount > 0) {
      const totalJp2 = jp2CurrentAmount + jackpot2Contribution;
      jackpotPatches.push({
        tier: PrizeTier.Jackpot2,
        prizeAmount: totalJp2,
      });
    }

    // Re-aggregate totalPayout từ entries sau khi patch JP → $set absolute value.
    // Idempotent: bất kể retry bao nhiêu lần, kết quả luôn chính xác.
    const totalPayout = await this.entryRepo.aggregateTotalPayout(drawId);

    await Promise.all([
      this.drawRepo.setTotalPayout(drawId, totalPayout),
      jackpotPatches.length > 0 ? this.drawRepo.patchSettleSummaryJackpot(drawId, jackpotPatches) : Promise.resolve(),
    ]);

    return { drawId, jp1EntriesPatched, jp2EntriesPatched, winners };
  }

  /**
   * Tính toán và patch 1 loại Jackpot (JP1 hoặc JP2) theo tỷ lệ betCount.
   *
   * Quy trình:
   *   1. Lấy TẤT CẢ lines trúng jackpotTier (getAllJackpotLines — kể cả đã patch)
   *   2. totalBetUnits = Σ(line.betCount) — mẫu số deterministic qua retry
   *   3. jackpotPerUnit = floor(totalPool / totalBetUnits)
   *   4. Group lines theo entryId → entryBetUnits, prizeAmount
   *   5. Patch entries + lines song song (idempotent — filter chưa-patch ở bước ghi)
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

    // ── Bước 1: Lấy TẤT CẢ lines trúng JP (KỂ CẢ đã patch) ───────────
    // PHẢI đọc tất cả — KHÔNG filter winAmount — để mẫu số totalBetUnits +
    // danh sách winner DETERMINISTIC khi SFN retry sau crash giữa chừng
    // (kịch bản lines đã patch, entries chưa). Filter winAmount = 0 chỉ áp ở
    // thao tác PATCH (patchJackpotLinesPerUnit / patchJackpotPrizePerEntry).
    const jackpotLines = await this.lineRepo.getAllJackpotLines(drawId, jackpotTier);

    if (jackpotLines.length === 0) {
      return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
    }

    // ── Bước 2: Tính totalBetUnits ────────────────────────────────────
    // Tổng đơn vị tham gia dự thưởng = Σ(betCount per JP line) trên MỌI line JP.
    const totalBetUnits = jackpotLines.reduce((sum, l) => sum + l.betCount, 0);

    // ── Bước 3: Tính jackpotPerUnit ───────────────────────────────────
    // jackpotPerUnit = floor(totalPool / totalBetUnits).
    // floor để tránh fraction — phần lẻ giữ lại quỹ (theo luật Vietlott).
    const jackpotPerUnit = Math.floor(totalPool / totalBetUnits);

    if (jackpotPerUnit <= 0) {
      return { patchedCount: 0, totalPrizeDistributed: 0, perEntryAmounts };
    }

    // ── Bước 4: Group lines theo entryId ─────────────────────────────
    // entryBetUnits = Σ(betCount của các JP lines thuộc entry này).
    // Một entry có thể có nhiều JP lines (từ Bao boards) → phải CỘNG DỒN.
    // Group từ TẤT CẢ line JP (không chỉ line chưa patch) → deterministic.
    const entryBetUnitsMap = new Map<string, number>();
    for (const line of jackpotLines) {
      const prev = entryBetUnitsMap.get(line.entryId) ?? 0;
      entryBetUnitsMap.set(line.entryId, prev + line.betCount);
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
