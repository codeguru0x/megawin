/**
 * Use Case: Patch Jackpot Prize (Mega 6/45)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CHỈ CHẠY KHI CÓ JACKPOT WINNER (financials.hasJackpotWinner = true)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Step Function route vào đây khi `financials.hasJackpotWinner = true`.
 * Nếu không có winner → skip step này hoàn toàn.
 *
 * ────────────────────────────────────────────────
 * LOGIC (có betCount multiplier, multi-board per entry):
 * ────────────────────────────────────────────────
 *
 *   Mỗi BOARD phủ bộ số trúng S sinh đúng 1 line JP (C(6,6)=1) với `betCount`
 *   riêng của board đó. Một entry có tối đa 6 boards (A–F) → entry có thể có
 *   NHIỀU line JP khi ≥ 2 board cùng phủ S (VD board standard = S + board
 *   bao7 ⊇ S). Do đó PHẢI cộng dồn betCount theo entryId, không giả định
 *   "mỗi entry chỉ có 1 line JP".
 *
 *   1. Tìm tất cả entries trúng Jackpot (tier = "jackpot", hitCount > 0)
 *
 *   1b. Load TẤT CẢ lines trúng JP (không filter winAmount) → group theo
 *       entryId, CỘNG DỒN betCount (entry multi-board có thể có nhiều line JP).
 *
 *   2. Tính jackpotPerUnit (chia theo tỷ lệ giá trị tham gia dự thưởng):
 *      totalBetUnits     = Σ(betCount) trên MỌI line JP toàn kỳ — mẫu số
 *                          deterministic qua retry (đọc từ TẤT CẢ line, không
 *                          phụ thuộc line đã patch hay chưa).
 *      totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *      jackpotPerUnit    = floor(totalJackpotPrize / totalBetUnits)
 *
 *      Mỗi entry nhận: jackpotPerUnit × (tổng betCount của các JP lines thuộc
 *      entry đó).
 *
 *   3. Patch song song (idempotent):
 *      a. entry.payout — jackpotAmount = jackpotPerUnit × betUnits per entry
 *      b. line.matchResult.winAmount — jackpotPerUnit × betCount của CHÍNH line đó
 *         (không phải betCount cấp entry) → Σ(line.winAmount per entry) =
 *         entry.payout.tiers[jackpot].amount, bất biến line↔entry được giữ đúng.
 *      c. draw.settleSummary.tiers[jackpot].prizeAmount
 *
 *   4. Cập nhật draw.stats.totalPayoutAmount (re-aggregate từ entries, $set idempotent)
 *
 * ────────────────────────────────────────────────
 * BACKWARD COMPAT:
 * ────────────────────────────────────────────────
 *   Khi mỗi entry chỉ có 1 board/1 line JP với betCount = 1 (data cũ):
 *   totalBetUnits = winnerCount → jackpotPerUnit = jackpotPerWinner
 *   Kết quả giống hệt logic cũ.
 *
 * Input: SettleContextWithFinancials (hasJackpotWinner = true)
 * Output: { drawId, entriesPatched }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { JackpotWinnerInfo } from "@megawin/game-mega645/entities";
import type { SettleContextWithFinancials } from "./types";

export interface PatchJackpotPrizeResult {
  /** ID kỳ quay. */
  drawId: string;
  /** Số entries đã được patch jackpot prize. */
  entriesPatched: number;
  /** Danh sách người trúng JP — truyền sang FinalizeSettle để ghi cycle record. */
  winners: JackpotWinnerInfo[];
}

/** Patch tiền Jackpot thực tế vào entries + lines sau khi biết pool cuối kỳ. */
export class PatchJackpotPrizeUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  PatchJackpotPrizeResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<PatchJackpotPrizeResult> {
    const { drawId, jackpotOpeningAmount } = input;
    const { jackpotContribution } = input.financials;

    // ── Bước 1: Tìm entries trúng Jackpot ──────────────────────────────────
    const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

    if (jackpotEntries.length === 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 1b: Load TẤT CẢ lines trúng JP, group theo entryId ───────────
    // KHÔNG filter winAmount — mẫu số + winners phải DETERMINISTIC qua mọi lần
    // retry sau crash giữa chừng (kịch bản lines đã patch, entries chưa).
    // Một entry multi-board có thể có NHIỀU line JP → CỘNG DỒN betCount.
    const jackpotLines = await this.lineRepo.findJackpotLinesByDrawId(drawId);

    const betUnitsByEntry = new Map<string, number>();
    for (const line of jackpotLines) {
      betUnitsByEntry.set(line.entryId, (betUnitsByEntry.get(line.entryId) ?? 0) + line.betCount);
    }

    // ── Bước 2: Tính tiền thưởng Jackpot theo tỷ lệ betCount ────────────
    // Quy tắc Vietlott: "chia đều theo tỷ lệ giá trị tham gia dự thưởng"
    // "Giá trị tham gia" = betCount (số lần tham gia dự thưởng) — cộng dồn
    // trên MỌI line JP toàn kỳ, không phải per-entry-1-line.
    const totalBetUnits = jackpotLines.reduce((sum, l) => sum + l.betCount, 0);
    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerUnit = Math.floor(totalJackpotPrize / totalBetUnits);

    if (jackpotPerUnit <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Tính prizeAmount per entry ─────────────────────────────────
    // Mỗi entry nhận: jackpotPerUnit × (tổng betCount của các JP lines thuộc entry).
    const perEntryAmounts = new Map<string, { prizeAmount: number; jackpotPerUnit: number }>();
    for (const e of jackpotEntries) {
      const units = betUnitsByEntry.get(e.id) ?? 0;
      perEntryAmounts.set(e.id, { prizeAmount: jackpotPerUnit * units, jackpotPerUnit });
    }

    // ── Bước 4: Patch entries + lines + settleSummary song song ────────────
    // entriesPatched = modifiedCount thực tế (0 khi retry sau khi đã patch xong —
    // idempotent, KHÔNG dùng để build winners, chỉ để báo cáo).
    const [entriesPatched] = await Promise.all([
      // 4a. entry.payout.tiers[jackpot]: unitAmount, amount, winAmount, payoutAmount
      this.entryRepo.patchJackpotPrizePerEntry(drawId, perEntryAmounts),
      // 4b. line.matchResult.winAmount cho các line trúng jackpot — nhân betCount của CHÍNH line
      this.lineRepo.patchJackpotLineWinAmountPerLine(drawId, jackpotPerUnit),
      // 4c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 5: Re-aggregate totalPayout từ entries rồi $set → idempotent ──
    // Thay thế $inc (không idempotent): tính lại từ source of truth (entries).
    const totalPayout = await this.entryRepo.aggregateTotalPayout(drawId);
    await this.drawRepo.setTotalPayout(drawId, totalPayout);

    // ── Build winners list để truyền sang FinalizeSettle ────────────────────
    // Build từ perEntryAmounts (mẫu số deterministic) — KHÔNG từ entriesPatched
    // (modifiedCount): retry sau crash giữa chừng vẫn phải trả đủ danh sách winners.
    const winners: JackpotWinnerInfo[] = jackpotEntries.map((e) => {
      const info = perEntryAmounts.get(e.id);
      return {
        accountId: e.accountId,
        username: e.username,
        tenantId: e.tenantId,
        prizeAmount: info?.prizeAmount ?? 0,
        entryId: e.id,
        drawId,
      };
    });

    return { drawId, entriesPatched, winners };
  }
}
