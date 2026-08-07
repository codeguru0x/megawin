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
 *   2. Tính jackpotPerUnit (chia THEO betCount, KHÔNG chia đều per winner/line):
 *      totalJackpotPrize = jackpotOpeningAmount + jackpotContribution
 *      totalBetUnits     = Σ(line.betCount) trên TẤT CẢ JP lines của draw
 *      jackpotPerUnit    = floor(totalJackpotPrize / totalBetUnits)
 *
 *      - jackpotOpeningAmount: số tiền JP đầu kỳ (từ cycle.currentAmount lúc PrepareSettle)
 *      - jackpotContribution: phần doanh thu kỳ này đóng góp vào JP (từ CalculateFinancials)
 *      - entry nhận: jackpotPerUnit × Σ(betCount các JP line của entry) — CỘNG DỒN, không set() đè.
 *      - Mỗi BOARD phủ bộ trúng sinh 1 JP line riêng với betCount riêng — entry multi-board
 *        (nhiều board trong 1 vé) CÓ THỂ có nhiều JP line. Đây chính là giả định sai đã gây
 *        bug chia JP ở Mega 6/45 (xem `mega645-fix-jackpot-betcount.plan.md`) — Lotto 5/35
 *        không dính bug đó vì `betUnitsByEntry` cộng dồn (`+=`) theo entryId, không `Map.set()` đè.
 *
 *   3. Patch song song (idempotent — chỉ patch docs có amount = 0):
 *      a. entry.payout.tiers[jackpot] → cập nhật unitAmount, amount, winAmount, payoutAmount
 *      b. line.matchResult.winAmount  → cập nhật winAmount cho từng line trúng JP
 *      c. draw.settleSummary.tiers[jackpot].prizeAmount → player API đọc đúng giá trị ($set)
 *
 *   4. Cập nhật draw.stats.totalPayoutAmount (re-aggregate từ entries, $set idempotent):
 *      Thay thế $inc bằng re-aggregate + $set → hoàn toàn idempotent, không cần guard.
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
 *   - setTotalPayout: re-aggregate từ entries rồi $set → luôn đúng
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
    // Quy tắc Vietlott: "Giải Độc Đắc được chia theo tỷ lệ giá trị tham gia dự thưởng"
    // → chia theo betCount (bet units), KHÔNG chia đều per winner/line.
    //
    // Mẫu số totalBetUnits lấy từ TẤT CẢ JP lines hiện có trong DB (KHÔNG filter
    // matchResult.winAmount = 0) — khác Power 6/55 (Power 6/55 lọc theo entry chưa patch).
    // Lý do: nếu lọc theo "chưa patch", một lần chạy retry sau crash (patch lines xong,
    // entry chưa patch) sẽ đọc thiếu lines đã patch → mẫu số hụt → chia sai lần retry.
    // Đọc toàn bộ JP lines làm mẫu số deterministic bất kể chạy lại bao nhiêu lần.
    // KHÔNG "đồng bộ ngược" filter `winAmount: 0` vào đây nếu copy pattern từ Power 6/55.
    const jpLinesData = await this.lineRepo.getJackpotLinesForDraw(drawId);
    const totalBetUnits = jpLinesData.reduce((sum, line) => sum + line.betCount, 0);

    const totalJackpotPrize = jackpotOpeningAmount + jackpotContribution;
    const jackpotPerUnit = Math.floor(totalJackpotPrize / Math.max(totalBetUnits, 1));

    if (jackpotPerUnit <= 0) {
      return { drawId, entriesPatched: 0, winners: [] };
    }

    // ── Bước 3: Patch entries + lines + settleSummary song song ──
    // Build betUnitsByEntry map để repo tính prizeAmount chính xác per entry.
    // CỘNG DỒN (+=) theo entryId — entry multi-board CÓ THỂ có nhiều JP line
    // (mỗi board phủ bộ trúng sinh 1 line riêng), KHÔNG dùng Map.set() vì sẽ ghi đè
    // dòng trước, làm mất betCount của board khác trong cùng entry (bug Mega 6/45).
    const betUnitsByEntry = new Map<string, number>();
    for (const line of jpLinesData) {
      const entryIdStr = line.entryId?.toString() ?? "";
      if (!entryIdStr) continue;
      betUnitsByEntry.set(entryIdStr, (betUnitsByEntry.get(entryIdStr) ?? 0) + line.betCount);
    }

    const [patchedEntries] = await Promise.all([
      // jackpotPerUnit × betUnits (per entry, từ betUnitsByEntry map)
      this.entryRepo.patchJackpotPrize(drawId, jackpotPerUnit, betUnitsByEntry),
      this.lineRepo.patchJackpotLineWinAmount(drawId, jackpotPerUnit),
      this.drawRepo.patchSettleSummaryJackpotPrize(drawId, totalJackpotPrize),
    ]);

    // ── Bước 4: Re-aggregate totalPayout từ entries rồi $set → idempotent ──
    // Thay thế $inc (không idempotent): tính lại từ source of truth (entries).
    const totalPayout = await this.entryRepo.aggregateTotalPayout(drawId);
    await this.drawRepo.setTotalPayout(drawId, totalPayout);

    // ── Build winners list để truyền sang FinalizeSettle ──
    // Dùng CHÍNH betUnitsByEntry (nguồn số đã dùng để patch entry) — không filter lại
    // jpLinesData + fallback `|| hitCount` (2 nguồn số khác nhau từng gây winners lệch
    // với tiền entry thực nhận). Một nguồn số duy nhất → winners luôn khớp entry patch.
    const winners: JackpotWinnerInfo[] = jackpotEntries.map((e) => {
      const entryBetUnits = betUnitsByEntry.get(e.id) ?? 0;
      if (entryBetUnits === 0) {
        // Bất thường dữ liệu: entry có jp tier (hitCount > 0) nhưng không có JP line nào
        // khớp entryId trong betUnitsByEntry — không im lặng fallback, log warn để điều tra.
        console.warn(
          `[PatchJackpotPrize Lotto535] entry ${e.id} trúng JP nhưng thiếu betUnits trong betUnitsByEntry — prizeAmount = 0.`,
        );
      }
      return {
        accountId: e.accountId,
        username: e.username,
        tenantId: e.tenantId,
        prizeAmount: jackpotPerUnit * entryBetUnits,
        entryId: e.id,
        drawId,
      };
    });

    return { drawId, entriesPatched: patchedEntries, winners };
  }
}
