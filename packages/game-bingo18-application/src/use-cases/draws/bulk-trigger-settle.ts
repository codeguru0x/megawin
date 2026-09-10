import { UseCase } from "@megawin/app-core/use-cases";
import { AUDIT_ACTIONS } from "@megawin/audit/entities";
import { runBulkDrawAction } from "@megawin/game-core-application/use-cases/bulk-draw-action";

import { auditBulkDrawAction } from "../../services/audit-log";
import type { BulkDrawActionOutput, BulkTriggerSettleInput } from "./dto/bulk-draw-action.dto";
import { TriggerSettleUseCase } from "./trigger-settle";

/**
 * Kết sổ hàng loạt — chạy {@link TriggerSettleUseCase} cho từng kỳ qua `runBulkDrawAction`.
 *
 * KHÔNG nhân bản logic settle: mỗi kỳ đi qua ĐÚNG use-case đơn, giữ nguyên các lớp chống
 * double-trigger (CAS status + deterministic SFN execution name). Bulk chỉ điều phối.
 *
 * Ghi 1 audit CẤP LÔ (`draw.bulk_settle`) sau khi chạy xong — không trùng audit per-draw mà
 * `TriggerSettleUseCase` đã tự ghi ở lần transition thật.
 */
export class BulkTriggerSettleUseCase extends UseCase<BulkTriggerSettleInput, BulkDrawActionOutput> {
  private readonly triggerSettle = new TriggerSettleUseCase();

  protected async execute(input: BulkTriggerSettleInput): Promise<BulkDrawActionOutput> {
    const output = await runBulkDrawAction(input.drawIds, async (drawId) => {
      await this.triggerSettle.run({
        drawId,
        SETTLE_SFN_ARN: input.SETTLE_SFN_ARN,
        actor: input.actor,
      });
    });

    auditBulkDrawAction({
      action: AUDIT_ACTIONS.draw.bulkSettle,
      actor: input.actor,
      // `output.results` — KHÔNG `input.drawIds`: runner dedupe nội bộ nên `input.drawIds` có
      // thể dài hơn `successCount + failureCount` → audit ghi "50 kỳ" mà tổng chỉ 48.
      drawIds: output.results.map((r) => r.drawId),
      successCount: output.successCount,
      failureCount: output.failureCount,
    });

    return output;
  }
}
