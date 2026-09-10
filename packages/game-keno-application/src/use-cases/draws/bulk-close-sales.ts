import { UseCase } from "@megawin/app-core/use-cases";
import { AUDIT_ACTIONS } from "@megawin/audit/entities";
import { runBulkDrawAction } from "@megawin/game-core-application/use-cases/bulk-draw-action";

import { auditBulkDrawAction } from "../../services/audit-log";
import { CloseSalesUseCase } from "./close-sales";
import type { BulkDrawActionOutput, BulkDrawIdsInput } from "./dto/bulk-draw-action.dto";

/**
 * Đóng bán hàng loạt — {@link CloseSalesUseCase} cho từng kỳ.
 *
 * ĐÂY LÀ ACTION DÙNG NHIỀU NHẤT của Hub: mô hình vận hành mở bán cả ngày rồi chốt sổ theo
 * batch 1 giờ, mỗi batch chạm hàng chục kỳ ở chặng `PendingClose`
 * (`p0-04-bulk-settle-void-api.plan.md` §1.2).
 *
 * Rẻ nhất trong 4 action: `CloseSalesUseCase` chỉ 1 DB write có điều kiện status (repo tự
 * filter `SalesOpen`), KHÔNG đọc draw trước, KHÔNG start SFN. Kỳ không ở `SalesOpen` sẽ nhận
 * `DRAW_INVALID_TRANSITION` từ repo — đúng hành vi idempotent mong muốn.
 */
export class BulkCloseSalesUseCase extends UseCase<BulkDrawIdsInput, BulkDrawActionOutput> {
  private readonly closeSales = new CloseSalesUseCase();

  protected async execute(input: BulkDrawIdsInput): Promise<BulkDrawActionOutput> {
    const output = await runBulkDrawAction(input.drawIds, async (drawId) => {
      await this.closeSales.run({ drawId, actor: input.actor });
    });

    auditBulkDrawAction({
      action: AUDIT_ACTIONS.draw.bulkCloseSales,
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
