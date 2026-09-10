import type { AuditActor } from "@megawin/audit/logger";

// ─────────────────────────────────────────────
// Bulk draw actions — settle / close-sales / open-sales
// (Bingo18 Hub KHÔNG có bulk-void — xem p1-04 §6.4)
//
// CHỈ input types đặc thù Bingo18 ở đây. `BulkDrawActionResult`/`BulkDrawActionOutput` (shape
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
  /** ARN của Step Function kết sổ Bingo18 — truyền thẳng cho `TriggerSettleUseCase` mỗi kỳ. */
  SETTLE_SFN_ARN: string;
}
