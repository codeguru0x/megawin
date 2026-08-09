/**
 * Use Case: Finalize Void (Mega 6/45)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, transition voiding → void + ghi voidSummary (1 atomic query).
 *
 * IDEMPOTENT: voidComplete dùng filter status=voiding → nếu draw đã void, không update.
 * Crash recovery: kiểm tra status sau khi update trả false → nếu đã void thì bỏ qua.
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";

import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";
import type { VoidContext } from "./types";

/**
 * Kết quả trả về sau khi hoàn tất Finalize Void.
 * Ghi vào output của Step Function, dùng cho audit trail và logging.
 */
export interface FinalizeVoidResult {
  /** ID kỳ quay đã huỷ. */
  drawId: string;
  /** Trạng thái draw sau khi finalize — luôn là "void". */
  status: string;
  /** Tổng số entry đã bị void trong kỳ quay. */
  totalVoidedEntries: number;
  /** Tổng số tiền cược gốc (VND). Công thức: Σ(entry.voidInfo.originalAmount). */
  totalOriginalAmount: number;
  /**
   * Tổng số tiền đã hoàn trả cho player (VND).
   * Công thức: Σ(entry.voidInfo.refundAmount).
   * Thông thường bằng totalOriginalAmount (hoàn 100%).
   */
  totalRefundAmount: number;
  /** Thời điểm hoàn tất void (ISO 8601). */
  completedAt: string;
}

/**
 * Use Case: Finalize Void (Mega 6/45)
 *
 * Step cuối của Void Draw Step Function.
 * Aggregate tổng kết void từ DB, transition voiding → void + ghi voidSummary (1 atomic query).
 *
 * IDEMPOTENT: voidComplete dùng filter status=voiding → nếu draw đã void, không update.
 * Crash recovery: kiểm tra status sau khi update trả false → nếu đã void thì bỏ qua.
 */
export class FinalizeVoidUseCase extends InternalUseCase<VoidContext, FinalizeVoidResult> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  protected async execute(input: VoidContext): Promise<FinalizeVoidResult> {
    const { drawId } = input;

    // Aggregate từ DB thay vì tính từ payload Step Function
    // để đảm bảo số liệu chính xác (entry có thể failed, skipped).
    const summary = await this.entryRepo.aggregateVoidRefundSummary(drawId);
    const completedAt = new Date();

    // Atomic transition voiding → void + ghi voidSummary trong 1 DB call.
    // voidComplete dùng filter { status: voiding } → idempotent khi retry.
    const updated = await this.drawRepo.voidComplete(drawId, {
      totalVoidedEntries: summary.totalVoidedEntries,
      totalOriginalAmount: summary.totalOriginalAmount,
      totalRefundAmount: summary.totalRefundAmount,
      completedAt,
    });

    if (!updated) {
      // updated=false: draw không còn ở status voiding → có thể đã void (crash recovery).
      // Fetch lại để xác nhận: nếu đã void thì idempotent skip, còn trạng thái khác → lỗi thật.
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
