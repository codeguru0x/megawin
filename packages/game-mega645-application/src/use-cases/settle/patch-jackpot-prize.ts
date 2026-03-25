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
 * LOGIC (có betCount multiplier):
 * ────────────────────────────────────────────────
 *
 *   1. Tìm tất cả entries trúng Jackpot (tier = "jackpot", hitCount > 0)
 *
 *   1b. Load betCount từ line docs trúng JP — mỗi entry chỉ có 1 line JP (C(6,6)=1)
 *
 *   2. Tính jackpotPerUnit (chia theo tỷ lệ giá trị tham gia dự thưởng):
 *      totalBetUnits     = Σ(betCount) cho mỗi JP entry
 *      totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *      jackpotPerUnit    = floor(totalJackpotPrize / totalBetUnits)
 *
 *      Mỗi entry nhận: jackpotPerUnit × betCount (của entry đó)
 *
 *   3. Patch song song (idempotent):
 *      a. entry.payout — jackpotAmount = jackpotPerUnit × betCount per entry
 *      b. line.matchResult.winAmount — jackpotPerUnit × betCount per line
 *      c. draw.settleSummary.tiers[jackpot].prizeAmount
 *
 *   4. Cập nhật draw.stats.totalPayoutAmount (+= totalJackpotPayout)
 *
 * ────────────────────────────────────────────────
 * BACKWARD COMPAT:
 * ────────────────────────────────────────────────
 *   Khi betCount = 1 cho tất cả entries (data cũ):
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
    // Lấy tất cả các entry trúng Jackpot - Mỗi entry chỉ có 1 line trúng Jackpot (C(6,6)=1).
    const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

    if (jackpotEntries.length === 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 1b: Load betCount từ lines trúng JP ─────────────────────────
    // Mỗi entry chỉ có 1 line JP (C(6,6)=1). betCount lấy từ board chứa line JP đó.
    // Đọc từ line doc (đã lưu betCount ở settle-entries).
    const jackpotLines = await this.lineRepo.findJackpotLinesByDrawId(drawId);

    // Map entryId → betCount từ line doc
    const betCountByEntry = new Map<string, number>();
    for (const line of jackpotLines) {
      betCountByEntry.set(line.entryId, line.betCount);
    }

    // ── Bước 2: Tính tiền thưởng Jackpot theo tỷ lệ betCount ────────────
    // Quy tắc Vietlott: "chia đều theo tỷ lệ giá trị tham gia dự thưởng"
    // "Giá trị tham gia" = betCount × unitPrice.
    // Vì C(6,6)=1, mỗi entry chỉ có 1 line JP → totalBetUnits = Σ(betCount per JP entry).
    const totalBetUnits = jackpotEntries.reduce(
      (sum, e) => sum + (betCountByEntry.get(e.id) ?? 0),
      0,
    );
    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerUnit = Math.floor(totalJackpotPrize / totalBetUnits);

    if (jackpotPerUnit <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Patch entries + lines + settleSummary song song ────────────
    // Mỗi entry nhận: jackpotPerUnit × betCount (của entry đó).
    // patchJackpotPrizeByBetCount: gọi entryRepo cập nhật từng entry theo betCount.
    const entryPatchOps = jackpotEntries.map((e) => {
      const bc = betCountByEntry.get(e.id) ?? 1;
      return { entryId: e.id, jackpotAmount: jackpotPerUnit * bc };
    });

    const [patchedEntries] = await Promise.all([
      // 3a. entry.payout.tiers[jackpot]: unitAmount, amount, winAmount, payoutAmount
      this.entryRepo.patchJackpotPrizePerEntry(drawId, entryPatchOps),
      // 3b. line.matchResult.winAmount cho các line trúng jackpot — nhân betCount
      this.lineRepo.patchJackpotLineWinAmountPerLine(drawId, jackpotPerUnit, betCountByEntry),
      // 3c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 4: Cập nhật draw.stats.totalPayoutAmount ──────────────────────
    // $inc KHÔNG idempotent → chỉ gọi khi entries thực sự được patch lần đầu.
    // totalJackpotPayout = Σ(jackpotPerUnit × betCount) cho mỗi entry JP.
    const totalJackpotPayout = jackpotPerUnit * totalBetUnits;
    if (patchedEntries > 0) {
      await this.drawRepo.incrementTotalPayout(drawId, totalJackpotPayout);
    }

    // ── Build winners list để truyền sang FinalizeSettle ────────────────────
    const winners: JackpotWinnerInfo[] = jackpotEntries.map((e) => {
      const bc = betCountByEntry.get(e.id) ?? 1;
      return {
        accountId: e.accountId,
        username: e.username,
        tenantId: e.tenantId,
        prizeAmount: jackpotPerUnit * bc,
        entryId: e.id,
        drawId,
      };
    });

    return { drawId, entriesPatched: patchedEntries, winners };
  }
}
