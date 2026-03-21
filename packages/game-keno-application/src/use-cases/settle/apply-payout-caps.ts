/**
 * Use Case: Apply Payout Caps (Keno)
 *
 * Step 3 trong Settle Step Function — chạy SAU SettleEntries, TRƯỚC SyncTicketSummaries.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * MỤC ĐÍCH
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Áp dụng giới hạn trả thưởng cho bậc 8/9/10 theo quy tắc Vietlott:
 *
 *   Bậc 8 trùng 8:  ≤50 bộ → 200tr/bộ (giải cố định)
 *                    >50 bộ → 10 tỷ chia đều cho tất cả bộ trúng
 *
 *   Bậc 9 trùng 9:  ≤12 bộ → 800tr/bộ (giải cố định)
 *                    >12 bộ → 10 tỷ chia đều cho tất cả bộ trúng
 *
 *   Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ (giải cố định)
 *                     >5 bộ → 10 tỷ chia đều cho tất cả bộ trúng
 *
 * "Bộ" ở đây = 1 board trên 1 entry mà pickCount === matchCount (trúng hết).
 * 1 entry có thể có tối đa 2 boards (A, B), nên 1 entry có thể đóng góp 1-2 bộ.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TẠI SAO KHÔNG ÁP DỤNG NGAY TRONG SETTLE-ENTRIES?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * SettleEntries xử lý theo batch 500 entries → KHÔNG biết tổng số bộ trúng
 * cho đến khi settle xong toàn bộ draw. Logic cap cần:
 *   1. Đếm TỔNG bộ trúng top prize (across ALL entries) → so sánh ngưỡng
 *   2. Nếu vượt → tính giải mới = maxPerDraw / winnerCount
 *   3. Update lại winAmount cho từng entry bị ảnh hưởng
 *
 * Vì vậy tách thành step riêng, chạy sau khi SettleEntries hoàn tất.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   1. Aggregate đếm tổng bộ trúng top prize cho pick8/9/10
 *      (query nhanh nhờ flag hasCappablePrize = true)
 *
 *   2. Với mỗi bậc: so sánh SỐ BỘ trúng (winnerCount) vs ngưỡng (maxSetsForFixed)
 *      - winnerCount === 0            → bỏ qua (không ai trúng)
 *      - winnerCount ≤ maxSetsForFixed → giải cố định, KHÔNG cần update
 *      - winnerCount > maxSetsForFixed → tính giải mới, batch update entries
 *
 *   3. Khi cần update: lấy entries từng batch qua getCappableEntries,
 *      recalc boardPayout.winAmount cho board bị cap,
 *      recalc entry-level totals, bulk write.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * IDEMPOTENT
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Chạy lại cho kết quả giống nhau:
 *   - aggregateTopPrizeWinnerCounts đếm board có matchCount === pickCount
 *     (field matchCount không đổi khi cap, chỉ winAmount đổi)
 *   - calculateCappedPrize luôn ra cùng kết quả cho cùng winnerCount
 *   - Bulk update ghi lại cùng giá trị → no-op nếu đã capped
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { calculateCappedPrize } from "@megawin/game-keno/rules";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { SettleContext } from "./types";

/** Số entries xử lý mỗi batch khi update cappable entries. */
const BATCH_SIZE = 500;

/**
 * Output cho ApplyPayoutCaps — tổng số entries đã update.
 * Step function không dùng output này, nhưng Lambda log nó (CloudWatch).
 */
export interface ApplyPayoutCapsResult {
  /** Tổng số entries đã update winAmount (across tất cả bậc 8/9/10). */
  totalUpdatedEntries: number;
}

/**
 * Thông tin 1 bậc cần kiểm tra cap.
 * Được build từ config (basicPrizes + payoutCaps).
 */
interface CappedTier {
  /** Bậc chơi: 8, 9, hoặc 10. */
  pickCount: number;
  /** Giải cố định từ bảng giải: pick8[8], pick9[9], pick10[10] (VND). */
  fixedPrize: number;
  /** Tổng giải thưởng tối đa cho kỳ (VND). Ví dụ: 10 tỷ. */
  maxPerDraw: number;
  /** Ngưỡng số bộ: ≤ ngưỡng → giải cố định, > ngưỡng → chia đều. */
  maxSetsForFixed: number;
}

export class ApplyPayoutCapsUseCase extends InternalUseCase<SettleContext, ApplyPayoutCapsResult> {
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: SettleContext): Promise<ApplyPayoutCapsResult> {
    const { drawId, config } = input;
    const { payoutCaps, basicPrizes } = config;

    // ── Build danh sách 3 bậc cần kiểm tra cap ──
    const tiers: CappedTier[] = [
      {
        pickCount: 8,
        fixedPrize: basicPrizes.pick8?.["8"] ?? 0,
        maxPerDraw: payoutCaps.pick8MaxPerDraw,
        maxSetsForFixed: payoutCaps.pick8MaxSetsForFixed,
      },
      {
        pickCount: 9,
        fixedPrize: basicPrizes.pick9?.["9"] ?? 0,
        maxPerDraw: payoutCaps.pick9MaxPerDraw,
        maxSetsForFixed: payoutCaps.pick9MaxSetsForFixed,
      },
      {
        pickCount: 10,
        fixedPrize: basicPrizes.pick10?.["10"] ?? 0,
        maxPerDraw: payoutCaps.pick10MaxPerDraw,
        maxSetsForFixed: payoutCaps.pick10MaxSetsForFixed,
      },
    ];

    // ── Đếm tổng bộ trúng top prize cho 3 bậc (1 aggregate query) ──
    const winnerCounts = await this.entryRepo.aggregateTopPrizeWinnerCounts(drawId);
    const countMap: Record<number, number> = {
      8: winnerCounts.pick8Match8,
      9: winnerCounts.pick9Match9,
      10: winnerCounts.pick10Match10,
    };

    let totalUpdatedEntries = 0;

    for (const tier of tiers) {
      const winnerCount = countMap[tier.pickCount] ?? 0;

      if (winnerCount === 0) continue;

      if (winnerCount <= tier.maxSetsForFixed) continue;

      // ── Vượt ngưỡng → tính giải chia đều ──
      const cappedPrize = calculateCappedPrize(
        tier.fixedPrize,
        winnerCount,
        tier.maxPerDraw,
        tier.maxSetsForFixed,
      );

      // ── Batch update entries bị ảnh hưởng ──
      let lastEntryId: string | undefined;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const entries = await this.entryRepo.getCappableEntries(
          drawId,
          tier.pickCount,
          BATCH_SIZE,
          lastEntryId,
        );

        if (entries.length === 0) break;

        const updateOps: Array<{
          entryId: string;
          newWinAmount: number;
          newPayoutAmount: number;
          boardPayouts: Array<{
            boardNo: string;
            playType: string;
            matchCount: number;
            pickCount: number;
            betCount: number;
            winAmount: number;
          }>;
        }> = [];

        for (const entry of entries) {
          const boardPayouts = (entry.payout?.boardPayouts ?? []).map((bp) => {
            if (bp.pickCount === tier.pickCount && bp.matchCount === tier.pickCount) {
              // cappedPrize là per-unit → nhân lại betCount của board này.
              const betCount = bp.betCount ?? 1;
              return { ...bp, winAmount: cappedPrize * betCount };
            }
            return { ...bp };
          });

          const boardTotal = boardPayouts.reduce((sum, b) => sum + b.winAmount, 0);
          const sideBetTotal = (entry.payout?.sideBetPayouts ?? []).reduce(
            (sum, s) => sum + s.winAmount,
            0,
          );
          const newWinAmount = boardTotal + sideBetTotal;

          updateOps.push({
            entryId: entry.id,
            newWinAmount,
            newPayoutAmount: newWinAmount,
            boardPayouts: boardPayouts.map((bp) => ({
              boardNo: bp.boardNo,
              playType: bp.playType as string,
              matchCount: bp.matchCount,
              pickCount: bp.pickCount,
              betCount: bp.betCount ?? 1,
              winAmount: bp.winAmount,
            })),
          });
        }

        await this.entryRepo.bulkApplyPayoutCap(updateOps);
        totalUpdatedEntries += updateOps.length;

        lastEntryId = entries[entries.length - 1]!.id;
      }
    }

    return { totalUpdatedEntries };
  }
}
