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
 * LOGIC:
 * ────────────────────────────────────────────────
 *
 *   1. Tìm tất cả entries trúng Jackpot (tier = "jackpot", hitCount > 0)
 *
 *   2. Tính jackpotPerWinner:
 *      totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *      jackpotPerWinner  = floor(totalJackpotPrize / winnerCount)
 *
 *   3. Patch song song (idempotent):
 *      a. entry.payout.tiers[jackpot] → cập nhật unitAmount, amount, winAmount, payoutAmount
 *      b. line.matchResult.winAmount  → cập nhật winAmount cho từng line trúng JP
 *      c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị
 *
 *   4. Cập nhật draw.stats.totalPayoutAmount (+= totalJackpotPayout):
 *      CHỈ gọi khi bước 3a thực sự patch entries (modifiedCount > 0).
 *      Lý do: $inc KHÔNG idempotent → nếu retry mà entries đã patch,
 *      modifiedCount = 0 → skip $inc → tránh cộng dồn sai.
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - patchJackpotPrize:        chỉ update entries có tiers[jackpot].amount = 0
 *   - patchJackpotLineWinAmount: chỉ update lines có matchResult.winAmount = 0
 *   - incrementTotalPayout:     guard bởi patchedEntries > 0
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
    // Lấy tất cả các entry trúng Jackpot - Mỗi entry chỉ có 1 line trúng Jackpot
    const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

    if (jackpotEntries.length === 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 2: Tính tiền thưởng Jackpot mỗi người ─────────────────────────
    // totalJackpotPrize = pool tích luỹ đầu kỳ + đóng góp kỳ này
    // Chia đều, làm tròn xuống (phần dư < số winners, không đáng kể)
    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerWinner = Math.floor(totalJackpotPrize / jackpotEntries.length);

    if (jackpotPerWinner <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Patch entries + lines + settleSummary song song ────────────
    // Cả 3 đều idempotent: chỉ update docs có amount/winAmount = 0.
    const [patchedEntries] = await Promise.all([
      // 3a. entry.payout.tiers[jackpot]: unitAmount, amount, winAmount, payoutAmount
      this.entryRepo.patchJackpotPrize(drawId, jackpotPerWinner),
      // 3b. line.matchResult.winAmount cho các line trúng jackpot
      this.lineRepo.patchJackpotLineWinAmount(drawId, jackpotPerWinner),
      // 3c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 4: Cập nhật draw.stats.totalPayoutAmount ──────────────────────
    // $inc KHÔNG idempotent → chỉ gọi khi entries thực sự được patch lần đầu.
    // totalJackpotPayout = tiền JP thực chi (floor * winnerCount).
    const totalJackpotPayout = jackpotPerWinner * jackpotEntries.length;
    if (patchedEntries > 0) {
      await this.drawRepo.incrementTotalPayout(drawId, totalJackpotPayout);
    }

    // ── Build winners list để truyền sang FinalizeSettle ────────────────────
    // FinalizeSettle sẽ ghi vào cycle close record — tránh re-query DB lần 2.
    const winners: JackpotWinnerInfo[] = jackpotEntries.map((e) => ({
      accountId: e.accountId,
      username: e.username,
      tenantId: e.tenantId,
      prizeAmount: jackpotPerWinner,
      entryId: e.id,
      drawId,
    }));

    return { drawId, entriesPatched: patchedEntries, winners };
  }
}
