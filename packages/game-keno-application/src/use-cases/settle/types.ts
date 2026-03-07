/**
 * Keno Settle – Shared Types
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
 *   ApplyPayoutCaps → nhận SettleContext
 *   SyncTicketSummaries → nhận SettleContext
 *   CalculateFinancials → nhận SettleContext, trả SettleFinancials
 *     → Step Function merge: settleCtx.financials = result
 *   BuildReport → nhận SettleContext (có financials)
 *   FinalizeSettle → nhận SettleContext (có financials)
 *   DispatchPayouts → nhận SettleContext
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type { BigSmallPrizes, EvenOddPrizes, PayoutCaps } from "@megawin/game-keno/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Keno — output PrepareSettle, input SettleEntries.
 * Mapping 1:1 với DrawResultForMatch của helpers layer.
 */
export interface KenoDrawResult {
  /** 20 số trúng (string[], ví dụ ["03", "12", "25", ...]). */
  winningNumbers: string[];
  /** Số lượng số "lớn" (41-80) trong 20 số quay. */
  bigCount: number;
  /** Số lượng số "nhỏ" (1-40) trong 20 số quay. */
  smallCount: number;
  /** Số lượng số chẵn trong 20 số quay. */
  evenCount: number;
  /** Số lượng số lẻ trong 20 số quay. */
  oddCount: number;
}

/**
 * Config settle — output PrepareSettle, dùng bởi nhiều steps.
 *
 * Chứa tất cả config cần thiết cho settle flow:
 *   - companyRate         → CalculateFinancials (tính phần công ty)
 *   - basicPrizes         → SettleEntries (tra bảng giải) + ApplyPayoutCaps (lấy fixedPrize)
 *   - bigSmallPrizes      → SettleEntries (match side bet Lớn/Nhỏ)
 *   - evenOddPrizes       → SettleEntries (match side bet Chẵn/Lẻ)
 *   - payoutCaps          → ApplyPayoutCaps (giới hạn trả thưởng bậc 8/9/10)
 */
export interface KenoSettleConfig {
  /** Tỷ lệ phần công ty (0–1). Ví dụ: 0.15 = 15%. */
  companyRate: number;
  /** Bảng giải thưởng cách chơi cơ bản. Key: "pick{N}", Value: { matchCount (string): prize }. */
  basicPrizes: Record<string, Record<string, number>>;
  /** Bảng giải thưởng side bet Lớn/Nhỏ (VND). */
  bigSmallPrizes: BigSmallPrizes;
  /** Bảng giải thưởng side bet Chẵn/Lẻ (VND). */
  evenOddPrizes: EvenOddPrizes;
  /**
   * Giới hạn trả thưởng mỗi kỳ cho bậc 8/9/10 theo quy tắc Vietlott.
   * Khi tổng số bộ trúng top prize > maxSetsForFixed → chia đều maxPerDraw.
   */
  payoutCaps: PayoutCaps;
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
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /** Tổng doanh thu = Σ(entry.amount) không void (VND). */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) entries thắng (VND). */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant commission) (VND). */
  totalAgentCommission: number;
  /** Phần công ty = Math.round(totalRevenue × companyRate) (VND). */
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
 * │ SettleEntries       ← SettleContext (loop)                      │
 * │ ApplyPayoutCaps     ← SettleContext                             │
 * │ SyncTicketSummaries ← SettleContext (loop)                      │
 * │ CalculateFinancials ← SettleContext → SettleFinancials           │
 * │   ↳ SFN merge: settleCtx.financials = result                   │
 * │ BuildReport         ← SettleContext (financials có)              │
 * │ FinalizeSettle      ← SettleContextWithFinancials (bắt buộc)   │
 * │ DispatchPayouts     ← SettleContext                             │
 * └──────────────────────────────────────────────────────────────────┘
 */
export interface SettleContext {
  /**
   * Mã kỳ quay duy nhất — primary key xuyên suốt settle flow.
   * Tất cả step dùng drawId để query entries, draw document.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay.
   * Dùng để group các kỳ quay trong cùng ngày.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Keno quay mỗi 10 phút (~96 kỳ/ngày).
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 20 số trúng + thống kê lớn/nhỏ/chẵn/lẻ.
   * SettleEntries dùng để match boards + side bets vs kết quả quay.
   */
  result: KenoDrawResult;

  /**
   * Cấu hình settle — snapshot từ GlobalConfig tại thời điểm PrepareSettle.
   * Gồm companyRate, basicPrizes, bigSmallPrizes, evenOddPrizes, payoutCaps.
   * Config snapshot KHÔNG thay đổi giữa các step.
   */
  config: KenoSettleConfig;

  /**
   * Tổng số entries thuộc kỳ quay — đếm từ DB tại PrepareSettle.
   * Dùng cho logging/monitoring (biết khối lượng xử lý).
   */
  totalEntries: number;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * BuildReport và FinalizeSettle truy cập financials qua field này.
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
