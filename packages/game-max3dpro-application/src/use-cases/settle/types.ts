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

import type { PrizeAmounts } from "@megawin/game-max3dpro/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Max 3D Pro — 20 bộ ba số theo 4 giải.
 *
 * Mỗi giải gồm các bộ ba số (triplet) 3 chữ số ("000"-"999").
 * SettleEntries dùng để match pairs vs kết quả, xác định tier thắng.
 */
export interface Max3dProDrawResult {
  /** Giải Đặc biệt: 2 bộ ba số. */
  special: [string, string];
  /** Giải Nhất: 4 bộ ba số. */
  first: [string, string, string, string];
  /** Giải Nhì: 6 bộ ba số. */
  second: [string, string, string, string, string, string];
  /** Giải Ba: 8 bộ ba số. */
  third: [string, string, string, string, string, string, string, string];
}

/**
 * Config tài chính cho settle — snapshot từ GlobalConfig.
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 */
export interface Max3dProSettleConfig {
  /** Tỷ lệ công ty thu về trên tổng doanh thu (0-1, VD: 0.15 = 15%). */
  companyRate: number;
  /** Tỷ lệ hoa hồng đại lý mặc định (0-1). */
  defaultCommissionRate: number;
}

/**
 * Cấu hình giải thưởng Max 3D Pro — snapshot tại thời điểm settle.
 *
 * Dùng bởi SettleEntries để tính winAmount cho mỗi pair.
 */
export interface Max3dProPrizeConfig {
  /** Giải thưởng chế độ Standard (8 giải: special → sixth). */
  standard: PrizeAmounts;
}

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
  /** Phần công ty được thu tối đa (VND) = companyRate × totalRevenue. */
  companyTake: number;
  /** Phần công ty thực tế thu được (VND) = totalRevenue − totalFixedPrizes − totalAgentCommission. */
  actualCompanyTake: number;
  /** Lợi nhuận kỳ quay (VND) = actualCompanyTake. */
  profit: number;
  /** Chi tiết tài chính theo từng tenant. */
  tenantBreakdown: Array<{
    /** ID tenant. */
    tenantId: string;
    /** Doanh thu từ tenant (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng (0-1). */
    commissionRate: number;
    /** Số entries của tenant. */
    entryCount: number;
  }>;
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
  result: Max3dProDrawResult;

  /**
   * Cấu hình giải thưởng áp dụng cho kỳ này — snapshot tại thời điểm settle.
   * Dùng bởi SettleEntries để tính winAmount cho mỗi pair.
   */
  prizeConfig: Max3dProPrizeConfig;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm companyRate và defaultCommissionRate.
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu.
   */
  config: Max3dProSettleConfig;

  /**
   * Tổng entries cần settle trong kỳ — đếm từ DB lúc PrepareSettle.
   * Dùng cho logging, progress tracking.
   */
  totalEntries: number;

  /**
   * Tổng pairs (lines) cần settle — đếm từ DB lúc PrepareSettle.
   * Dùng bởi CalculateFinancials để cập nhật stats trên draw document.
   */
  totalLines: number;

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
