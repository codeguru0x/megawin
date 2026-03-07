/**
 * Mega 6/45 Settle – Shared Types
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
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Mega 6/45 đã công bố — dùng cho match lines ở SettleEntries.
 *
 * Gồm 6 số chính (từ tập 1-45). Mega 6/45 KHÔNG có số đặc biệt (khác Lotto 5/35).
 * Các số ở dạng string zero-padded ("01"-"45").
 */
export interface MegaDrawResult {
  /**
   * 6 số chính trúng thưởng — string zero-padded ("01"-"45").
   * Giữ nguyên thứ tự quay gốc (không sort).
   * Dùng để match với selection của player qua Set intersection.
   */
  winningMain: string[];
}

/**
 * Config tài chính cho settle — snapshot từ JackpotCycle (seed, split) và GlobalConfig (rates).
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 */
export interface MegaSettleConfig {
  /**
   * Số tiền khởi điểm Jackpot khi bắt đầu cycle mới (VND).
   * Khi reset Jackpot (có winner hoặc split), cycle mới bắt đầu từ giá trị này.
   */
  seedAmount: number;

  /**
   * Ngưỡng chia Jackpot (VND).
   * Khi jackpot >= splitThreshold và đủ điều kiện → kích hoạt split cycle.
   */
  splitThreshold: number;

  /**
   * Tỷ lệ chia Jackpot cho từng tier khi split.
   * Mega 6/45 chỉ có 3 tier chia: tier1 (jackpot), tier2 (5/6), tier3 (4/6).
   * Tier không có winner → phần tiền tái phân bổ cho tier có winner.
   */
  splitRatios: {
    /** Tỷ lệ chia cho tier1 / jackpot (0-1). */
    tier1: number;
    /** Tỷ lệ chia cho tier2 – 5/6 (0-1). */
    tier2: number;
    /** Tỷ lệ chia cho tier3 – 4/6 (0-1). */
    tier3: number;
  };

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

/**
 * Chi tiết phân bổ split cho 1 tier — thông tin thưởng Jackpot chia cho
 * những người trúng tier đó trong kỳ split.
 *
 * Dùng chung giữa CalculateFinancials (tính), ApplySplitBonuses (patch entry),
 * FinalizeSettle (ghi vào cycle close record).
 */
export interface MegaSplitTierDetail {
  /**
   * Số tiền ban đầu phân cho tier (VND).
   * Công thức: jackpotAmount × splitRatio[tier].
   */
  initialAmount: number;

  /**
   * Số tiền tái phân bổ từ các tier không có winner (VND).
   * Khi tier A không có winner → phần tiền tier A chia cho các tier có winner
   * theo tỷ lệ ratio tương ứng.
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
   * Làm tròn xuống bội 5.000 VND. Tier cao nhất (có winner) nhận phần dư.
   */
  bonusPerWinner: number;
}

/**
 * Chi tiết phân bổ split toàn bộ — key = tier name, value = thông tin phân bổ.
 *
 * Chỉ tồn tại khi:
 * - isSplitCycle = true (Jackpot >= splitThreshold)
 * - Không có jackpot winner (6/6)
 * - Có ít nhất 1 winner tier1-tier3
 *
 * Nếu không có ai trúng tier1-tier3 → splitDetails = undefined (Jackpot giữ nguyên).
 */
export type MegaSplitDetails = Record<string, MegaSplitTierDetail>;

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
  /**
   * Tổng doanh thu kỳ quay (VND) = tổng tiền stake của tất cả entries.
   * Bằng tổng revenue các tenant, aggregate từ DB (không dùng accumulator).
   */
  totalRevenue: number;

  /**
   * Tổng giải thưởng cố định đã trả (VND) — từ jackpot đến tier cuối.
   * KHÔNG bao gồm Jackpot (Jackpot xử lý riêng qua split/winner flow).
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
   * Nếu doanh thu không đủ trả giải + commission → actualCompanyTake = 0.
   */
  actualCompanyTake: number;

  /**
   * Phần đóng góp vào quỹ Jackpot kỳ này (VND).
   * = max(remainAfterPrizes - actualCompanyTake, 0)
   * Là phần dư cuối cùng sau khi trả giải, commission, và phần công ty.
   */
  jackpotContribution: number;

  /**
   * Số tiền Jackpot cuối kỳ (VND) — giá trị Jackpot SAU khi tính toán kỳ này.
   *
   * Nếu reset (có winner hoặc split):
   *   closingJackpot = seedAmount (contribution đã tính vào giải winner).
   * Nếu tích luỹ (không reset):
   *   closingJackpot = openingAmount + contribution.
   */
  closingJackpot: number;

  /**
   * Giá trị Jackpot mở đầu cycle tiếp theo (VND).
   * Khác closingJackpot khi cycle reset (= seedAmount + contribution kỳ này).
   * Khi không reset: nextJackpotOpening = closingJackpot.
   */
  nextJackpotOpening: number;

  /**
   * Có người trúng Jackpot (6/6) trong kỳ này hay không.
   * Quyết định:
   *   - true → winner nhận toàn bộ JP pool, cycle reset
   *   - false + isSplitCycle → chia JP cho tier1-tier3 winners
   *   - false + !isSplitCycle → JP tích luỹ tiếp
   */
  hasJackpotWinner: boolean;

  /**
   * Chi tiết phân bổ split Jackpot theo tier — chỉ có khi:
   *   isSplitCycle = true VÀ hasJackpotWinner = false VÀ có winner tier1-tier3.
   *
   * undefined khi:
   *   - Không phải split cycle, HOẶC
   *   - Có jackpot winner (winner nhận hết, không split), HOẶC
   *   - Không có ai trúng tier1-tier3 (không có ai để chia).
   */
  splitDetails?: MegaSplitDetails;
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
   * Dùng để xác định isSplitCycle và logging.
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 6 số chính.
   * SettleEntries dùng để match lines vs kết quả, xác định tier thắng.
   */
  result: MegaDrawResult;

  /**
   * Số tiền Jackpot đầu kỳ (VND) — đọc từ active JackpotCycle.currentAmount.
   *
   * Ý nghĩa: giá trị Jackpot TRƯỚC khi tính contribution kỳ này.
   * Dùng bởi:
   *   - CalculateFinancials: tính closingJackpot, split distribution
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho winner
   */
  jackpotOpeningAmount: number;

  /**
   * Kỳ này có phải kỳ chia Jackpot hay không.
   *
   * true khi jackpotOpeningAmount >= splitThreshold.
   * Khi true VÀ không có jackpot winner VÀ có winner tier1-tier3:
   *   → CalculateFinancials tính splitDetails
   *   → ApplySplitBonuses patch split bonus vào entries
   *   → FinalizeSettle đóng cycle + ghi split record
   */
  isSplitCycle: boolean;

  /**
   * Bảng giải thưởng cố định: key = tier name, value = số tiền (VND).
   * VD: { "jackpot": 0, "tier1": 10000000, "tier2": 5000000, ... }
   *
   * Jackpot ghi amount = 0 (xử lý riêng qua split/winner flow).
   * Dùng bởi SettleEntries để tính winAmount cho mỗi entry.
   */
  prizeAmounts: Record<string, number>;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm seedAmount, splitThreshold, splitRatios, companyRate, defaultCommissionRate.
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu + jackpot.
   */
  config: MegaSettleConfig;

  /**
   * Tổng số entry cần settle trong kỳ.
   * Dùng cho logging và monitoring tiến độ.
   */
  totalEntries: number;

  /**
   * Tổng số dòng (lines) cần xử lý — expand từ tất cả entry.
   * Dùng bởi CalculateFinancials để ghi vào draw summary.
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
