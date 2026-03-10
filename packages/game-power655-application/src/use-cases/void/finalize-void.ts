/**
 * Use Case: Finalize Void (Power 6/55)
 *
 * Step cuối của Void Draw Step Function.
 * Pipeline: prepare-void → void-entries → dispatch-refunds → **finalize-void**
 *
 * Tổng kết quá trình void và chuyển draw sang trạng thái cuối cùng (void).
 *
 * LUỒNG XỬ LÝ:
 *   1. Aggregate tổng kết từ entries (totalVoidedEntries, totalRefundAmount)
 *   2. Atomic transition: voiding → void + ghi voidSummary trong 1 DB query
 *      (voidComplete dùng findOneAndUpdate với filter status = voiding)
 *
 * IDEMPOTENT:
 *   - Nếu draw đã ở status = void → log và skip (không throw error)
 *   - Nếu draw ở status khác voiding/void → throw error (state machine bất thường)
 *   - aggregate + voidComplete atomic: gọi lại cho kết quả giống nhau
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

export interface FinalizeVoidResult {
  /** ID kỳ quay đã void. */
  drawId: string;
  /** Trạng thái cuối cùng (luôn = "void"). */
  status: string;
  /** Tổng số entries đã void. */
  totalVoidedEntries: number;
  /** Tổng số tiền đã hoàn (VND). */
  totalRefundAmount: number;
  /** Thời điểm hoàn thành void (ISO string). */
  completedAt: string;
}

/**
 * Kết thúc quy trình void draw: aggregate summary + atomic transition voiding → void.
 *
 * @param input.drawId - ID kỳ quay cần finalize
 * @returns Tổng kết void: số entries, số tiền, thời gian
 */
export class FinalizeVoidUseCase extends InternalUseCase<VoidContext, FinalizeVoidResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<FinalizeVoidResult> {
    const { drawId } = input;

    // ── Bước 1: Load draw hiện tại để lấy voidInfo (reason, voidedBy, voidedAt) ──
    const draw = await this.drawRepo.getDrawById(drawId);

    // ── Bước 2: Aggregate tổng kết void từ entries ───────────────────
    // Đếm entries đã void + tổng refundAmount → ghi vào draw.voidSummary.
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    // ── Bước 3: Atomic transition voiding → void ─────────────────────
    // voidComplete thực hiện findOneAndUpdate với filter { status: "voiding" }:
    // - Chuyển status → void
    // - Ghi voidSummary (totalEntriesVoided, totalRefundAmount, ...)
    // - Trả về null nếu draw không ở status voiding (đã void hoặc status khác)
    const updated = await this.drawRepo.voidComplete(drawId, {
      reason: (draw as any)?.voidInfo?.reason ?? "",
      voidedBy: (draw as any)?.voidInfo?.voidedBy,
      voidedAt: (draw as any)?.voidInfo?.voidedAt ?? completedAt,
      totalEntriesVoided: summary.totalVoidedEntries,
      totalRefundAmount: summary.totalRefundAmount,
      totalRefundDispatched: summary.totalVoidedEntries,
      totalRefundFailed: 0,
    });

    // ── Bước 4: Xử lý idempotency ──────────────────────────────────
    // updated = null → voidComplete không match filter (draw không ở status voiding).
    // Nếu đã void → idempotent skip. Nếu status khác → state machine lỗi → throw.
    if (!updated) {
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
      totalRefundAmount: summary.totalRefundAmount,
      completedAt: completedAt.toISOString(),
    };
  }
}
