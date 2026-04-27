/**
 * Use Case: Finalize Void (Power 6/55)
 *
 * Step cuối của Void Draw Step Function.
 * Pipeline: prepare-void → void-entries → sync-ticket-summaries → **finalize-void** → enqueue-dispatch-refunds
 *
 * Tổng kết quá trình void và chuyển draw sang trạng thái cuối cùng (void).
 *
 * LUỒNG XỬ LÝ:
 *   1. Load draw để lấy voidInfo + check status idempotency
 *   2. Aggregate tổng kết từ entries (totalVoidedEntries, totalOriginalAmount, totalRefundAmount)
 *   3. Atomic transition: voiding → void + ghi voidSummary trong 1 DB query
 *      (voidComplete dùng findOneAndUpdate với filter status = voiding)
 *
 * IDEMPOTENT:
 *   - Nếu draw đã ở status = void → log và skip (không throw error)
 *   - Nếu draw ở status khác voiding/void → throw error (state machine bất thường)
 *   - aggregate + voidComplete atomic: gọi lại cho kết quả giống nhau
 */

import { AppException, InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";
import type { DrawVoidSummary } from "@megawin/game-power655/entities";

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

    // ── Bước 1: Load draw để lấy voidInfo (reason, voidedBy, voidedAt) ─────
    // draw.voidInfo được ghi bởi voidDraw API (PrepareVoid step).
    const draw = await this.drawRepo.getDrawById(drawId);

    // ── Bước 2: Aggregate tổng kết void từ entries ───────────────────────
    // Đếm entries đã void + tổng refundAmount → ghi vào draw.voidSummary.
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    // ── Bước 3: Build DrawVoidSummary đầy đủ từ aggregate ─────────────────
    // draw.voidInfo (ghi lúc PrepareVoid) chứa reason/voidedBy/voidedAt.
    // FinalizeVoid bổ sung các stats từ aggregate entries.
    const voidSummary: DrawVoidSummary = {
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt,
    };

    // ── Bước 4: Atomic transition voiding → void ─────────────────────────
    // voidComplete thực hiện findOneAndUpdate với filter { status: "voiding" }:
    // - Chuyển status → void
    // - Ghi voidSummary đầy đủ (overwrite toàn bộ — set lần đầu duy nhất)
    // - Trả về null nếu draw không ở status voiding
    const updated = await this.drawRepo.voidComplete(drawId, voidSummary);

    // ── Bước 5: Xử lý idempotency ──────────────────────────────────────
    // updated = null → voidComplete không match filter (draw không ở status voiding).
    // Nếu đã void → idempotent skip. Nếu status khác → state machine lỗi → throw.
    if (!updated) {
      if (draw?.status === DrawStatus.Void) {
        console.log(`Draw ${drawId} already void, skipping transition.`);
      } else {
        throw AppException.businessRuleViolation(
          `Cannot finalize void draw ${drawId}. Current status: ${draw?.status}`,
        );
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
