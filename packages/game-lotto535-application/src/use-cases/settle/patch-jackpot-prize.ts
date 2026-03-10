/**
 * Use Case: Patch Jackpot Prize (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 4a TRONG SETTLE FLOW — CHỈ CHẠY KHI CÓ JACKPOT WINNER
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Step Function route vào đây khi `financials.hasJackpotWinner = true`.
 *
 * ────────────────────────────────────────────────
 * LOGIC:
 * ────────────────────────────────────────────────
 *
 *   1. Tìm tất cả entries trúng Jackpot trong draw (tier = "jackpot", hitCount > 0)
 *
 *   2. Tính jackpotPerWinner:
 *      totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *      jackpotPerWinner  = floor(totalJackpotPrize / winnerCount)
 *
 *      - jackpotOpeningAmount: số tiền JP đầu kỳ (từ cycle.currentAmount lúc PrepareSettle)
 *      - jackpotContribution: phần doanh thu kỳ này đóng góp vào JP (từ CalculateFinancials)
 *      - Nhiều winner → chia đều, làm tròn xuống (phần dư rất nhỏ, bỏ qua)
 *
 *   3. Patch song song (idempotent — chỉ patch docs có amount = 0):
 *      a. entry.payout.tiers[jackpot] → cập nhật unitAmount, amount, winAmount, payoutAmount
 *      b. line.matchResult.winAmount  → cập nhật winAmount cho từng line trúng JP
 *      c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị ($set)
 *
 *   4. Cập nhật draw.stats.totalPayoutAmount (+= totalJackpotPayout):
 *      CHỈ gọi khi bước 3a thực sự patch entries (modifiedCount > 0).
 *      Lý do: $inc KHÔNG idempotent — nếu retry mà entries đã patch xong,
 *      modifiedCount = 0 → skip $inc → tránh cộng dồn sai.
 *
 * ────────────────────────────────────────────────
 * TẠI SAO TÁCH RIÊNG (KHÔNG GỘP VỚI SPLIT BONUSES):
 * ────────────────────────────────────────────────
 *   - Jackpot winner và Split cycle là 2 case MUTUALLY EXCLUSIVE
 *     (có JP winner → không bao giờ split; split chỉ khi không có JP winner)
 *   - Step Function Choice state route chính xác: không gọi Lambda thừa
 *   - Mỗi use case single responsibility → dễ debug, dễ đọc log
 *   - Idempotency riêng biệt, không lẫn lộn guard conditions
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - patchJackpotPrize: chỉ update entries có tiers[jackpot].amount = 0
 *   - patchJackpotLineWinAmount: chỉ update lines có matchResult.winAmount = 0
 *   - incrementTotalPayout: guard bởi patchedEntries > 0 (xem mục 4 ở trên)
 *
 * Input: SettleContext (đã có financials, financials.hasJackpotWinner = true)
 * Output: { drawId, entriesPatched }
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { EntryRepository } from "../../infras/repos/entry-repo";
import { LineRepository } from "../../infras/repos/line-repo";
import { DrawRepository } from "../../infras/repos/draw-repo";
import type { JackpotWinnerInfo } from "@megawin/game-lotto535/entities";
import type { SettleContext } from "./types";

export interface PatchJackpotPrizeResult {
  drawId: string;
  entriesPatched: number;
  /** Danh sách người trúng JP — truyền sang FinalizeSettle để ghi cycle record. */
  winners: JackpotWinnerInfo[];
}

export class PatchJackpotPrizeUseCase extends InternalUseCase<
  SettleContext,
  PatchJackpotPrizeResult
> {
  private readonly entryRepo = new EntryRepository();
  private readonly lineRepo = new LineRepository();
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: SettleContext): Promise<PatchJackpotPrizeResult> {
    const { drawId, jackpotOpeningAmount } = input;
    const financials = input.financials!;
    const { jackpotContribution } = financials;

    // ── Bước 1: Tìm entries trúng Jackpot ──
    // Filter: payout.tiers chứa tier = "jackpot" với hitCount > 0
    const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

    if (jackpotEntries.length === 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 2: Tính tiền thưởng Jackpot mỗi người ──
    // totalJackpotPrize = số tiền JP tích luỹ đầu kỳ + đóng góp kỳ này
    // jackpotPerWinner = chia đều cho tất cả winner, làm tròn xuống
    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerWinner = Math.floor(totalJackpotPrize / jackpotEntries.length);

    if (jackpotPerWinner <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Patch entries + lines + settleSummary song song ──
    // Tất cả đều idempotent: entries/lines chỉ update docs có amount/winAmount = 0,
    // settleSummary dùng $set → ghi cùng giá trị nhiều lần không sai.
    const [patchedEntries] = await Promise.all([
      // 3a. Patch entry.payout: tiers[jackpot].amount + winAmount + payoutAmount
      this.entryRepo.patchJackpotPrize(drawId, jackpotPerWinner),
      // 3b. Patch line.matchResult.winAmount cho các line trúng jackpot
      this.lineRepo.patchJackpotLineWinAmount(drawId, jackpotPerWinner),
      // 3c. Patch draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 4: Cập nhật draw.stats.totalPayoutAmount ──
    // $inc KHÔNG idempotent → chỉ gọi khi entries thực sự được patch lần đầu.
    // Retry: entries đã patch (amount > 0) → modifiedCount = 0 → skip → an toàn.
    // totalJackpotPayout = tiền JP thực chi (floor * số winner, không phải totalJackpotPrize
    // vì làm tròn xuống có thể dư vài đồng).
    const totalJackpotPayout = jackpotPerWinner * jackpotEntries.length;
    if (patchedEntries > 0) {
      await this.drawRepo.incrementTotalPayout(drawId, totalJackpotPayout);
    }

    // ── Build winners list để truyền sang FinalizeSettle ──
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
