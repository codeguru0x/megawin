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
 *   FinalizeSettle → nhận SettleContext (có financials)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type { Max3dproDrawResult, Max3dproPrizeConfig } from "@megawin/game-max3dpro/entities";

/** Re-export với tên chuẩn hoá PascalCase cho settle layer. */
export type { Max3dproDrawResult as Max3dProDrawResult, Max3dproPrizeConfig as Max3dProPrizeConfig };

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
  /** Phần công ty thu = revenue - prizes - commission. Có thể âm (công ty chịu lỗ). */
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
   * Token sở hữu lock `max3dpro:resettle:{drawId}` — sinh tại BO API cùng lúc
   * với `resettleId`, đảm bảo chỉ chủ lock mới có quyền release.
   *
   * `FinalizeSettle` (resettle path) gọi `DistributedMutex.release()`
   * với token này để giải phóng lock idempotent (race-safe).
   */
  lockOwnerToken: string;

  /**
   * Lock key của phiên resettle (`{game}:resettle:{drawId}`) — propagate từ
   * `TriggerResettleUseCase` (BO API) qua SFN tới `FinalizeSettle`.
   *
   * Build qua `buildResettleLockKey(GameProduct.Max3dpro, drawId)` từ
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
 * │ PrepareSettle       → SettleContext (financials = undefined)     │
 * │ SettleEntries       ← SettleContext                              │
 * │ SyncTicketSummaries ← SettleContext                              │
 * │ CalculateFinancials ← SettleContext → SettleFinancials           │
 * │   ↳ SFN merge: settleCtx.financials = result                    │
 * │ BuildReport         ← SettleContext (financials có)              │
 * │ FinalizeSettle      ← SettleContext                             │
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
  result: Max3dproDrawResult;

  /**
   * Cấu hình giải thưởng áp dụng cho kỳ này — snapshot tại thời điểm settle.
   * Dùng bởi SettleEntries để tính winAmount cho mỗi pair.
   */
  prizeConfig: Max3dproPrizeConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * Các step sau (BuildReport, FinalizeSettle, PublishSettleDaily,
   * PublishPlayerDaily) truy cập qua field này — đọc defensive với optional
   * chain (`financials?.X`) nếu cần.
   */
  financials?: SettleFinancials;

  /**
   * Marker resettle path — present ⇔ Settle SFN đang được gọi nested từ
   * Resettle SFN.
   *
   * Absent → settle lần đầu, mọi step chạy bình thường (bump version, batchKey
   *   `max3dpro:settle:{drawId}:payout`).
   * Present → resettle path:
   *   - `EnqueueDispatchPayouts` derive batchKey resettle (`max3dpro:resettle:
   *     {drawId}:{resettleId}:payout`).
   *   - `FinalizeSettle` không bump version, transition Settling → Settled,
   *     release business lock qua `lockOwnerToken`.
   */
  resettleContext?: ResettleContext;
}
