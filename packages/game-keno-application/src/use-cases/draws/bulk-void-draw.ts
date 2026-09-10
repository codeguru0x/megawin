import { UseCase } from "@megawin/app-core/use-cases";
import { AUDIT_ACTIONS } from "@megawin/audit/entities";
import { runBulkDrawAction } from "@megawin/game-core-application/use-cases/bulk-draw-action";

import { auditBulkDrawAction } from "../../services/audit-log";
import type { BulkDrawActionOutput, BulkVoidDrawInput } from "./dto/bulk-draw-action.dto";
import { VoidDrawUseCase } from "./void-draw";

/**
 * Huỷ kỳ hàng loạt — {@link VoidDrawUseCase} cho từng kỳ, MỘT `reason` áp cho cả lô.
 *
 * Không cho nhập lý do từng kỳ: UI sẽ rối, và lý do void hàng loạt về bản chất là một
 * (sự cố hệ thống, sai kết quả nguồn…).
 *
 * RÀNG BUỘC DOMAIN: `salesOpen` KHÔNG void được (`isVoidable` không nhận status này) → kỳ ở
 * chặng `PendingClose` sẽ trả `DRAW_INVALID_TRANSITION`. Đây là ĐÚNG nghiệp vụ (void trong
 * lúc vé vẫn đang vào là nguy hiểm); FE phải chặn trước bằng `isVoidable` và gợi ý chuỗi
 * "Đóng bán → Huỷ kỳ" (`p0-04-bulk-settle-void-api.plan.md` §1.3). Use-case này KHÔNG lọc
 * trước theo `isVoidable` — mỗi kỳ vẫn đi qua đúng `VoidDrawUseCase`, kỳ không hợp lệ tự
 * trả lỗi đúng như FE đã cảnh báo, không âm thầm bỏ qua.
 */
export class BulkVoidDrawUseCase extends UseCase<BulkVoidDrawInput, BulkDrawActionOutput> {
  private readonly voidDraw = new VoidDrawUseCase();

  protected async execute(input: BulkVoidDrawInput): Promise<BulkDrawActionOutput> {
    const output = await runBulkDrawAction(input.drawIds, async (drawId) => {
      await this.voidDraw.run({
        drawId,
        reason: input.reason,
        actor: input.actor,
        KENO_VOID_SFN_ARN: input.KENO_VOID_SFN_ARN,
      });
    });

    auditBulkDrawAction({
      action: AUDIT_ACTIONS.draw.bulkVoid,
      actor: input.actor,
      // `output.results` — KHÔNG `input.drawIds`: runner dedupe nội bộ nên `input.drawIds` có
      // thể dài hơn `successCount + failureCount` → audit ghi "50 kỳ" mà tổng chỉ 48.
      drawIds: output.results.map((r) => r.drawId),
      successCount: output.successCount,
      failureCount: output.failureCount,
      reason: input.reason,
    });

    return output;
  }
}
