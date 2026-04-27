/**
 * Keno Void Draw – Shared Types
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH cho toàn bộ void pipeline.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `VoidContext` là context duy nhất xuyên suốt void flow.
 * Step Function chỉ dùng 1 biến `$voidCtx`:
 *
 *   PrepareVoid → output = VoidContext
 *   VoidEntries → nhận VoidContext, trả done/false (loop)
 *   SyncTicketSummaries → nhận VoidContext
 *   FinalizeVoid → nhận VoidContext
 *   EnqueueDispatchRefunds → nhận { drawId } (bulk enqueue outbox, chạy sau finalize)
 *
 * Void flow đơn giản hơn settle: không có financial calculation,
 * không có jackpot, không có payout caps. Tất cả step chỉ cần drawId
 * và metadata cơ bản của draw.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareVoid           → VoidContext                               │
 * │ VoidEntries           ← VoidContext (loop, batch void entries)    │
 * │ SyncTicketSummaries   ← VoidContext (loop, recompute tickets)     │
 * │ FinalizeVoid          ← VoidContext (transition → void)           │
 * │ EnqueueDispatchRefunds ← { drawId } (bulk enqueue outbox)         │
 * └──────────────────────────────────────────────────────────────────┘
 */

/**
 * Context duy nhất xuyên suốt void pipeline.
 *
 * PrepareVoid tạo context, tất cả step sau nhận cùng 1 object.
 * Step Function dùng 1 biến `$voidCtx` — mỗi step destructure fields cần dùng.
 *
 * Void flow KHÔNG ảnh hưởng giải thưởng hay Jackpot (Keno không có Jackpot):
 *   - Entries bị void → hoàn 100% tiền cược
 *   - Tickets multi-draw: chỉ entry thuộc kỳ bị void bị ảnh hưởng
 */
export interface VoidContext {
  /**
   * Mã kỳ quay bị huỷ — primary key xuyên suốt void flow.
   * Tất cả step dùng drawId để query entries cần void/refund.
   */
  drawId: string;

  /**
   * Ngày tài chính (YYYY-MM-DD) của kỳ quay bị huỷ.
   * Dùng cho BuildVoidReport để ghi report đúng financialDate.
   */
  financialDate: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay bị huỷ.
   * Dùng cho logging, audit trail, và nhận diện kỳ quay.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Keno quay mỗi 8 phút (~120 kỳ/ngày).
   * Dùng cho logging và nhận diện kỳ quay.
   */
  drawNo: number;
}
