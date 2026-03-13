/**
 * Mega 6/45 Void Draw – Shared Types
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
 *   DispatchRefunds → nhận VoidContext, trả done/false (loop)
 *   FinalizeVoid → nhận VoidContext
 *
 * Void flow đơn giản hơn settle: không có financial calculation,
 * không có jackpot, không có split. Tất cả step chỉ cần drawId
 * và metadata cơ bản của draw.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareVoid         → VoidContext                               │
 * │ VoidEntries         ← VoidContext (loop, batch void entries)    │
 * │ SyncTicketSummaries ← VoidContext (loop, recompute tickets)     │
 * │ DispatchRefunds     ← VoidContext (loop, gửi refund tenant)    │
 * │ FinalizeVoid        ← VoidContext (transition → void)           │
 * └──────────────────────────────────────────────────────────────────┘
 */

/**
 * Context duy nhất xuyên suốt void pipeline.
 *
 * PrepareVoid tạo context, tất cả step sau nhận cùng 1 object.
 * Step Function dùng 1 biến `$voidCtx` — mỗi step destructure fields cần dùng.
 *
 * Void flow KHÔNG ảnh hưởng Jackpot cycle:
 *   - Entries bị void → hoàn 100% tiền cược
 *   - Jackpot cycle không rollback (theo luật Mega 6/45)
 *   - Tickets multi-draw: chỉ entry thuộc kỳ bị void bị ảnh hưởng
 */
export interface VoidContext {
  /**
   * Mã kỳ quay bị huỷ — primary key xuyên suốt void flow.
   * Tất cả step dùng drawId để query entries cần void/refund.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay bị huỷ.
   * Dùng cho logging, audit trail, và nhận diện kỳ quay.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Dùng cho logging và nhận diện kỳ quay.
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildVoidReport và PublishSettleDaily dùng field này.
   */
  financialDate: string;
}
