import type { AuditActor } from "@megawin/audit/logger";

// ─────────────────────────────────────────────
// Bulk draw actions — settle / void / close-sales / open-sales
//
// CHỈ input types đặc thù Keno ở đây. `BulkDrawActionResult`/`BulkDrawActionOutput` (shape
// kết quả, giống hệt mọi game) sống ở `@megawin/game-core-application/use-cases/bulk-draw-action`
// — re-export lại dưới đây để caller không phải import 2 nơi.
// ─────────────────────────────────────────────

export type {
  BulkDrawActionOutput,
  BulkDrawActionResult,
} from "@megawin/game-core-application/use-cases/bulk-draw-action";

/** Input dùng chung cho bulk-settle / bulk-close-sales / bulk-open-sales — chỉ cần danh sách kỳ. */
export interface BulkDrawIdsInput {
  drawIds: string[];
  /** Chủ thể thực hiện — dùng cho audit cấp lô. */
  actor: AuditActor;
}

/** Input cho bulk-settle — kèm ARN của Settle Step Function (giống use-case đơn). */
export interface BulkTriggerSettleInput extends BulkDrawIdsInput {
  /** ARN của Step Function kết sổ Keno — truyền thẳng cho `TriggerSettleUseCase` mỗi kỳ. */
  SETTLE_SFN_ARN: string;
}

/** Input cho bulk-void — thêm 1 `reason` áp cho toàn lô + ARN của Void Step Function. */
export interface BulkVoidDrawInput extends BulkDrawIdsInput {
  reason: string;
  /** ARN của Step Function huỷ kỳ Keno — truyền thẳng cho `VoidDrawUseCase` mỗi kỳ. */
  KENO_VOID_SFN_ARN: string;
}
