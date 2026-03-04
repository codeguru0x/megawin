import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryRepository } from "../../infras/repos/entry-repo";

export interface PrepareVoidInput {
  /** ID kỳ quay cần huỷ. */
  drawId: string;
  /** Lý do huỷ kỳ quay. */
  reason: string;
  /** Người thực hiện huỷ (admin username, tuỳ chọn). */
  voidedBy?: string;
}

export interface PrepareVoidResult {
  /** ID kỳ quay đã chuyển sang trạng thái void. */
  drawId: string;
  /** Ngày quay thưởng (ISO date). */
  drawDate: string;
  /** Số thứ tự kỳ quay. */
  drawNo: number;
  /** Lý do huỷ. */
  reason: string;
  /** Người thực hiện huỷ. */
  voidedBy?: string;
  /** Trạng thái trước khi huỷ (salesClosed / published). */
  previousStatus: string;
  /** Tổng số entry có thể hoàn tiền (status = scheduled). */
  totalVoidableEntries: number;
}

export class PrepareVoidUseCase extends InternalUseCase<
  PrepareVoidInput,
  PrepareVoidResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryRepo = new EntryRepository();

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
