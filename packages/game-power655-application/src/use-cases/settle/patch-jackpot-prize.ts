/**
 * Use Case: Patch Jackpot Prize (Power 6/55)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CHỈ CHẠY KHI CÓ JP1 VÀ/HOẶC JP2 WINNER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Step Function route vào đây khi hasJackpot1Winner || hasJackpot2Winner.
 * JP1 và JP2 được xử lý độc lập — có thể cùng kỳ cả 2 đều có winner.
 *
 * ────────────────────────────────────────────────
 * LOGIC (per jackpot type):
 * ────────────────────────────────────────────────
 *
 *   1. Tìm entries trúng jackpot tier (jackpot1 hoặc jackpot2)
 *
 *   2. Tính jackpotPerWinner:
 *      totalPrize = openingAmount + contribution
 *      perWinner  = floor(totalPrize / winnerCount)
 *
 *   3. Patch song song (idempotent):
 *      a. entry.payout.tiers[jackpotN] → unitAmount, amount, winAmount, payoutAmount
 *      b. line.matchResult.winAmount   → winAmount cho lines trúng jackpotN
 *
 *   4. Cập nhật draw.stats.totalPayout (+= totalPayout):
 *      CHỈ gọi khi bước 3a thực sự patch entries (modifiedCount > 0).
 *      Guard chống $inc chạy 2 lần khi retry.
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - patchJackpotPrize:        filter amount = 0 → skip nếu đã patch
 *   - patchJackpotLineWinAmount: filter winAmount = 0 → skip nếu đã patch
 *   - incrementTotalPayout:     guard bởi patchedEntries > 0
 *
 * Input: SettleContextWithFinancials
 * Output: { drawId, jp1EntriesPatched, jp2EntriesPatched }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { JackpotWinnerInfo } from "@megawin/game-power655/entities";
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

/** Patch tiền Jackpot (JP1 + JP2) vào entries + lines sau khi biết pool cuối kỳ. */
export class PatchJackpotPrizeUseCase extends InternalUseCase<
  SettleContextWithFinancials,
  PatchJackpotPrizeResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContextWithFinancials): Promise<PatchJackpotPrizeResult> {
    const { drawId, jp1OpeningAmount, jp2OpeningAmount, financials } = input;
    const { hasJackpot1Winner, hasJackpot2Winner, jackpot1Contribution, jackpot2Contribution } =
      financials;

    let jp1EntriesPatched = 0;
    let jp2EntriesPatched = 0;
    let totalIncrementAmount = 0;
    const winners: JackpotWinnerInfo[] = [];

    // ── JP1: patch nếu có winner ────────────────────────────────────────────
    if (hasJackpot1Winner) {
      const jp1Entries = await this.entryRepo.findJackpot1Winners(drawId);

      if (jp1Entries.length > 0) {
        const totalJp1Prize = jp1OpeningAmount + jackpot1Contribution;
        const jp1PerWinner = Math.floor(totalJp1Prize / jp1Entries.length);

        if (jp1PerWinner > 0) {
          const [patched] = await Promise.all([
            this.entryRepo.patchJackpotPrize(drawId, "jackpot1", jp1PerWinner),
            this.lineRepo.patchJackpotLineWinAmount(drawId, "jackpot1", jp1PerWinner),
          ]);
          jp1EntriesPatched = patched;
          if (patched > 0) totalIncrementAmount += jp1PerWinner * jp1Entries.length;
        }

        // Build winners list để truyền sang FinalizeSettle
        for (const e of jp1Entries) {
          winners.push({
            accountId: e.accountId,
            tenantId: e.tenantId,
            prizeAmount: jp1PerWinner,
            entryId: e.id,
            drawId,
            jackpotType: "jp1",
          });
        }
      }
    }

    // ── JP2: patch nếu có winner ────────────────────────────────────────────
    if (hasJackpot2Winner) {
      const jp2Entries = await this.entryRepo.findJackpot2Winners(drawId);

      if (jp2Entries.length > 0) {
        const totalJp2Prize = jp2OpeningAmount + jackpot2Contribution;
        const jp2PerWinner = Math.floor(totalJp2Prize / jp2Entries.length);

        if (jp2PerWinner > 0) {
          const [patched] = await Promise.all([
            this.entryRepo.patchJackpotPrize(drawId, "jackpot2", jp2PerWinner),
            this.lineRepo.patchJackpotLineWinAmount(drawId, "jackpot2", jp2PerWinner),
          ]);
          jp2EntriesPatched = patched;
          if (patched > 0) totalIncrementAmount += jp2PerWinner * jp2Entries.length;
        }

        // Build winners list để truyền sang FinalizeSettle
        for (const e of jp2Entries) {
          winners.push({
            accountId: e.accountId,
            tenantId: e.tenantId,
            prizeAmount: jp2PerWinner,
            entryId: e.id,
            drawId,
            jackpotType: "jp2",
          });
        }
      }
    }

    // ── Cập nhật draw.stats.totalPayout ────────────────────────────────────
    // $inc KHÔNG idempotent → chỉ gọi khi có ít nhất 1 entry được patch lần đầu.
    if (totalIncrementAmount > 0) {
      await this.drawRepo.incrementTotalPayout(drawId, totalIncrementAmount);
    }

    return { drawId, jp1EntriesPatched, jp2EntriesPatched, winners };
  }
}
