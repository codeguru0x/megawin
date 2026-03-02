/**
 * Use Case: Prepare Void (Lotto 5/35)
 *
 * Step 1 của Void Draw Step Function.
 * Validate draw ở trạng thái cho phép void (salesClosed) và chưa settle.
 * Load context: draw info, tổng entries cần void.
 *
 * Quy tắc:
 *   - Draw PHẢI ở trạng thái "salesClosed" (đã đóng bán, chưa settle).
 *   - Draw đã settled hoặc đang settling KHÔNG được void.
 *   - Entries đã settled KHÔNG được void (chỉ void scheduled).
 *
 * IDEMPOTENT: chỉ đọc dữ liệu.
 */

import { StepFunctionUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface PrepareVoidInput {
  /** Mã kỳ quay cần void. */
  drawId: string;
  /** Lý do huỷ kỳ quay (hiển thị trong audit log). */
  reason: string;
  /** Người thực hiện void (admin username, optional). */
  voidedBy?: string;
}

export interface PrepareVoidResult {
  /** Mã kỳ quay. */
  drawId: string;
  /** Ngày quay (YYYY-MM-DD). */
  drawDate: string;
  /** Số thứ tự kỳ trong ngày. */
  drawNo: number;
  /** Lý do huỷ. */
  reason: string;
  /** Người thực hiện void. */
  voidedBy?: string;
  /** Trạng thái trước khi void (salesClosed hoặc published). */
  previousStatus: string;
  /** Tổng entries có thể void (status = scheduled). */
  totalVoidableEntries: number;
}

export class PrepareVoidUseCase extends StepFunctionUseCase<
  PrepareVoidInput,
  PrepareVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

  /** Validate draw + transition → void. Throw nếu không hợp lệ. */
  protected async execute(input: PrepareVoidInput): Promise<PrepareVoidResult> {
    const { drawId, reason, voidedBy } = input;
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw new Error(`Draw ${drawId} không tồn tại.`);
    }

    const VOIDABLE_STATUSES = new Set([
      DrawStatus.SalesClosed,
      DrawStatus.Published,
    ]);

    if (!VOIDABLE_STATUSES.has(draw.status as any)) {
      throw new Error(
        `Draw ${drawId} status = "${draw.status}" – chỉ void được khi ở salesClosed/published.`
      );
    }

    const updated = await this.drawRepo.voidDraw(drawId, draw.status, {
      reason,
      voidedBy,
      voidedAt: new Date(),
    });

    if (!updated) {
      throw new Error(
        `Draw ${drawId} transition → void thất bại (race condition).`
      );
    }

    const totalVoidableEntries =
      await this.entryRepo.countVoidableEntries(drawId);

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      reason,
      voidedBy,
      previousStatus: draw.status,
      totalVoidableEntries,
    };
  }
}
