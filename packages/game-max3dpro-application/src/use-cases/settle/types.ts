/**
 * Max 3D Pro Settle – Shared Types
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH cho toàn bộ settle pipeline.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `SettleContext` là context duy nhất xuyên suốt settle flow, được enrich
 * dần qua các step. Step Function chỉ dùng 1 biến `$settleCtx`:
 *
 *   PrepareSettle → output = SettleContext (chưa có financials)
 *   SettleEntries → nhận SettleContext, trả done/false (loop)
 *   SyncTicketSummaries → nhận SettleContext
 *   CalculateFinancials → nhận SettleContext, trả SettleFinancials
 *     → Step Function merge: settleCtx.financials = result
 *   BuildReport → nhận SettleContext (có financials)
 *   FinalizeSettle → nhận SettleContextWithFinancials (financials bắt buộc)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type { Max3dproDrawResult, Max3dproPrizeConfig } from "@megawin/game-max3dpro/entities";

/** Re-export với tên chuẩn hoá PascalCase cho settle layer. */
export type {
  Max3dproDrawResult as Max3dProDrawResult,
  Max3dproPrizeConfig as Max3dProPrizeConfig,
};

// ─────────────────────────────────────────────────────────────────────────────
// SettleFinancials – output CalculateFinancials, nested vào SettleContext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả tính toán tài chính kỳ quay — output của CalculateFinancials.
 *
 * Sau khi CalculateFinancials hoàn thành, Step Function merge kết quả này
 * vào `settleCtx.financials`. Các step sau truy cập qua `ctx.financials`.
 *
 * Max 3D Pro KHÔNG có Jackpot tích lũy → không có jackpotContribution.
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /** Tổng doanh thu kỳ quay (VND) = tổng tiền stake của tất cả entries. */
  totalRevenue: number;
  /** Tổng giải thưởng cố định đã trả (VND). */
  totalFixedPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty thu = revenue - prizes - commission. Có thể âm (công ty chịu lỗ). */
  companyTake: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// SettleContext – single context xuyên suốt settle pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context duy nhất xuyên suốt settle pipeline — progressively enriched.
 *
 * PrepareSettle tạo context ban đầu (không có `financials`).
 * Sau CalculateFinancials, Step Function merge `financials` vào context.
 * Từ đó tất cả step sau đều nhận SettleContext ĐÃ CÓ `financials`.
 *
 * Step Function chỉ dùng 1 biến `$settleCtx` — không cần `$financials` riêng.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareSettle       → SettleContext (financials = undefined)     │
 * │ SettleEntries       ← SettleContext                              │
 * │ SyncTicketSummaries ← SettleContext                              │
 * │ CalculateFinancials ← SettleContext → SettleFinancials           │
 * │   ↳ SFN merge: settleCtx.financials = result                    │
 * │ BuildReport         ← SettleContext (financials có)              │
 * │ FinalizeSettle      ← SettleContextWithFinancials (bắt buộc)    │
 * │ DispatchPayouts     ← { drawId } (package riêng)                │
 * └──────────────────────────────────────────────────────────────────┘
 */
export interface SettleContext {
  /**
   * Mã kỳ quay duy nhất — primary key xuyên suốt settle flow.
   * Tất cả step dùng drawId để query entries, lines, draw document.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay.
   * Dùng cho logging, audit trail, nhận diện kỳ quay.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Max 3D Pro có nhiều kỳ quay trong ngày (khác với lotto chỉ 2 kỳ).
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 20 bộ ba số theo 4 giải.
   * SettleEntries dùng để match pairs vs kết quả, xác định tier thắng.
   */
  result: Max3dproDrawResult;

  /**
   * Cấu hình giải thưởng áp dụng cho kỳ này — snapshot tại thời điểm settle.
   * Dùng bởi SettleEntries để tính winAmount cho mỗi pair.
   */
  prizeConfig: Max3dproPrizeConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * Các step sau truy cập financials qua field này.
   *
   * FinalizeSettle YÊU CẦU financials bắt buộc (dùng SettleContextWithFinancials).
   */
  financials?: SettleFinancials;
}

/**
 * SettleContext với financials BẮT BUỘC — dùng cho các step SAU CalculateFinancials
 * mà CẦN financials để hoạt động (FinalizeSettle).
 *
 * Tại runtime, Step Function đảm bảo financials đã được merge trước khi
 * gọi các step này. Type này cung cấp compile-time safety.
 */
export type SettleContextWithFinancials = SettleContext & {
  financials: SettleFinancials;
};
