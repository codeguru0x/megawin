/**
 * Use Case: Finalize Void (Lotto 5/35)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * STEP 5 TRONG VOID FLOW (BƯỚC CUỐI)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Aggregate tổng kết void từ DB, transition draw: voiding → void + ghi voidSummary.
 *
 * ────────────────────────────────────────────────
 * LOGIC:
 * ────────────────────────────────────────────────
 *   1. AGGREGATE VOID SUMMARY TỪ DB:
 *      - totalVoidedEntries: số entries đã void thành công
 *      - totalOriginalAmount: tổng tiền gốc (entry.amount) — Σ tiền cược gốc
 *      - totalRefundAmount: tổng tiền hoàn thực tế — Σ(voidInfo.refundAmount)
 *      (Thường totalRefundAmount = totalOriginalAmount vì void = hoàn 100%)
 *
 *   2. TRANSITION DRAW STATUS:
 *      - voiding → void (atomic update, guard status = "voiding")
 *      - Ghi voidSummary lên draw:
 *        { totalVoidedEntries, totalOriginalAmount, totalRefundAmount, completedAt }
 *      - Nếu draw đã void (retry) → skip, không throw
 *
 * ────────────────────────────────────────────────
 * IDEMPOTENT:
 * ────────────────────────────────────────────────
 *   - Aggregate luôn cho kết quả giống nhau (đọc từ DB entries đã void)
 *   - voidComplete atomic: guard status = "voiding" → chạy lại tự skip
 *   - Nếu draw đã void → log warning, trả result bình thường
 *
 * ────────────────────────────────────────────────
 * LƯU Ý:
 * ────────────────────────────────────────────────
 *   - Void draw KHÔNG ảnh hưởng Jackpot cycle
 *     (Lotto 5/35 không có jackpot rollback khi void)
 *   - Entries đã void không thể settle lại
 *   - Tickets multi-draw: chỉ entry thuộc kỳ bị void bị ảnh hưởng,
 *     các entries kỳ khác vẫn active
 */

import { UseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

export interface FinalizeVoidResult {
  drawId: string;
  status: string;
  totalVoidedEntries: number;
  totalOriginalAmount: number;
  totalRefundAmount: number;
  completedAt: string;
}

export class FinalizeVoidUseCase extends UseCase<VoidContext, FinalizeVoidResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<FinalizeVoidResult> {
    const { drawId } = input;

    // ── STEP 1: Aggregate tổng kết void từ DB ──
    // Đếm entries đã void, tổng tiền gốc, tổng tiền hoàn
    // Tính từ DB (không dùng accumulator) → crash-safe, idempotent
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    // ── STEP 2: Transition voiding → void + ghi voidSummary ──
    // Atomic: guard status = "voiding" → chỉ update 1 lần
    // voidSummary ghi lên draw document:
    //   totalVoidedEntries, totalOriginalAmount, totalRefundAmount, completedAt
    const updated = await this.drawRepo.voidComplete(drawId, {
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt,
    });

    if (!updated) {
      // Nếu update thất bại, kiểm tra draw đã void chưa (retry case)
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Void) {
        console.log(`Draw ${drawId} already void, skipping transition.`);
      } else {
        throw new Error(`Cannot finalize void draw ${drawId}. Current status: ${draw?.status}`);
      }
    }

    return {
      drawId,
      status: DrawStatus.Void,
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt: completedAt.toISOString(),
    };
  }
}
