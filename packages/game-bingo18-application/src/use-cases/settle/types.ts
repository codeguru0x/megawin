/**
 * Bingo 18 Settle – Shared Types
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
 *   BuildReport → nhận SettleContext (financials có)
 *   FinalizeSettle → nhận SettleContext
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "@megawin/game-bingo18/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Bingo 18 — 3 viên xúc xắc (1-6) và tổng.
 *
 * Dùng bởi SettleEntries để match boards + side bets vs kết quả quay.
 */
export interface BingoDrawResult {
  /** 3 số kết quả (1-6), mỗi số đại diện 1 viên xúc xắc. */
  numbers: number[];
  /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. Dùng cho SumTotal + BigSmallDraw. */
  sum: number;
}

/**
 * Config settle — snapshot từ GlobalConfig tại thời điểm PrepareSettle.
 *
 * Chứa bảng giải thưởng cho tất cả loại cược.
 * Commission được tính trực tiếp từ entry.tenant.commissionAmount (snapshot lúc place-bet)
 * nên không cần defaultCommissionRate ở đây.
 * Config KHÔNG thay đổi giữa các step — snapshot tại thời điểm settle.
 */
export interface BingoSettleConfig {
  /** Bảng giải thưởng cược Số Đơn — match 1/2/3 số. */
  singleNumPrizes: SingleNumPrizes;
  /** Bảng giải thưởng cược Số Đôi — match ≥2 số giống nhau. */
  doubleMatchPrizes: DoubleMatchPrizes;
  /** Bảng giải thưởng cược Bộ Ba — specific/any triple. */
  tripleMatchPrizes: TripleMatchPrizes;
  /** Bảng giải thưởng cược Tổng — match tổng chính xác. */
  sumTotalPrizes: SumTotalPrizes;
  /** Bảng giải thưởng cược Tài/Xỉu/Hoà — big/small/draw. */
  bigSmallDrawPrizes: BigSmallDrawPrizes;
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
 * Bingo 18 KHÔNG có Jackpot — tài chính đơn giản hơn Lotto 5/35.
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /** Tổng doanh thu kỳ quay (VND) = tổng tiền cược của tất cả entries. */
  totalRevenue: number;
  /** Tổng giải thưởng đã trả (VND) — tổng payout tất cả loại cược. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND) — commission đã cam kết trả cho tenant/agent. */
  totalAgentCommission: number;
  /**
   * Phần công ty thu (VND) = totalRevenue - totalPrizes - totalAgentCommission.
   * Có thể âm — Bingo 18 không có Jackpot pool để buffer. Monitor để cảnh báo sớm.
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
   * Token sở hữu lock `bingo18:resettle:{drawId}` — sinh tại BO API cùng lúc
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
   * Build qua `buildResettleLockKey(GameProduct.Bingo18, drawId)` từ
   * `@megawin/game-core/utils` — single source of truth cho format key.
   *
   * Propagate qua context (thay vì rebuild ở mỗi step) để tránh duplicate
   * format string acquire ≠ release → silent bug khi đổi convention.
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
 * │ PrepareSettle         → SettleContext (financials = undefined)   │
 * │ SettleEntries         ← SettleContext (loop, match & payout)    │
 * │ CalculateFinancials   ← SettleContext → SettleFinancials        │
 * │   ↳ SFN merge: settleCtx.financials = result                   │
 * │ SyncTicketSummaries   ← SettleContext (loop, recompute tickets) │
 * │ BuildReport           ← SettleContext (financials có)           │
 * │ FinalizeSettle        ← SettleContext                           │
 * │ DispatchPayouts       ← { drawId } (package riêng)             │
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
   * Bingo 18 có nhiều kỳ/ngày (cách nhau 5 phút).
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã publish — 3 viên xúc xắc + tổng.
   * SettleEntries dùng để match boards + side bets vs kết quả.
   */
  result: BingoDrawResult;

  /**
   * Cấu hình giải thưởng & tỷ lệ tài chính tại thời điểm settle.
   * Snapshot từ GlobalConfig — KHÔNG thay đổi giữa các step.
   */
  config: BingoSettleConfig;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * Các step sau (BuildReport, FinalizeSettle) truy cập qua field này.
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
   *   - `FinalizeSettle` → unlock `bingo18:resettle:{drawId}` với
   *     `lockOwnerToken`, KHÔNG bump version (transition Settling → Settled).
   */
  resettleContext?: ResettleContext;
}
