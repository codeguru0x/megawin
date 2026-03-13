/**
 * Lotto 5/35 Void Draw – Shared Types
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
 *   - Jackpot cycle không rollback (theo luật Lotto 5/35)
 *   - Tickets multi-draw: chỉ entry thuộc kỳ bị void bị ảnh hưởng
 */
export interface VoidContext {
  /**
   * Mã kỳ quay bị huỷ — primary key xuyên suốt void flow.
   * Format: "YYYY-MM-DD-NNN" (VD: "2026-02-24-001").
   * Tất cả step dùng drawId để query entries cần void/refund.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay bị huỷ.
   * Dùng cho logging, audit trail, và nhận diện kỳ quay.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày (1 = Morning, 2 = Evening).
   * Dùng cho logging và nhận diện kỳ quay (VD: "Kỳ sáng" vs "Kỳ chiều").
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng cho void report.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildVoidReport dùng field này để upsert void report + publish system daily.
   */
  financialDate: string;
}
