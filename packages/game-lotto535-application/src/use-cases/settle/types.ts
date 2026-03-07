/**
 * Lotto 5/35 Settle – Shared Types
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
 *   CheckPrizeRoute (Choice) → route dựa trên financials:
 *     ├─ hasJackpotWinner → PatchJackpotPrize (step 4a)
 *     ├─ splitDetails tồn tại → ApplySplitBonuses (step 4b)
 *     └─ default → SyncTicketSummaries (skip)
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
 * Kết quả quay Lotto 5/35 đã công bố — dùng cho match lines ở SettleEntries.
 *
 * Gồm 5 số chính (từ tập 1-35) và 1 số đặc biệt (từ tập 1-12).
 * Các số ở dạng string zero-padded ("01"-"35" cho main, "01"-"12" cho special).
 */
export interface LottoDrawResult {
  /**
   * 5 số chính trúng thưởng — string zero-padded ("01"-"35").
   * Giữ nguyên thứ tự quay gốc (không sort).
   * Dùng để match với selection của player qua Set intersection.
   */
  winningMain: string[];

  /**
   * Số đặc biệt trúng thưởng — string zero-padded ("01"-"12").
   * Match riêng biệt với special number của mỗi line.
   */
  winningSpecial: string;
}

/**
 * Config tài chính cho settle — snapshot từ JackpotCycle (seed, split) và GlobalConfig (rates).
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 */
export interface LottoSettleConfig {
  /**
   * Số tiền khởi điểm Jackpot khi bắt đầu cycle mới (VND).
   * Khi reset Jackpot (có winner hoặc split), cycle mới bắt đầu từ giá trị này.
   * VD: 2.000.000.000 (2 tỷ).
   */
  seedAmount: number;

  /**
   * Tỷ lệ chia Jackpot cho từng tier khi split.
   * Tổng ratio = 6 (tier1: 2/6, tier2-tier5: mỗi tier 1/6).
   * Consolation KHÔNG tham gia chia Jackpot.
   *
   * Chỉ có hiệu lực khi isSplitCycle = true VÀ không có jackpot winner.
   * Tier không có winner → phần tiền tái phân bổ cho tier có winner.
   */
  splitRatios: {
    tier1: number;
    tier2: number;
    tier3: number;
    tier4: number;
    tier5: number;
  };

  /**
   * Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%).
   * Công ty chỉ được thu SAU khi đã trả giải cố định + commission đại lý.
   * Nếu doanh thu không đủ → actualCompanyTake < companyTake (hoặc = 0).
   */
  companyRate: number;
}

/**
 * Chi tiết phân bổ split cho 1 tier — thông tin thưởng Jackpot chia cho
 * những người trúng tier đó trong kỳ split.
 *
 * Dùng chung giữa CalculateFinancials (tính), ApplySplitBonuses (step 4b, patch entry),
 * FinalizeSettle (ghi vào cycle close record).
 */
export interface LottoSplitTierDetail {
  /**
   * Số tiền ban đầu phân cho tier (VND).
   * Công thức: jackpotAmount × (splitRatio[tier] / totalRatios).
   * VD: JP = 12 tỷ, tier1 ratio = 2/6 → initialAmount = 4 tỷ.
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
   * Làm tròn xuống 5.000 VND. Tier cao nhất (có winner) nhận phần dư
   * để đảm bảo tổng chi = tổng pool.
   */
  bonusPerWinner: number;
}

/**
 * Chi tiết phân bổ split toàn bộ — key = tier name (tier1-tier5), value = thông tin phân bổ.
 *
 * Chỉ tồn tại khi:
 * - isSplitCycle = true (Jackpot >= splitThreshold, kỳ Evening)
 * - Không có jackpot winner (5 main + special)
 * - Có ít nhất 1 winner tier1-tier5
 *
 * Nếu không có ai trúng tier1-tier5 → splitDetails = undefined (Jackpot giữ nguyên).
 */
export type LottoSplitDetails = Record<string, LottoSplitTierDetail>;

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
   * Tổng giải thưởng cố định đã trả (VND) — tier1 đến consolation.
   * KHÔNG bao gồm Jackpot (Jackpot xử lý riêng qua split/winner flow).
   * VD: 3 người trúng tier3 (500K) = 1.500.000 VND.
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
   * Phần đóng góp vào quỹ Jackpot kỳ này (VND).
   * = max(remainAfterPrizes - actualCompanyTake, 0)
   * Là phần dư cuối cùng sau khi trả giải, commission, và phần công ty.
   * Nếu có jackpot winner: contribution tính vào giải thưởng winner (không vào cycle mới).
   */
  jackpotContribution: number;

  /**
   * Jackpot cuối kỳ (VND) = openingAmount + jackpotContribution (LUÔN LUÔN).
   * Bản ghi lịch sử — quỹ JP trị giá bao nhiêu khi kỳ quay kết thúc.
   *
   * Nếu có JP winner: đây là tổng giải mà winner nhận.
   * Nếu split: đây là quỹ JP trước khi chia cho tier1-tier5.
   * Nếu tích luỹ: đây là quỹ JP mang sang kỳ sau.
   *
   * Lưu ý: seedAmount (reset cycle mới) do FinalizeSettle.createCycle() xử lý,
   * KHÔNG phải closingJackpot.
   */
  closingJackpot: number;

  /**
   * Có người trúng Jackpot (5 main + special) trong kỳ này hay không.
   * Quyết định:
   *   - true → winner nhận toàn bộ JP pool, cycle reset
   *   - false + isSplitCycle → chia JP cho tier1-tier5 winners
   *   - false + !isSplitCycle → JP tích luỹ tiếp
   */
  hasJackpotWinner: boolean;

  /**
   * Chi tiết phân bổ split Jackpot theo tier — chỉ có khi:
   *   isSplitCycle = true VÀ hasJackpotWinner = false VÀ có winner tier1-tier5.
   *
   * undefined khi:
   *   - Không phải split cycle, HOẶC
   *   - Có jackpot winner (winner nhận hết, không split), HOẶC
   *   - Không có ai trúng tier1-tier5 (không có ai để chia).
   */
  splitDetails?: LottoSplitDetails;
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
 * │ CheckPrizeRoute (Choice):                                      │
 * │   ├─ hasJackpotWinner → PatchJackpotPrize (step 4a)            │
 * │   ├─ splitDetails != null → ApplySplitBonuses (step 4b)        │
 * │   └─ default → SyncTicketSummaries                             │
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
   * Dùng để group các kỳ quay trong cùng ngày (Morning + Evening).
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày (1 = Morning, 2 = Evening).
   * Dùng để xác định isSplitCycle: split chỉ xảy ra ở kỳ Evening (drawNo = 2).
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã công bố — 5 số chính + 1 số đặc biệt.
   * SettleEntries dùng để match lines vs kết quả, xác định tier thắng.
   */
  result: LottoDrawResult;

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
   * true khi ĐỒNG THỜI thoả:
   *   - drawNo = Evening (kỳ chiều)
   *   - jackpotOpeningAmount >= splitThreshold (mặc định 12 tỷ VND)
   *
   * Khi true VÀ không có jackpot winner VÀ có winner tier1-tier5:
   *   → CalculateFinancials tính splitDetails
   *   → ApplySplitBonuses (step 4b) patch split bonus vào entries
   *   → FinalizeSettle đóng cycle + ghi split record
   */
  isSplitCycle: boolean;

  /**
   * Bảng giải thưởng cố định: key = tier name, value = số tiền (VND).
   * VD: { "jackpot": 0, "tier1": 10000000, "tier2": 5000000, ... }
   *
   * Jackpot ghi amount = 0 (xử lý riêng qua split/winner flow).
   * Giải cố định: tier1=10M, tier2=5M, tier3=500K, tier4=100K,
   * tier5=30K, consolation=10K.
   *
   * Dùng bởi SettleEntries để tính winAmount cho mỗi entry.
   */
  prizeAmounts: Record<string, number>;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm seedAmount (từ JackpotCycle), splitRatios (từ JackpotCycle config),
   * companyRate (từ GlobalConfig.rates).
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu + jackpot.
   */
  config: LottoSettleConfig;

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
