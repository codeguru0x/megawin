/**
 * Power 6/55 Settle – Shared Types
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
 *   CalculateFinancials → nhận SettleContext, trả SettleFinancials
 *     → Step Function merge: settleCtx.financials = result
 *   ApplySplitBonuses → nhận SettleContext (có financials)
 *   SyncTicketSummaries → nhận SettleContext
 *   BuildReport → nhận SettleContext (có financials)
 *   FinalizeSettle → nhận SettleContextWithFinancials (financials bắt buộc)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Power 6/55 có DUAL JACKPOT (JP1: 6/6, JP2: 5/6 + bonus).
 * Tất cả types đều có jp1/jp2 fields thay vì single jackpot.
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Power 6/55 đã công bố — dùng cho match lines ở SettleEntries.
 *
 * Gồm 6 số chính (từ tập 1-55) và 1 số bonus (từ 49 số còn lại).
 * Các số ở dạng string zero-padded ("01"-"55").
 */
export interface PowerDrawResult {
  /**
   * 6 số chính trúng thưởng — string zero-padded ("01"-"55").
   * Giữ nguyên thứ tự quay gốc (không sort).
   * Dùng để match với selection của player qua Set intersection.
   */
  winningMain: string[];

  /**
   * Số bonus trúng thưởng — string zero-padded ("01"-"55").
   * Được rút từ 49 số còn lại sau khi rút 6 số chính.
   * Match riêng biệt cho Jackpot 2 (5/6 + bonus).
   */
  bonusNumber: string;
}

/**
 * Config tài chính cho settle — snapshot từ JackpotCycle và GlobalConfig.
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 *
 * Power 6/55 có dual jackpot nên config chứa params riêng cho JP1 và JP2.
 */
export interface PowerSettleConfig {
  /**
   * Số tiền khởi điểm Jackpot 1 khi bắt đầu cycle mới (VND).
   * Khi reset JP1 (có winner hoặc split), cycle mới bắt đầu từ giá trị này.
   */
  jp1SeedAmount: number;

  /**
   * Số tiền khởi điểm Jackpot 2 khi bắt đầu cycle mới (VND).
   * Khi reset JP2 (có winner hoặc split), cycle mới bắt đầu từ giá trị này.
   */
  jp2SeedAmount: number;

  /**
   * Tỷ lệ đóng góp vào Jackpot 1 từ jackpot contribution (0-1).
   * VD: 0.6 = 60% jackpotContribution đổ vào JP1.
   */
  jp1Ratio: number;

  /**
   * Tỷ lệ đóng góp vào Jackpot 2 từ jackpot contribution (0-1).
   * VD: 0.4 = 40% jackpotContribution đổ vào JP2.
   * jp1Ratio + jp2Ratio = 1.
   */
  jp2Ratio: number;

  /**
   * Ngưỡng tràn Jackpot 1 (VND) — khi JP1 vượt ngưỡng, phần dư chuyển sang JP2.
   * VD: 300.000.000.000 (300 tỷ).
   */
  jp1OverflowThreshold: number;

  /**
   * Ngưỡng kích hoạt chia giải (VND) — khi tổng JP1 + JP2 >= threshold.
   * Chỉ chia ở kỳ Evening (drawNo cuối cùng trong ngày).
   */
  splitThreshold: number;

  /**
   * Tỷ lệ chia Jackpot cho từng tier khi split.
   * Chỉ tier1-tier3 tham gia chia (Power 6/55 có 3 tier cố định).
   */
  splitRatios: {
    tier1: number;
    tier2: number;
    tier3: number;
  };

  /**
   * Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%).
   * Công ty chỉ được thu SAU khi đã trả giải cố định + commission đại lý.
   */
  companyRate: number;

  /**
   * Tỷ lệ hoa hồng mặc định cho đại lý (0-1).
   * Override per tenant qua TenantConfig.
   */
  defaultCommissionRate: number;
}

/**
 * Chi tiết phân bổ split cho 1 tier — thông tin thưởng Jackpot chia cho
 * những người trúng tier đó trong kỳ split.
 *
 * Dùng chung giữa CalculateFinancials (tính), ApplySplitBonuses (patch entry),
 * FinalizeSettle (ghi vào cycle close record).
 */
export interface PowerSplitTierDetail {
  /**
   * Số tiền ban đầu phân cho tier (VND).
   * Công thức: totalSplitAmount × (splitRatio[tier] / totalRatios).
   */
  initialAmount: number;

  /**
   * Số tiền tái phân bổ từ các tier không có winner (VND).
   * Khi tier A không có winner → phần tiền tier A chia cho các tier có winner.
   */
  redistributedAmount: number;

  /**
   * Tổng tiền tier nhận (VND) = initialAmount + redistributedAmount.
   * Đây là pool tiền để chia cho tất cả winner của tier này.
   */
  totalAmount: number;

  /** Số người trúng tier này trong kỳ quay. */
  winnerCount: number;

  /**
   * Tiền thưởng Jackpot mỗi người nhận (VND) = totalAmount / winnerCount.
   * Làm tròn xuống. Tier cao nhất (có winner) nhận phần dư.
   */
  bonusPerWinner: number;
}

/**
 * Chi tiết phân bổ split toàn bộ — key = tier name (tier1-tier3), value = thông tin phân bổ.
 *
 * Chỉ tồn tại khi:
 * - isSplitCycle = true (tổng JP1 + JP2 >= splitThreshold)
 * - Không có jackpot1 winner VÀ không có jackpot2 winner
 * - Có ít nhất 1 winner tier1-tier3
 *
 * Nếu không có ai trúng tier1-tier3 → splitDetails = undefined.
 */
export type PowerSplitDetails = Record<string, PowerSplitTierDetail>;

// ─────────────────────────────────────────────────────────────────────────────
// SettleFinancials – output CalculateFinancials, nested vào SettleContext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả tính toán tài chính kỳ quay — output của CalculateFinancials.
 *
 * Sau khi CalculateFinancials hoàn thành, Step Function merge kết quả này
 * vào `settleCtx.financials`. Các step sau truy cập qua `ctx.financials`.
 *
 * Power 6/55 có dual jackpot — các field tài chính tách riêng JP1 và JP2.
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /**
   * Tổng doanh thu kỳ quay (VND) = tổng tiền stake của tất cả entries.
   * Bằng tổng revenue các tenant, aggregate từ DB.
   */
  totalRevenue: number;

  /**
   * Tổng giải thưởng cố định đã trả (VND) — tier1 đến tier3.
   * KHÔNG bao gồm Jackpot 1 và Jackpot 2 (xử lý riêng qua split/winner flow).
   */
  totalFixedPrizes: number;

  /**
   * Tổng hoa hồng đại lý (VND) — commission đã cam kết trả cho tenant/agent.
   * Tính sẵn lúc mua vé, aggregate từ DB.
   */
  totalAgentCommission: number;

  /**
   * Phần công ty được thu tối đa (VND) = companyRate × totalRevenue.
   * Đây là mức trần, thực tế có thể thấp hơn nếu doanh thu không đủ.
   */
  companyTake: number;

  /**
   * Phần công ty thực tế thu được (VND).
   * = min(companyTake, max(remainAfterPrizes, 0)).
   */
  actualCompanyTake: number;

  /**
   * Phần đóng góp vào quỹ Jackpot 1 kỳ này (VND).
   * = totalJackpotContribution × jp1Ratio.
   */
  jackpot1Contribution: number;

  /**
   * Phần đóng góp vào quỹ Jackpot 2 kỳ này (VND).
   * = totalJackpotContribution × jp2Ratio + jp1Overflow.
   */
  jackpot2Contribution: number;

  /**
   * Phần tràn từ JP1 sang JP2 (VND) — khi JP1 vượt jp1OverflowThreshold.
   * = max(0, jp1AfterContribution - jp1OverflowThreshold).
   */
  jp1Overflow: number;

  /**
   * Số tiền Jackpot 1 cuối kỳ (VND).
   * Nếu reset (có JP1 winner hoặc split): closingJp1 = jp1SeedAmount.
   * Nếu tích luỹ: closingJp1 = jp1OpeningAmount + jackpot1Contribution.
   */
  closingJp1: number;

  /**
   * Số tiền Jackpot 2 cuối kỳ (VND).
   * Nếu reset (có JP2 winner hoặc split): closingJp2 = jp2SeedAmount.
   * Nếu tích luỹ: closingJp2 = jp2OpeningAmount + jackpot2Contribution.
   */
  closingJp2: number;

  /**
   * Số dư Jackpot 1 opening cho kỳ tiếp theo (VND).
   * Tính bởi calculateNextJackpot1() — bao gồm overflow logic.
   */
  nextJp1Opening: number;

  /**
   * Số dư Jackpot 2 opening cho kỳ tiếp theo (VND).
   * Tính bởi calculateNextJackpot2().
   */
  nextJp2Opening: number;

  /**
   * Có người trúng Jackpot 1 (6/6) trong kỳ này hay không.
   * true → winner nhận toàn bộ JP1 pool, cycle reset.
   */
  hasJackpot1Winner: boolean;

  /**
   * Có người trúng Jackpot 2 (5/6 + bonus) trong kỳ này hay không.
   * true → winner nhận toàn bộ JP2 pool, cycle reset.
   */
  hasJackpot2Winner: boolean;

  /**
   * Chi tiết phân bổ split Jackpot theo tier — chỉ có khi:
   *   isSplitCycle = true VÀ không có jackpot winner VÀ có winner tier1-tier3.
   *
   * undefined khi:
   *   - Không phải split cycle, HOẶC
   *   - Có jackpot1/jackpot2 winner, HOẶC
   *   - Không có ai trúng tier1-tier3.
   */
  splitDetails?: PowerSplitDetails;

  /**
   * Chi tiết doanh thu theo từng tenant — dùng cho báo cáo tài chính.
   */
  tenantBreakdown: Array<{
    /** Mã tenant. */
    tenantId: string;
    /** Doanh thu tenant (VND). */
    revenue: number;
    /** Hoa hồng tenant (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng tenant (0-1). */
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
 * Power 6/55 có DUAL JACKPOT (JP1 + JP2), nên context chứa
 * jp1OpeningAmount và jp2OpeningAmount thay vì single jackpotOpeningAmount.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareSettle     → SettleContext (financials = undefined)      │
 * │ SettleEntries     ← SettleContext                               │
 * │ CalculateFinancials ← SettleContext → SettleFinancials          │
 * │   ↳ SFN merge: settleCtx.financials = result                   │
 * │ ApplySplitBonuses ← SettleContext (financials có)               │
 * │ SyncTicketSummaries ← SettleContext                             │
 * │ BuildReport       ← SettleContext (financials có)               │
 * │ FinalizeSettle    ← SettleContextWithFinancials (bắt buộc)     │
 * │ DispatchPayouts   ← { drawId } (package riêng)                 │
 * └──────────────────────────────────────────────────────────────────┘
 */
export interface SettleContext {
  /**
   * Mã kỳ quay duy nhất — primary key xuyên suốt settle flow.
   * Format: "YYYY-MM-DD.NNN" (VD: "2026-02-24.001").
   * Tất cả step dùng drawId để query entries, lines, draw document.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay.
   * Dùng để group các kỳ quay trong cùng ngày.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong năm.
   * Dùng để xác định isSplitCycle cùng với các điều kiện khác.
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 6 số chính + 1 số bonus.
   * SettleEntries dùng để match lines vs kết quả, xác định tier thắng.
   */
  result: PowerDrawResult;

  /**
   * Số tiền Jackpot 1 đầu kỳ (VND) — đọc từ active JackpotCycle.jackpot1Current.
   *
   * Ý nghĩa: giá trị JP1 TRƯỚC khi tính contribution kỳ này.
   * Dùng bởi:
   *   - CalculateFinancials: tính closingJp1, overflow, split distribution
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho JP1 winner
   */
  jp1OpeningAmount: number;

  /**
   * Số tiền Jackpot 2 đầu kỳ (VND) — đọc từ active JackpotCycle.jackpot2Current.
   *
   * Ý nghĩa: giá trị JP2 TRƯỚC khi tính contribution kỳ này.
   * Dùng bởi:
   *   - CalculateFinancials: tính closingJp2, split distribution
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho JP2 winner
   */
  jp2OpeningAmount: number;

  /**
   * Kỳ này có phải kỳ chia Jackpot hay không.
   *
   * true khi tổng JP1 + JP2 >= splitThreshold (cấu hình từ GlobalConfig).
   *
   * Khi true VÀ không có jackpot winner VÀ có winner tier1-tier3:
   *   → CalculateFinancials tính splitDetails
   *   → ApplySplitBonuses patch split bonus vào entries
   *   → FinalizeSettle đóng cycle + ghi split record
   */
  isSplitCycle: boolean;

  /**
   * Bảng giải thưởng cố định: key = tier name, value = số tiền (VND).
   * VD: { "tier1": 40000000, "tier2": 500000, "tier3": 50000 }
   *
   * Jackpot 1 (6/6) và Jackpot 2 (5/6 + bonus) xử lý riêng qua split/winner flow.
   * Dùng bởi SettleEntries để tính winAmount cho mỗi entry.
   */
  prizeAmounts: Record<string, number>;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm jp1/jp2 seed amounts, ratios, overflow threshold, split config,
   * companyRate, defaultCommissionRate.
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu + dual jackpot.
   */
  config: PowerSettleConfig;

  /**
   * Tổng số entries cần settle (chỉ đếm entries chưa settled).
   * Dùng cho logging và progress tracking.
   */
  totalEntries: number;

  /**
   * Tổng số dòng cược từ tất cả entries.
   * Dùng bởi CalculateFinancials để ghi settle summary lên draw.
   */
  totalLines: number;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy (step 1-2).
   * Sau step 3 (CalculateFinancials), Step Function merge kết quả vào đây.
   * Các step 4-7 truy cập financials qua field này.
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
