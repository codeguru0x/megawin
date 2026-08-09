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
 *   SyncTicketSummaries → nhận SettleContext
 *   BuildReport → nhận SettleContext (có financials)
 *   FinalizeSettle → nhận SettleContextWithFinancials (financials bắt buộc)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 *
 * Mega 6/45 theo luật Vietlott: KHÔNG có Split Cycle.
 * Jackpot chỉ tích luỹ (roll-over) hoặc trao cho winner.
 */

import type { JackpotWinnerInfo, PrizeAmounts } from "@megawin/game-mega645/entities";
import type { ResettleScenario } from "@megawin/game-mega645/rules";

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
  winningNumbers: string[];
}

/**
 * Config tài chính cho settle — snapshot từ JackpotCycle (seed) và GlobalConfig (rates).
 *
 * Được tạo bởi PrepareSettle, sử dụng bởi CalculateFinancials.
 * Config snapshot tại thời điểm settle — KHÔNG thay đổi giữa các step.
 *
 * Mega 6/45 theo luật Vietlott: không có splitThreshold hay splitRatios.
 */
export interface SettleConfig {
  /**
   * Số tiền khởi điểm Jackpot khi bắt đầu cycle mới sau winner (VND).
   */
  seedAmount: number;

  /**
   * Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%).
   * Công ty chỉ được thu SAU khi đã trả giải cố định + commission đại lý.
   * Nếu doanh thu không đủ → actualCompanyTake < companyTake (hoặc = 0).
   */
  companyRate: number;

  /**
   * Snapshot cycleNo tại thời điểm PrepareSettle.
   * Dùng bởi FinalizeSettle để updateCycleStats đúng cycle.
   */
  cycleNo: number;

  /**
   * Snapshot totalContribution của cycle tại thời điểm PrepareSettle (VND).
   * FinalizeSettle tính: newContribution = cycleContributionBefore + jackpotContribution.
   * Dùng giá trị tuyệt đối → idempotent khi retry (không cộng dồn từ activeCycle mới nhất).
   */
  cycleContributionBefore: number;

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
   * KHÔNG bao gồm Jackpot (Jackpot xử lý riêng qua winner flow).
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
   * Có người trúng Jackpot (6/6) trong kỳ này hay không.
   * true → winner nhận toàn bộ JP pool, cycle reset.
   * false → JP tích luỹ tiếp (roll-over).
   */
  hasJackpotWinner: boolean;
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
   * Mega 6/45 chỉ có 1 kỳ/ngày (drawNo = 1).
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
   *   - CalculateFinancials: tính contribution + closingAmount cho DrawDoc
   *   - BuildReport: ghi jackpotTracking.openingAmount
   *   - FinalizeSettle: tính totalJackpotPrize cho winner
   */
  jackpotOpeningAmount: number;

  /**
   * Bảng giải thưởng cố định — snapshot từ GlobalConfig tại thời điểm PrepareSettle.
   *
   * Chỉ bao gồm các hạng giải cố định (tier1, tier2, tier3).
   * Jackpot ghi amount = 0 (xử lý riêng qua winner flow).
   * Dùng bởi SettleEntries để tính winAmount cho mỗi entry.
   * Đồng bộ với `PrizeAmounts` từ entity layer — compiler bắt lỗi nếu thêm tier mới.
   */
  prizeAmounts: PrizeAmounts;

  /**
   * Cấu hình tài chính settle — snapshot tại thời điểm PrepareSettle.
   * Gồm seedAmount, companyRate, cycleNo, cycleContributionBefore, cycleDrawCountBefore.
   *
   * Dùng bởi CalculateFinancials để tính phân bổ doanh thu + jackpot.
   * Dùng bởi FinalizeSettle để updateCycleStats idempotent.
   */
  config: SettleConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy (step 1-2).
   * Sau step 3 (CalculateFinancials), Step Function merge kết quả vào đây.
   * Các step 4-6 truy cập financials qua field này.
   *
   * FinalizeSettle YÊU CẦU financials bắt buộc (dùng SettleContextWithFinancials).
   */
  financials?: SettleFinancials;

  /**
   * Danh sách người trúng Jackpot — chỉ có khi financials.hasJackpotWinner = true.
   *
   * Được điền bởi PatchJackpotPrize (step patch-jackpot-prize), merge vào settleCtx
   * qua Step Function. FinalizeSettle đọc field này để ghi vào cycle close record
   * — tránh re-query DB.
   *
   * undefined khi không có JP winner (roll-over).
   */
  jackpotWinners?: JackpotWinnerInfo[];

  /**
   * Context resettle — chỉ có khi pipeline được khởi động từ TriggerResettleUseCase.
   *
   * undefined trong flow settle bình thường (kỳ quay lần đầu).
   *
   * FinalizeSettle đọc field này để:
   *   1. Upsert Cycle Ledger entry với giá trị chính xác kỳ T.
   *   2. Quyết định có cập nhật jackpot cycle hay không (skipCycleUpdate).
   *
   * PrepareSettle đọc field này để:
   *   1. Đọc jackpotOpeningAmount từ ledger(T).openingJp thay vì activeCycle
   *      (activeCycle không còn đúng sau khi cycle đã được update ở các kỳ sau T).
   *   2. Set cycleDrawCountBefore = ledger(T).seq - 1 (thay vì activeCycle.drawCount).
   */
  resettleContext?: ResettleContext;
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

// ─────────────────────────────────────────────────────────────────────────────
// ResettleContext — chỉ dùng khi pipeline chạy từ resettle flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context đặc biệt cho resettle pipeline — pass qua SFN input.
 *
 * Được tạo bởi `TriggerResettleUseCase` và gắn vào SFN input.
 * `PrepareSettleUseCase` đọc để override jackpotOpeningAmount và cycleDrawCountBefore.
 * `FinalizeSettleUseCase` đọc để upsert ledger entry và quyết định skipCycleUpdate.
 *
 * Mega 6/45 là SINGLE JACKPOT → chỉ 1 field `openingJp` (không có openingJp1/2,
 * không có overflow).
 *
 * ── openingJp ───────────────────────────────────────────────────────────────
 * Đọc từ `JackpotCycleEntryRepository.findByDraw(drawId).openingJp`.
 * Đây là giá trị Jackpot TRƯỚC khi cộng contribution kỳ T — đúng là opening
 * của kỳ T, không bị ảnh hưởng bởi các kỳ settle sau.
 *
 * Lý do không dùng `activeCycle.currentAmount`:
 *   - activeCycle.currentAmount phản ánh trạng thái HIỆN TẠI của cycle.
 *   - Sau khi các kỳ T+1, T+2,... settle xong, activeCycle đã bị cập nhật theo
 *     contribution của các kỳ đó — không còn là opening của kỳ T.
 *
 * ── cycleDrawCountBefore ─────────────────────────────────────────────────────
 * = `ledger(T).seq - 1` — số kỳ đã settle TRƯỚC kỳ T trong cycle.
 * `FinalizeSettle` dùng để set `drawCount = cycleDrawCountBefore + 1` (idempotent).
 *
 * ── skipCycleUpdate ─────────────────────────────────────────────────────────
 * - `false` (Type A): FinalizeSettle cập nhật jackpot cycle như bình thường.
 * - `true` (Type B1/B2): FinalizeSettle BỎ QUA bước updateJackpotCycle.
 *   DBA can thiệp cycle thủ công sau khi entries đã re-settle xong.
 *
 * ── cascadeOpeningUpdate ─────────────────────────────────────────────────────
 * Chỉ true cho cascade B2 (kỳ T+n, n≥1). Khi true, FinalizeSettle cho phép
 * `upsertEntry` ghi đè `openingJp` trong ledger (thay vì $setOnInsert) vì
 * opening kỳ T+n = closing kỳ T+n-1 vừa thay đổi do resettle kỳ trước.
 */
export interface ResettleContext {
  /** Session ID duy nhất cho phiên resettle — UUIDv7, sinh bởi BO API. */
  resettleId: string;
  /**
   * Loại scenario phát hiện bởi `DetectResettleBoundariesUseCase`.
   * Dùng để log, audit, và hiển thị trạng thái trên BO UI.
   */
  scenario: ResettleScenario;
  /**
   * Giá trị Jackpot đầu kỳ T — đọc từ ledger(T).openingJp.
   * Override activeCycle.currentAmount trong PrepareSettle.
   */
  openingJp: number;
  /**
   * Số kỳ trong cycle TRƯỚC kỳ T = ledger(T).seq - 1.
   * Override activeCycle.drawCount trong PrepareSettle để tính cycleDrawCountBefore.
   * FinalizeSettle set drawCount = cycleDrawCountBefore + 1 (idempotent).
   */
  cycleDrawCountBefore: number;
  /**
   * Tổng contribution của cycle TRƯỚC kỳ T (VND) = `openingJp - cycle.seedAmount`.
   *
   * Override activeCycle.totalContribution trong PrepareSettle. Cần thiết vì
   * `activeCycle.totalContribution` đã CỘNG contribution kỳ T (và các kỳ T+1…)
   * từ lần settle trước → không còn là "trước kỳ T". FinalizeSettle (Type A
   * roll-over) tính `newContribution = cycleContributionBefore + jpContribution`
   * (tuyệt đối → idempotent).
   *
   * Bất biến cycle (single jackpot, không winner giữa cycle):
   *   openingJp(T) = seedAmount + Σ contribution các kỳ < T
   *   → cycleContributionBefore = openingJp(T) - seedAmount.
   */
  cycleContributionBefore: number;
  /**
   * cycleNo của cycle CHỨA kỳ T — đọc từ `ledger(T).cycleNo`.
   *
   * Override việc lookup `getActiveCycle()` trong PrepareSettle. Cần thiết vì:
   *   - Khi kỳ T trúng JP, cycle chứa T đã bị ĐÓNG (status = "closed"). Nếu chưa
   *     có kỳ sau T → chưa có active cycle nào → `getActiveCycle()` trả null →
   *     PrepareSettle ném "Không tìm thấy Jackpot Cycle" khi resettle.
   *   - Ngay cả khi đã có cycle mới (active), đó là cycle SAU kỳ T với config khác.
   *     Resettle kỳ T phải đọc đúng cycle CHỨA T.
   *
   * PrepareSettle dùng `getCycleByNo(cycleNo)` (lookup bất kể status) để đọc đúng
   * cycle của kỳ T — kể cả khi cycle đã closed.
   */
  cycleNo: number;
  /**
   * Nếu true: FinalizeSettle BỎ QUA bước `updateJackpotCycle`.
   * Dùng cho Type B1/B2 khi DBA cần can thiệp cycle thủ công.
   * Nếu false (Type A): FinalizeSettle cập nhật cycle như bình thường.
   */
  skipCycleUpdate: boolean;
  /**
   * Nếu true (chỉ cascade B2, kỳ T+n với n≥1): cho phép `upsertEntry` ghi đè
   * `openingJp` trong ledger. Cần thiết vì opening kỳ T+n = closing kỳ T+n-1
   * vừa đổi do resettle kỳ trước trong chuỗi cascade. Mặc định undefined/false
   * (settle lần đầu + Type A/B1 + chính kỳ T): opening bất biến ($setOnInsert).
   */
  cascadeOpeningUpdate?: boolean;
}
