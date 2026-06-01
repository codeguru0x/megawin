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
 *   EnqueueDispatchPayouts → nhận { drawId } (bulk enqueue outbox, chạy sau finalize)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 *
 * Max 3D KHÔNG có Jackpot tích lũy → không có isSplitCycle, splitDetails,
 * jackpotOpeningAmount, closingJackpot, hasJackpotWinner.
 */

import type { Max3dDrawResult, Max3dPrizeConfig } from "@megawin/game-max3d/entities";

export type { Max3dDrawResult };

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
   * Phần công ty thu kỳ quay (VND).
   * = totalRevenue - totalFixedPrizes - totalAgentCommission.
   * Có thể âm nếu giải thưởng vượt doanh thu (công ty chịu lỗ).
   */
  companyTake: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ResettleContext – propagate qua Settle SFN khi nested từ Resettle SFN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context phiên resettle, propagate xuyên Settle SFN khi được gọi nested
 * từ Resettle SFN.
 *
 * Tồn tại trên `SettleContext` ⇔ pipeline đang ở chế độ resettle:
 *   - `FinalizeSettle` → KHÔNG bump version (đã ở trạng thái settling, chỉ
 *     transition Settling → Settled), unlock business lock.
 *   - `EnqueueDispatchPayouts` → enqueue chỉ entries có `payoutTx` MỚI hơn
 *     so với phiên resettle trước (filter qua `metadata.resettleId`).
 *
 * Field này nằm GAME-SPECIFIC vì là phần của settle context per game — KHÔNG
 * extract ra `game-core` (worker settle mỗi game tự handle resettle context).
 */
export interface ResettleContext {
  /**
   * ID phiên resettle (UUIDv7) — sinh tại BO API `TriggerResettle`, làm
   * session key xuyên SFN. Dùng để:
   *   - Tag `EntryReversal.resettleId` snapshot.
   *   - Tag `TenantDispatchOrderDoc.metadata.resettleId` (reversal + payout mới).
   *   - Filter dispatch orders thuộc phiên resettle hiện tại.
   *   - `BusinessLock.token` để release lock idempotent từ FinalizeSettle.
   */
  resettleId: string;

  /**
   * Token sở hữu lock `max3d:resettle:{drawId}` — sinh tại BO API cùng lúc
   * với `resettleId`, đảm bảo chỉ chủ lock mới có quyền release.
   *
   * `FinalizeSettle` (resettle path) gọi `BusinessLockCoordinator.release()`
   * với token này để giải phóng lock idempotent (race-safe).
   */
  lockOwnerToken: string;

  /**
   * Lock key của phiên resettle (`{game}:resettle:{drawId}`) — propagate từ
   * `TriggerResettleUseCase` (BO API) qua SFN tới `FinalizeSettle`.
   *
   * Build qua `buildResettleLockKey(GameProduct.Max3d, drawId)` từ
   * `@megawin/game-core/utils` — single source of truth cho format key.
   *
   * Propagate qua context (thay vì rebuild ở mỗi step) để tránh duplicate
   * format string acquire ≠ release → silent bug khi đổi convention (lock
   * không release đúng, chỉ giải qua TTL sau ~10 phút).
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
 * │ PrepareSettle          → SettleContext (financials = undefined)  │
 * │ SettleEntries          ← SettleContext                           │
 * │ SyncTicketSummaries    ← SettleContext                           │
 * │ CalculateFinancials    ← SettleContext → SettleFinancials        │
 * │   ↳ SFN merge: settleCtx.financials = result                     │
 * │ BuildReport            ← SettleContext (financials có)           │
 * │ FinalizeSettle         ← SettleContext                          │
 * │ EnqueueDispatchPayouts ← { drawId } (bulk enqueue outbox)        │
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
   *
   * Gồm giải thưởng cho 3 chế độ chơi: Basic, Combo, Plus.
   * Snapshot tại thời điểm PrepareSettle — KHÔNG thay đổi giữa các step.
   *
   * - `basic`: Giải thưởng chế độ Basic (4 hạng: special/first/second/third).
   * - `combo`: Giải thưởng chế độ Combo (combo3, combo6) — mỗi loại 4 hạng.
   *   Combo = expand bộ ba thành hoán vị → match từng hoán vị với kết quả.
   *   unitAmount combo thấp hơn basic vì xác suất trùng cao hơn (nhiều lines).
   * - `plus`: Giải thưởng chế độ Plus (7 hạng: special/first/second/third/fourth/fifth/sixth).
   *   Plus = 2 bộ ba số, phân loại theo logic matchPlus().
   */
  prizeConfig: Max3dPrizeConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy (step 1-3).
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * Các step sau (BuildReport, FinalizeSettle, PublishSettleDaily,
   * PublishPlayerDaily) truy cập qua field này — đọc defensive với optional
   * chain (`financials?.X`) nếu cần.
   */
  financials?: SettleFinancials;

  /**
   * Resettle session context — chỉ tồn tại khi Settle SFN được gọi NESTED
   * từ Resettle SFN (PrepareResettle đã wipe payout/result, snapshot reversal,
   * reset entries về Scheduled).
   *
   * `undefined` ↔ pipeline ở chế độ settle lần đầu (không có gì khác biệt với
   * settle hiện tại).
   *
   * Truyền qua bởi:
   *   - Resettle SFN: `prepare-resettle` step output `resettleContext`, merge
   *     vào input của Settle SFN nested execution.
   *   - PrepareSettle (settle path khi resettle): pass-through field này.
   *
   * Đọc bởi:
   *   - `EnqueueDispatchPayouts` → tag dispatch orders với `metadata.resettleId`,
   *     batch key dùng resettleId để cô lập phiên.
   *   - `FinalizeSettle` → unlock `max3d:resettle:{drawId}` với
   *     `lockOwnerToken`, KHÔNG bump version (transition Settling → Settled).
   */
  resettleContext?: ResettleContext;
}
