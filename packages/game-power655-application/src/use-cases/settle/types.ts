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
 *   SyncTicketSummaries → nhận SettleContext
 *   BuildReport → nhận SettleContext (có financials)
 *   FinalizeSettle → nhận SettleContextWithFinancials (financials bắt buộc)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Power 6/55 có DUAL JACKPOT (JP1: 6/6, JP2: 5/6 + bonus).
 * Tất cả types đều có jp1/jp2 fields thay vì single jackpot.
 *
 * Theo luật Vietlott, Power 6/55 KHÔNG CÓ cơ chế Split Cycle.
 * Jackpot tích lũy không giới hạn cho đến khi có winner.
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type { PrizeAmounts } from "@megawin/game-power655/entities";
import type { JackpotWinnerInfo } from "@megawin/game-power655/entities";

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
 * Tất cả giá trị ngưỡng là tham khảo mặc định, đọc từ GlobalConfig khi runtime.
 */
export interface PowerSettleConfig {
  /**
   * Số tiền khởi điểm Jackpot 1 khi bắt đầu cycle mới (VND).
   * Khi reset JP1 (có winner), cycle mới bắt đầu từ giá trị này.
   */
  jp1SeedAmount: number;

  /**
   * Số tiền khởi điểm Jackpot 2 khi bắt đầu cycle mới (VND).
   * Khi reset JP2 (có winner), cycle mới bắt đầu từ giá trị này.
   */
  jp2SeedAmount: number;

  /**
   * Tỷ lệ đóng góp vào Jackpot 1 từ jackpot contribution (0-1).
   * VD: 0.9 = 90% jackpotContribution đổ vào JP1.
   */
  jp1Ratio: number;

  /**
   * Tỷ lệ đóng góp vào Jackpot 2 từ jackpot contribution (0-1).
   * VD: 0.1 = 10% jackpotContribution đổ vào JP2.
   * jp1Ratio + jp2Ratio = 1.
   */
  jp2Ratio: number;

  /**
   * Ngưỡng tràn Jackpot 1 (VND) — khi JP1 vượt ngưỡng, phần dư chuyển sang JP2.
   * Mặc định tham khảo: 300.000.000.000 (300 tỷ). Đọc từ GlobalConfig khi runtime.
   */
  jp1OverflowThreshold: number;

  /**
   * Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%).
   * Công ty chỉ được thu SAU khi đã trả giải cố định + commission đại lý.
   */
  companyRate: number;

  /**
   * Snapshot cycleNo tại thời điểm PrepareSettle.
   * Dùng bởi FinalizeSettle để updateCycleStats đúng cycle.
   */
  cycleNo: number;

  /**
   * Snapshot drawCount của cycle tại thời điểm PrepareSettle.
   * FinalizeSettle tính: newDrawCount = cycleDrawCountBefore + 1.
   * Dùng giá trị tuyệt đối → idempotent khi retry.
   */
  cycleDrawCountBefore: number;
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
   * KHÔNG bao gồm Jackpot 1 và Jackpot 2 (xử lý riêng qua winner flow).
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
   * Công thức: round(totalJackpotContribution × jp1Ratio).
   *   → Nếu overflow kích hoạt (!JP1 winner, có JP2 winner, JP1 > threshold):
   *      -= jp1Overflow → JP1 cap tại threshold.
   *   → Nếu có JP1 winner: overflow KHÔNG kích hoạt; contribution đầy đủ.
   *   → Nếu không ai trúng: contribution đầy đủ, JP1 tiếp tục vượt threshold bình thường.
   */
  jackpot1Contribution: number;

  /**
   * Phần đóng góp vào quỹ Jackpot 2 kỳ này (VND).
   * Công thức cơ bản: totalJackpotContribution - jackpot1Contribution.
   *   → Nếu overflow kích hoạt (!JP1 winner, có JP2 winner, JP1 > threshold):
   *      += jp1Overflow → JP2 winner nhận thêm phần vượt ngưỡng.
   *   → Nếu không ai trúng hoặc có JP1 winner: = rawJp2 bình thường, không có overflow.
   */
  jackpot2Contribution: number;

  /**
   * Lượng tiền vượt ngưỡng JP1 (VND) kỳ này.
   * = max(0, jp1CurrentAmount + rawJp1 - jp1OverflowThreshold).
   * Chỉ > 0 khi overflow kích hoạt: !hasJackpot1Winner && hasJackpot2Winner && JP1 > threshold.
   * Khi > 0: đã cộng vào jackpot2Contribution (trao cho JP2 winner kỳ này).
   * = 0 nếu: có JP1 winner, hoặc không có JP2 winner, hoặc JP1 ≤ threshold.
   */
  jp1Overflow: number;

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
 * jp1CurrentAmount và jp2CurrentAmount thay vì single jackpotOpeningAmount.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareSettle     → SettleContext (financials = undefined)      │
 * │ SettleEntries     ← SettleContext                               │
 * │ CalculateFinancials ← SettleContext → SettleFinancials          │
 * │   ↳ SFN merge: settleCtx.financials = result                   │
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
   * Số tiền Jackpot 1 hiện tại đầu kỳ (VND) — đọc từ active JackpotCycle.jackpot1CurrentAmount.
   *
   * Ý nghĩa: giá trị JP1 pool ĐANG tích luỹ, TRƯỚC khi cộng contribution kỳ này.
   * Dùng bởi:
   *   - CalculateFinancials: tính contribution, overflow
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho JP1 winner
   */
  jp1CurrentAmount: number;

  /**
   * Số tiền Jackpot 2 hiện tại đầu kỳ (VND) — đọc từ active JackpotCycle.jackpot2CurrentAmount.
   *
   * Ý nghĩa: giá trị JP2 pool ĐANG tích luỹ, TRƯỚC khi cộng contribution kỳ này.
   * Dùng bởi:
   *   - CalculateFinancials: tính contribution
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho JP2 winner
   */
  jp2CurrentAmount: number;

  /**
   * Bảng giải thưởng cố định — snapshot từ GlobalConfig tại thời điểm PrepareSettle.
   *
   * Chỉ bao gồm 3 hạng giải cố định: tier1 (5/6), tier2 (4/6), tier3 (3/6).
   * JP1 (6/6) và JP2 (5/6 + bonus) KHÔNG có trong bảng này —
   * winAmount của jackpot luôn = 0 ở SettleEntries, được tính sau ở FinalizeSettle
   * khi đã biết chính xác pool và số winners.
   *
   * Dùng bởi SettleEntries để tính winAmount cho mỗi entry.
   * Đồng bộ với `PrizeAmounts` từ entity layer — compiler bắt lỗi nếu thêm tier mới.
   */
  fixedPrizeAmounts: PrizeAmounts;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm jp1/jp2 seed amounts, ratios, overflow threshold, companyRate.
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu + dual jackpot.
   */
  config: PowerSettleConfig;

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

  /**
   * Danh sách người trúng Jackpot (JP1 + JP2) — chỉ có khi có jackpot winner.
   * Được điền bởi PatchJackpotPrize, merge vào settleCtx qua Step Function.
   * FinalizeSettle đọc field này để ghi vào cycle close record — tránh re-query DB.
   * undefined khi không có JP winner (roll-over).
   */
  jackpotWinners?: JackpotWinnerInfo[];
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
