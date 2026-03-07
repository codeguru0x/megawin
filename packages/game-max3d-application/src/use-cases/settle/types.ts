/**
 * Max 3D Settle – Shared Types
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
 *   FinalizeSettle → nhận SettleContext (có financials)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 *
 * Max 3D KHÔNG có Jackpot tích lũy → không có isSplitCycle, splitDetails,
 * jackpotOpeningAmount, closingJackpot, hasJackpotWinner.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Max 3D đã công bố — 20 bộ ba số theo 4 giải.
 *
 * Dùng bởi SettleEntries để match boards vs kết quả, xác định tier thắng.
 * Giữ nguyên thứ tự quay gốc (không sort).
 */
export interface Max3dDrawResult {
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
 * Config tài chính cho settle — snapshot từ GlobalConfig (rates).
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 */
export interface Max3dSettleConfig {
  /**
   * Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%).
   * Công ty chỉ được thu SAU khi đã trả giải cố định + commission đại lý.
   * Nếu doanh thu không đủ → actualCompanyTake < companyTake (hoặc = 0).
   */
  companyRate: number;

  /**
   * Tỷ lệ hoa hồng mặc định cho đại lý (0-1).
   * Override per tenant qua TenantConfig.
   */
  defaultCommissionRate: number;
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
 * Max 3D không có Jackpot tích lũy → không có jackpotContribution,
 * closingJackpot, hasJackpotWinner, splitDetails.
 *
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /**
   * Tổng doanh thu kỳ quay (VND) = tổng tiền stake của tất cả entries.
   * Bằng tổng revenue các tenant, aggregate từ DB (không dùng accumulator).
   */
  totalRevenue: number;

  /**
   * Tổng giải thưởng cố định đã trả (VND).
   * VD: 3 người trúng Giải Nhất (15M) = 45.000.000 VND.
   */
  totalFixedPrizes: number;

  /**
   * Tổng hoa hồng đại lý (VND) — commission đã cam kết trả cho tenant/agent.
   * Tính sẵn lúc mua vé (entry.commission.amount), aggregate từ DB.
   */
  totalAgentCommission: number;

  /**
   * Phần công ty được thu tối đa (VND) = companyRate × totalRevenue.
   * Đây là mức trần, thực tế có thể thấp hơn nếu doanh thu không đủ.
   */
  companyTake: number;

  /**
   * Phần công ty thực tế thu được (VND).
   * = min(companyTake, max(remainAfterPrizes, 0))
   * Trong đó: remainAfterPrizes = totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Nếu doanh thu không đủ trả giải + commission → actualCompanyTake = 0.
   */
  actualCompanyTake: number;

  /**
   * Lợi nhuận ròng kỳ quay (VND).
   * = totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Có thể âm nếu giải thưởng vượt doanh thu.
   */
  profit: number;
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
   * Dùng để group các kỳ quay trong cùng ngày.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Max 3D có nhiều kỳ/ngày tuỳ cấu hình.
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 20 bộ ba số theo 4 giải (Đặc biệt, Nhất, Nhì, Ba).
   * SettleEntries dùng để match boards vs kết quả, xác định tier thắng.
   */
  result: Max3dDrawResult;

  /**
   * Cấu hình giải thưởng áp dụng cho kỳ này.
   * Gồm giải thưởng cho 3 chế độ chơi: Basic, Combo, Plus.
   * Snapshot tại thời điểm PrepareSettle — KHÔNG thay đổi giữa các step.
   */
  prizeConfig: {
    /** Giải thưởng chế độ Basic (basic direct/rumble). */
    basic: { special: number; first: number; second: number; third: number };
    /** Giải thưởng chế độ Combo (combo3, combo6). */
    combo: {
      combo3: { special: number; first: number; second: number; third: number };
      combo6: { special: number; first: number; second: number; third: number };
    };
    /** Giải thưởng chế độ Plus (7 giải). */
    plus: {
      special: number;
      first: number;
      second: number;
      third: number;
      fourth: number;
      fifth: number;
      sixth: number;
    };
  };

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm companyRate (từ GlobalConfig.rates), defaultCommissionRate.
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu.
   */
  config: Max3dSettleConfig;

  /**
   * Tổng entries cần settle trong kỳ.
   * Dùng cho thống kê / logging.
   */
  totalEntries: number;

  /**
   * Tổng lines cần settle trong kỳ.
   * Dùng bởi CalculateFinancials để ghi stats lên draw.
   */
  totalLines: number;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy (step 1-3).
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
