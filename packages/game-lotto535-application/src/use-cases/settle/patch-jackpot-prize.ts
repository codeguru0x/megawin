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
    const jackpotEntries = await this.entryRepo.findJackpotWinners(drawId);

    if (jackpotEntries.length === 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 2: Tính jackpot per unit (theo tỷ lệ tham gia dự thưởng) ──
    // Quy tắc Vietlott: "Giải Độc Đắc được chia đều theo tỷ lệ giá trị tham gia dự thưởng"
    // → chia theo betCount, không chia đều per line/entry.
    //
    // Vì 1 entry chỉ có 1 JP line (determineTier trả tier cao nhất per line),
    // betCount của JP line = betCount của board chứa nó.
    // Entry snapshot có boards[] nhưng không biết JP line thuộc board nào nếu multi-board.
    //
    // Approach đơn giản và chính xác: dùng payout tier betCount nếu có.
    // Mỗi entry có 1 jp tier với hitCount = số JP lines. Đối với multi-board entries
    // có betCount khác nhau, chúng ta lấy betCount từ entrySummary.boards
    // (sum của tất cả bet units trong entry / hitCount — xấp xỉ đúng khi hitCount = 1).
    //
    // Với hitCount = 1 (phổ biến nhất): betCount chính xác là betCount của board có JP line.
    // Để lấy betCount chính xác, entry-repo.patchJackpotPrize sẽ tính từ tiers.betCount.
    // Ở đây tính totalBetUnits = Σ(hitCount × avg_betCount_per_entry).
    //
    // Trường hợp đơn giản nhất (99%+ cases): 1 JP line per entry, tất cả boards betCount đồng nhất.
    // Trường hợp phức tạp: lấy JP lines từ DB để tính chính xác.
    const jpLinesData = await this.lineRepo.getJackpotLinesForDraw(drawId);
    const totalBetUnits = jpLinesData.reduce((sum, line) => sum + (line.betCount ?? 1), 0);

    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerUnit = Math.floor(totalJackpotPrize / Math.max(totalBetUnits, 1));

    if (jackpotPerUnit <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Patch entries + lines + settleSummary song song ──
    // Build betUnitsByEntry map để repo tính prizeAmount chính xác per entry
    const betUnitsByEntry = new Map<string, number>();
    for (const line of jpLinesData) {
      const entryIdStr = line.entryId?.toString() ?? "";
      if (!entryIdStr) continue;
      betUnitsByEntry.set(
        entryIdStr,
        (betUnitsByEntry.get(entryIdStr) ?? 0) + (line.betCount ?? 1),
      );
    }

    const [patchedEntries] = await Promise.all([
      // jackpotPerUnit × betUnits (per entry, từ betUnitsByEntry map)
      this.entryRepo.patchJackpotPrize(drawId, jackpotPerUnit, betUnitsByEntry),
      this.lineRepo.patchJackpotLineWinAmount(drawId, jackpotPerUnit),
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 4: Cập nhật draw.stats.totalPayoutAmount ──
    // $inc KHÔNG idempotent → chỉ gọi khi entries thực sự được patch lần đầu.
    const totalJackpotPayout = jackpotPerUnit * totalBetUnits;
    if (patchedEntries > 0) {
      await this.drawRepo.incrementTotalPayout(drawId, totalJackpotPayout);
    }

    // ── Build winners list để truyền sang FinalizeSettle ──
    const winners: JackpotWinnerInfo[] = jackpotEntries.map((e) => {
      const jpTier = e.payout?.tiers.find((t) => t.tier === "jackpot");
      const hitCount = jpTier?.hitCount ?? 0;
      // betCount: lấy từ lines data thay vì estimate từ boards
      const entryBetUnits = jpLinesData
        .filter((l) => l.entryId?.toString() === e.id)
        .reduce((sum, l) => sum + (l.betCount ?? 1), 0);
      return {
        accountId: e.accountId,
        username: e.username,
        tenantId: e.tenantId,
        prizeAmount: jackpotPerUnit * (entryBetUnits || hitCount),
        entryId: e.id,
        drawId,
      };
    });

    return { drawId, entriesPatched: patchedEntries, winners };
  }
}
