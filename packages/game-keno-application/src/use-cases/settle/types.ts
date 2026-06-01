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
 *   - basicPrizes         → SettleEntries (tra bảng giải) + ApplyPayoutCaps (lấy fixedPrize)
 *   - bigSmallPrizes      → SettleEntries (match side bet Lớn/Nhỏ)
 *   - evenOddPrizes       → SettleEntries (match side bet Chẵn/Lẻ)
 *   - payoutCaps          → ApplyPayoutCaps (giới hạn trả thưởng bậc 8/9/10)
 *
 * Keno không cần companyRate — không có Jackpot, công ty thu toàn bộ phần dư.
 */
export interface KenoSettleConfig {
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
  /** Phần công ty thu = totalRevenue - totalPrizes - totalAgentCommission (VND). Có thể âm. */
  companyTake: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ResettleContext – marker propagate qua SFN khi settle nested từ resettle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marker indicating Settle SFN này được nested từ Resettle SFN.
 *
 * Khi present:
 *   - `EnqueueDispatchPayouts` derive `batchKey` resettle (`keno:resettle:
 *     {drawId}:{resettleId}:payout`) thay vì batchKey settle mặc định
 *     `keno:settle:{drawId}:payout`.
 *   - `FinalizeSettle` release `WorkerLock` qua `lockOwnerToken`.
 *   - `description` của dispatch order suffix " (resettle)".
 *
 * Khi absent: Settle SFN chạy bình thường cho lần settle đầu — không đụng lock,
 * không đổi batchKey.
 *
 * NOTE: `payoutBatchKey` KHÔNG có trong context — convention naming
 * centralize ở `EnqueueDispatchPayoutsUseCase` (derive từ `drawId +
 * resettleId`), đồng nhất với pattern `reversalBatchKey` ở resettle path.
 * Bỏ field này giúp SFN ASL không build batchKey qua JSONata, contract
 * cross-SFN gọn hơn.
 */
export interface ResettleContext {
  /** UUIDv7 phiên resettle hiện tại — dùng tracing + `sourceContext.resettleId`. */
  resettleId: string;
  /** ownerToken `WorkerLock` — `FinalizeSettle` truyền vào `finalizeAndRelease`. */
  lockOwnerToken: string;
  /**
   * Lock key của phiên resettle (`{game}:resettle:{drawId}`) — propagate từ
   * `TriggerResettleUseCase` (BO API) xuyên SFN tới `FinalizeSettleUseCase`.
   *
   * Build qua `buildResettleLockKey(GameProduct.Keno, drawId)` từ
   * `@megawin/game-core/utils` — single source of truth cho format key.
   *
   * Propagate qua context (thay vì rebuild ở mỗi step) để:
   *   - Tránh duplicate format string acquire ≠ release → silent bug khi đổi
   *     convention (lock không release đúng, chỉ giải qua TTL sau 5 phút).
   *   - `FinalizeSettle` không cần biết game cụ thể — code generic.
   */
  lockKey: string;
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
 * │ FinalizeSettle      ← SettleContext                             │
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
   * Keno quay mỗi 8 phút (~120 kỳ/ngày).
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
   * Gồm basicPrizes, bigSmallPrizes, evenOddPrizes, payoutCaps.
   * Config snapshot KHÔNG thay đổi giữa các step.
   */
  config: KenoSettleConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * BuildReport và FinalizeSettle truy cập financials qua field này.
   */
  financials?: SettleFinancials;

  /**
   * Marker resettle path — propagate qua mọi step SFN.
   *
   * - Absent → settle lần đầu, mọi step chạy bình thường.
   * - Present → nested settle từ resettle:
   *     • `EnqueueDispatchPayouts` derive batchKey resettle từ `drawId + resettleId`.
   *     • `FinalizeSettle` release `WorkerLock` qua `lockOwnerToken`.
   *
   * Set bởi `Resettle SFN.StartSettleExecution` khi nested call vào Settle SFN.
   * `PrepareSettle` propagate xuyên flow — KHÔNG đụng status logic.
   */
  resettleContext?: ResettleContext;
}
